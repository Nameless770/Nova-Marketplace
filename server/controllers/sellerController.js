import {
  applyAsSeller,
  getMyApplication,
  getMySeller,
  getSellerAnalytics,
  getSellerDashboard,
  getSellerOrders,
  moderateSeller,
  updateMySeller,
} from '../services/sellerService.js'
import { searchProducts } from '../services/searchService.js'

export async function createApplication(request, response) {
  const application = await applyAsSeller(request.user._id, request.body)
  response.status(201).json({ success: true, data: { application } })
}

export async function myApplication(request, response) {
  response.json({ success: true, data: { application: await getMyApplication(request.user._id) } })
}

export async function mySeller(request, response) {
  response.json({ success: true, data: { seller: await getMySeller(request.user._id) } })
}

export async function updateSeller(request, response) {
  const seller = await updateMySeller(request.user._id, request.body)
  response.json({ success: true, data: { seller } })
}

export async function dashboard(request, response) {
  response.json({ success: true, data: await getSellerDashboard(request.user._id) })
}

export async function products(request, response) {
  response.json({
    success: true,
    data: await searchProducts({ ...request.query, sellerId: request.user.sellerId }),
  })
}

export async function orders(request, response) {
  response.json({ success: true, data: await getSellerOrders(request.user._id, request.query) })
}

export async function analytics(request, response) {
  response.json({ success: true, data: await getSellerAnalytics(request.user._id, request.query) })
}

export async function moderate(request, response) {
  const seller = await moderateSeller(
    request.params.sellerId,
    request.user._id,
    request.body.status,
    request.body.reason,
  )
  response.json({ success: true, data: { seller } })
}
