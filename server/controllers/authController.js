import {
  addAddress,
  changePassword,
  deleteAccount,
  deleteAddress,
  getCurrentUser,
  loginUser,
  registerUser,
  updateAccountEmail,
  updateAddress,
  updateProfile,
} from '../services/authService.js'

export async function register(request, response) {
  response.status(201).json({ success: true, data: await registerUser(request.body) })
}

export async function login(request, response) {
  response.json({ success: true, data: await loginUser(request.body) })
}

export async function logout(_request, response) {
  response.status(204).send()
}

export async function currentUser(request, response) {
  response.json({ success: true, data: { user: await getCurrentUser(request.user._id) } })
}

export async function updateCurrentProfile(request, response) {
  const user = await updateProfile(request.user._id, request.body)
  response.json({ success: true, data: { user } })
}

export async function updateCurrentAccount(request, response) {
  const user = await updateAccountEmail(
    request.user._id,
    request.body.email,
    request.body.currentPassword,
  )
  response.json({ success: true, data: { user } })
}

export async function updateCurrentPassword(request, response) {
  await changePassword(request.user._id, request.body.currentPassword, request.body.newPassword)
  response.status(204).send()
}

export async function createCurrentAddress(request, response) {
  const address = await addAddress(request.user._id, request.body)
  response.status(201).json({ success: true, data: { address } })
}

export async function updateCurrentAddress(request, response) {
  const address = await updateAddress(request.user._id, request.params.addressId, request.body)
  response.json({ success: true, data: { address } })
}

export async function deleteCurrentAddress(request, response) {
  await deleteAddress(request.user._id, request.params.addressId)
  response.status(204).send()
}

export async function deleteCurrentAccount(request, response) {
  await deleteAccount(request.user._id, request.body.currentPassword)
  response.status(204).send()
}
