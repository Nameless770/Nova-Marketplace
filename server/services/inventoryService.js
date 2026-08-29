import mongoose from 'mongoose'
import { Inventory } from '../models/Inventory.js'
import { InventoryHistory } from '../models/InventoryHistory.js'
import { InventoryReservation } from '../models/InventoryReservation.js'
import { ProductVariant } from '../models/ProductVariant.js'
import { Seller } from '../models/Seller.js'
import { AppError } from '../utils/errors.js'

async function approvedSeller(userId) {
  const seller = await Seller.findOne({ ownerUserId: userId, status: 'approved' }).lean()
  if (!seller)
    throw new AppError(403, 'SELLER_NOT_APPROVED', 'Only approved sellers can manage inventory')
  return seller
}

async function ownedInventory(userId, variantId, session) {
  const seller = await approvedSeller(userId)
  const inventory = await Inventory.findOne({ variantId, sellerId: seller._id }).session(session)
  if (!inventory) throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory not found')
  return { seller, inventory }
}

function refreshState(inventory) {
  inventory.quantityAvailable = inventory.quantityOnHand - inventory.quantityReserved
  inventory.isLowStock = inventory.quantityAvailable <= inventory.lowStockThreshold
  inventory.status = inventory.quantityAvailable === 0 ? 'out_of_stock' : 'active'
}

async function historyAlreadyApplied(commandId, session) {
  return InventoryHistory.findOne({ commandId }).session(session).lean()
}

async function recordHistory(inventory, command, session) {
  refreshState(inventory)
  await inventory.save({ session })
  await InventoryHistory.create(
    [
      {
        inventoryId: inventory._id,
        sellerId: inventory.sellerId,
        variantId: inventory.variantId,
        commandId: command.commandId,
        type: command.type,
        quantity: command.quantity,
        quantityOnHandAfter: inventory.quantityOnHand,
        quantityReservedAfter: inventory.quantityReserved,
        reason: command.reason,
        reservationId: command.reservationId,
      },
    ],
    { session },
  )
  return inventory.toObject()
}

async function runInventoryCommand(userId, variantId, command) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      const prior = await historyAlreadyApplied(command.commandId, session)
      if (prior) {
        result = await Inventory.findById(prior.inventoryId).session(session).lean()
        return
      }
      const { seller, inventory } = await ownedInventory(userId, variantId, session)
      const filter = { _id: inventory._id, sellerId: seller._id }
      if (command.type === 'remove') {
        filter.quantityOnHand = { $gte: command.quantity }
        filter.$expr = {
          $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, command.quantity],
        }
      }
      if (command.type === 'reserve') filter.quantityAvailable = { $gte: command.quantity }
      const increment =
        command.type === 'add'
          ? { quantityOnHand: command.quantity }
          : command.type === 'remove'
            ? { quantityOnHand: -command.quantity }
            : {
                quantityReserved: command.type === 'release' ? -command.quantity : command.quantity,
              }
      const updated = await Inventory.findOneAndUpdate(
        filter,
        { $inc: { ...increment, version: 1 } },
        { new: true, session },
      )
      if (!updated)
        throw new AppError(
          409,
          command.type === 'reserve' ? 'INSUFFICIENT_STOCK' : 'INVALID_INVENTORY_OPERATION',
          'Inventory operation cannot be completed',
        )
      result = await recordHistory(updated, command, session)
    })
    return result
  } finally {
    await session.endSession()
  }
}

