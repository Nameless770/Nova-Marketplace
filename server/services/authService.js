import bcrypt from 'bcrypt'
import { User } from '../models/User.js'
import { AppError } from '../utils/errors.js'
import { createAccessToken } from '../utils/jwt.js'

const SALT_ROUNDS = 12

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    sellerApprovalStatus: user.sellerApprovalStatus,
  }
}

export async function registerUser({ email, password, firstName, lastName }) {
  const normalizedEmail = email.trim().toLowerCase()
  const existingUser = await User.exists({ email: normalizedEmail })
  if (existingUser)
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists')

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await User.create({ email: normalizedEmail, passwordHash, firstName, lastName })
  return { user: publicUser(user), accessToken: createAccessToken(user) }
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash')
  const validPassword = user && (await bcrypt.compare(password, user.passwordHash))
  if (!validPassword || user.status !== 'active')
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')

  return { user: publicUser(user), accessToken: createAccessToken(user) }
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId).lean()
  if (!user || user.status !== 'active') throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
  return publicUser(user)
}

async function findUserWithPassword(userId) {
  const user = await User.findById(userId).select('+passwordHash')
  if (!user || user.status !== 'active') throw new AppError(404, 'USER_NOT_FOUND', 'User not found')
  return user
}

export async function updateProfile(userId, { firstName, lastName, phone }) {
  const user = await findUserWithPassword(userId)
  if (firstName !== undefined) user.firstName = firstName.trim()
  if (lastName !== undefined) user.lastName = lastName.trim()
  if (phone !== undefined) user.phone = phone.trim() || undefined
  await user.save()
  return publicUser(user)
}

export async function updateAccountEmail(userId, email, currentPassword) {
  const user = await findUserWithPassword(userId)
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
  }
  const normalizedEmail = email.trim().toLowerCase()
  const existingUser = await User.exists({ _id: { $ne: userId }, email: normalizedEmail })
  if (existingUser)
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists')
  user.email = normalizedEmail
  user.emailVerifiedAt = undefined
  await user.save()
  return publicUser(user)
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await findUserWithPassword(userId)
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
  }
  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  await user.save()
}

export async function addAddress(userId, address) {
  const user = await findUserWithPassword(userId)
  if (user.addresses.length >= 10)
    throw new AppError(409, 'ADDRESS_LIMIT_REACHED', 'Address limit reached')
  if (address.isDefault) user.addresses.forEach((item) => (item.isDefault = false))
  user.addresses.push(address)
  await user.save()
  return user.addresses.at(-1)
}

export async function updateAddress(userId, addressId, address) {
  const user = await findUserWithPassword(userId)
  const current = user.addresses.id(addressId)
  if (!current) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found')
  if (address.isDefault) user.addresses.forEach((item) => (item.isDefault = false))
  Object.assign(current, address)
  await user.save()
  return current
}

export async function deleteAddress(userId, addressId) {
  const user = await findUserWithPassword(userId)
  const address = user.addresses.id(addressId)
  if (!address) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found')
  const wasDefault = address.isDefault
  address.deleteOne()
  if (wasDefault && user.addresses.length > 1)
    user.addresses.find((item) => item._id.toString() !== addressId).isDefault = true
  await user.save()
}

export async function deleteAccount(userId, currentPassword) {
  const user = await findUserWithPassword(userId)
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
  }
  user.status = 'deleted'
  user.email = `deleted+${user._id}@invalid.local`
  user.passwordHash = await bcrypt.hash(`${user._id}:${Date.now()}`, SALT_ROUNDS)
  user.firstName = 'Deleted'
  user.lastName = 'User'
  user.phone = undefined
  user.addresses = []
  await user.save()
}
