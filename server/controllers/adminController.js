import { listAuditLogs } from '../services/auditService.js'
import {
  getPlatformOverview,
  listPlatformCategories,
  listPlatformCoupons,
  listPlatformInventory,
  listPlatformOrders,
  listPlatformProducts,
  listPlatformReviews,
  listPlatformSellers,
  listPlatformUsers,
  setCouponStatus,
  setUserStatus,
  updatePlatformCategory,
} from '../services/adminService.js'

export async function overview(request, response) {
  response.json({ success: true, data: await getPlatformOverview(request.query) })
}

export async function users(request, response) {
  response.json({ success: true, data: await listPlatformUsers(request.query) })
}

export async function userStatus(request, response) {
  const user = await setUserStatus(request.user._id, request.params.userId, request.body.status, {
    ip: request.ip,
  })
  response.json({ success: true, data: { user } })
}

export async function sellers(request, response) {
  response.json({ success: true, data: await listPlatformSellers(request.query) })
}

export async function products(request, response) {
  response.json({ success: true, data: await listPlatformProducts(request.query) })
}

export async function reviews(request, response) {
  response.json({ success: true, data: await listPlatformReviews(request.query) })
}

export async function orders(request, response) {
  response.json({ success: true, data: await listPlatformOrders(request.query) })
}

export async function inventory(request, response) {
  response.json({ success: true, data: await listPlatformInventory(request.query) })
}

export async function categories(request, response) {
  response.json({ success: true, data: await listPlatformCategories(request.query) })
}

export async function updateCategory(request, response) {
  const category = await updatePlatformCategory(request.params.categoryId, request.body)
  response.json({ success: true, data: { category } })
}

export async function coupons(request, response) {
  response.json({ success: true, data: await listPlatformCoupons(request.query) })
}

export async function couponStatus(request, response) {
  const coupon = await setCouponStatus(request.params.couponId, request.body.status, {
    actorId: request.user._id,
    ip: request.ip,
  })
  response.json({ success: true, data: { coupon } })
}

export async function auditLogs(request, response) {
  response.json({ success: true, data: await listAuditLogs(request.query) })
}
