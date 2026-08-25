import {
  addStock,
  confirmReservation,
  initializeInventory,
  inventoryHistory,
  listInventory,
  releaseReservation,
  removeStock,
  reserveStock,
} from '../services/inventoryService.js'

export async function initialize(request, response) {
  const inventory = await initializeInventory(
    request.user._id,
    request.params.variantId,
    request.body,
  )
  response.status(201).json({ success: true, data: { inventory } })
}

export async function list(request, response) {
  response.json({
    success: true,
    data: { inventory: await listInventory(request.user._id, request.query) },
  })
}

export async function history(request, response) {
  response.json({
    success: true,
    data: {
      history: await inventoryHistory(request.user._id, request.params.variantId, request.query),
    },
  })
}

export async function add(request, response) {
  response.json({
    success: true,
    data: { inventory: await addStock(request.user._id, request.params.variantId, request.body) },
  })
}

export async function remove(request, response) {
  response.json({
    success: true,
    data: {
      inventory: await removeStock(request.user._id, request.params.variantId, request.body),
    },
  })
}

export async function reserve(request, response) {
  response.json({
    success: true,
    data: await reserveStock(request.user._id, request.params.variantId, request.body),
  })
}

export async function release(request, response) {
  response.json({
    success: true,
    data: {
      inventory: await releaseReservation(
        request.user._id,
        request.body.reservationKey,
        request.body,
      ),
    },
  })
}

export async function confirm(request, response) {
  response.json({
    success: true,
    data: {
      inventory: await confirmReservation(
        request.user._id,
        request.body.reservationKey,
        request.body,
      ),
    },
  })
}