export async function initializeInventory(
  userId,
  variantId,
  { quantityOnHand = 0, lowStockThreshold = 5 },
) {
  const seller = await approvedSeller(userId)
  const variant = await ProductVariant.findOne({ _id: variantId, sellerId: seller._id }).lean()
  if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found')
  if (!Number.isSafeInteger(quantityOnHand) || quantityOnHand < 0)
    throw new AppError(400, 'INVALID_QUANTITY', 'quantityOnHand must be non-negative')
  const inventory = await Inventory.findOneAndUpdate(
    { variantId, sellerId: seller._id },
    {
      $setOnInsert: {
        productId: variant.productId,
        sku: variant.sku,
        quantityOnHand,
        quantityReserved: 0,
        quantityAvailable: quantityOnHand,
        lowStockThreshold,
        isLowStock: quantityOnHand <= lowStockThreshold,
        status: quantityOnHand ? 'active' : 'out_of_stock',
        version: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return inventory
}

export async function addStock(userId, variantId, command) {
  return runInventoryCommand(userId, variantId, { ...command, type: 'add' })
}
export async function removeStock(userId, variantId, command) {
  return runInventoryCommand(userId, variantId, { ...command, type: 'remove' })
}

export async function reserveStock(userId, variantId, command) {
  const session = await mongoose.startSession()
  try {
    let reservation
    let inventoryResult
    await session.withTransaction(async () => {
      const prior = await InventoryHistory.findOne({
        commandId: command.commandId,
        type: 'reserve',
      })
        .session(session)
        .lean()
      if (prior) {
        reservation = await InventoryReservation.findOne({ reservationKey: command.reservationKey })
          .session(session)
          .lean()
        return
      }
      const { seller, inventory } = await ownedInventory(userId, variantId, session)
      const updated = await Inventory.findOneAndUpdate(
        { _id: inventory._id, sellerId: seller._id, quantityAvailable: { $gte: command.quantity } },
        { $inc: { quantityReserved: command.quantity, version: 1 } },
        { new: true, session },
      )
      if (!updated) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock available')
      const [created] = await InventoryReservation.create(
        [
          {
            reservationKey: command.reservationKey,
            inventoryId: updated._id,
            sellerId: seller._id,
            variantId,
            quantity: command.quantity,
            expiresAt: command.expiresAt
              ? new Date(command.expiresAt)
              : new Date(Date.now() + 15 * 60 * 1000),
          },
        ],
        { session },
      )
      inventoryResult = await recordHistory(
        updated,
        { ...command, type: 'reserve', reservationId: created._id },
        session,
      )
      reservation = created.toObject()
    })
    return { reservation, inventory: inventoryResult }
  } finally {
    await session.endSession()
  }
}

async function changeReservation(userId, reservationKey, command, finalStatus) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      const seller = await approvedSeller(userId)
      const reservation = await InventoryReservation.findOne({
        reservationKey,
        sellerId: seller._id,
        status: 'active',
      }).session(session)
      if (!reservation)
        throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Active reservation not found')
      const inventory = await Inventory.findOneAndUpdate(
        {
          _id: reservation.inventoryId,
          sellerId: seller._id,
          quantityReserved: { $gte: reservation.quantity },
          ...(finalStatus === 'committed'
            ? { quantityOnHand: { $gte: reservation.quantity } }
            : {}),
        },
        {
          $inc: {
            quantityReserved: -reservation.quantity,
            ...(finalStatus === 'committed' ? { quantityOnHand: -reservation.quantity } : {}),
            version: 1,
          },
        },
        { new: true, session },
      )
      if (!inventory)
        throw new AppError(409, 'INVALID_RESERVATION', 'Reservation cannot be finalized')
      reservation.status = finalStatus
      reservation.releasedAt = new Date()
      await reservation.save({ session })
      result = await recordHistory(
        inventory,
        {
          ...command,
          type: finalStatus === 'committed' ? 'confirm' : 'release',
          quantity: reservation.quantity,
          reservationId: reservation._id,
        },
        session,
      )
    })
    return result
  } finally {
    await session.endSession()
  }
}

export async function releaseReservation(userId, reservationKey, command) {
  return changeReservation(userId, reservationKey, command, 'released')
}
export async function confirmReservation(userId, reservationKey, command) {
  return changeReservation(userId, reservationKey, command, 'committed')
}

export async function releaseExpiredReservations({ now = new Date(), limit = 100 } = {}) {
  const expiredReservations = await InventoryReservation.find({
    status: 'active',
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1, _id: 1 })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))

  const summary = { scanned: expiredReservations.length, released: 0, skipped: 0 }

  for (const expiredReservation of expiredReservations) {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const reservation = await InventoryReservation.findOneAndUpdate(
          {
            _id: expiredReservation._id,
            status: 'active',
            expiresAt: { $lte: now },
          },
          { $set: { status: 'expired', releasedAt: now } },
          { new: true, session },
        )
        if (!reservation) {
          summary.skipped += 1
          return
        }

        const inventory = await Inventory.findOneAndUpdate(
          {
            _id: reservation.inventoryId,
            quantityReserved: { $gte: reservation.quantity },
          },
          { $inc: { quantityReserved: -reservation.quantity, version: 1 } },
          { new: true, session },
        )
        if (!inventory)
          throw new AppError(409, 'INVALID_RESERVATION', 'Expired reservation cannot be released')

        const priorHistory = await InventoryHistory.findOne({
          commandId: `${reservation.reservationKey}:expire`,
        })
          .session(session)
          .lean()

        if (!priorHistory) {
          await recordHistory(
            inventory,
            {
              commandId: `${reservation.reservationKey}:expire`,
              type: 'release',
              quantity: reservation.quantity,
              reason: 'Reservation expired',
              reservationId: reservation._id,
            },
            session,
          )
        } else {
          refreshState(inventory)
          await inventory.save({ session })
        }
        summary.released += 1
      })
    } finally {
      await session.endSession()
    }
  }

  return summary
}

export async function listInventory(userId, query) {
  const seller = await approvedSeller(userId)
  const filter = { sellerId: seller._id }
  if (query.status) filter.status = query.status
  if (query.isLowStock === 'true') filter.isLowStock = true
  return Inventory.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(Math.min(Number(query.limit) || 50, 100))
    .lean()
}

export async function inventoryHistory(userId, variantId, query) {
  const seller = await approvedSeller(userId)
  const filter = { sellerId: seller._id, variantId }
  return InventoryHistory.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(Number(query.limit) || 50, 100))
    .lean()
}
