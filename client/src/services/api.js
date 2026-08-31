import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

let accessToken = null
let unauthorizedHandler = null

export function setAccessToken(token) {
  accessToken = token
}

// Lets AuthContext clear an expired session when any authenticated request is rejected.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url ?? ''
    const isCredentialAttempt = ['/auth/login', '/auth/register'].some((path) =>
      requestUrl.includes(path),
    )
    if (error.response?.status === 401 && !isCredentialAttempt) unauthorizedHandler?.()

    const message = error.response?.data?.error?.message || error.message || 'Request failed'
    return Promise.reject(new Error(message))
  },
)

export const authApi = {
  getCurrentUser: () => api.get('/auth/me'),
  login: (credentials) => api.post('/auth/login', credentials),
  register: (details) => api.post('/auth/register', details),
  logout: () => api.post('/auth/logout'),
}

export const catalogApi = {
  searchProducts: (params) => api.get('/products', { params }),
  getProduct: (productId) => api.get(`/products/${productId}`),
  getCategories: () => api.get('/categories'),
}

export const cartApi = {
  get: () => api.get('/cart'),
  add: (item) => api.post('/cart/items', item),
  update: (itemId, quantity) => api.patch(`/cart/items/${itemId}`, { quantity }),
  remove: (itemId) => api.delete(`/cart/items/${itemId}`),
  clear: () => api.delete('/cart'),
}

export const wishlistApi = {
  get: () => api.get('/wishlist'),
  add: (item) => api.post('/wishlist/items', item),
  remove: (itemId) => api.delete(`/wishlist/items/${itemId}`),
}

export const orderApi = {
  list: (params) => api.get('/orders', { params }),
  get: (orderId) => api.get(`/orders/${orderId}`),
  create: (details, idempotencyKey) =>
    api.post('/orders', details, { headers: { 'Idempotency-Key': idempotencyKey } }),
}

export const paymentApi = {
  createCheckout: (orderId, idempotencyKey) =>
    api.post(
      `/payments/orders/${orderId}/checkout-session`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),
  getStatus: (orderId) => api.get(`/payments/orders/${orderId}`),
  getCheckoutSession: (sessionId) => api.get(`/payments/checkout-sessions/${sessionId}`),
}

export const sellerApi = {
  getStore: () => api.get('/sellers/me'),
  updateStore: (details) => api.patch('/sellers/me', details),
  getDashboard: () => api.get('/sellers/dashboard'),
  getAnalytics: (params) => api.get('/sellers/analytics', { params }),
  getProducts: (params) => api.get('/sellers/products', { params }),
  getOrders: (params) => api.get('/sellers/orders', { params }),
  getReviews: (params) => api.get('/sellers/reviews', { params }),
  getInventory: (params) => api.get('/inventory', { params }),
  updateOrderStatus: (sellerOrderId, status) =>
    api.patch(`/orders/seller/${sellerOrderId}/status`, { status }),
}

export const adminApi = {
  getOverview: (params) => api.get('/admin/overview', { params }),
  getUsers: (params) => api.get('/admin/users', { params }),
  setUserStatus: (userId, status) => api.patch(`/admin/users/${userId}/status`, { status }),
  getSellers: (params) => api.get('/admin/sellers', { params }),
  setSellerStatus: (sellerId, status, reason) =>
    api.patch(`/admin/sellers/${sellerId}/status`, { status, reason }),
  getOrders: (params) => api.get('/admin/orders', { params }),
  getProducts: (params) => api.get('/admin/products', { params }),
  setProductStatus: (productId, status) =>
    api.patch(`/admin/products/${productId}/status`, { status }),
  getInventory: (params) => api.get('/admin/inventory', { params }),
  getReviews: (params) => api.get('/admin/reviews', { params }),
  setReviewStatus: (reviewId, status, reason) =>
    api.patch(`/admin/reviews/${reviewId}/status`, { status, reason }),
  getCategories: (params) => api.get('/admin/categories', { params }),
  createCategory: (details) => api.post('/categories', details),
  updateCategory: (categoryId, details) => api.patch(`/admin/categories/${categoryId}`, details),
  getRefundable: (orderId) => api.get(`/refunds/orders/${orderId}/refundable`),
  getRefunds: (orderId) => api.get(`/refunds/orders/${orderId}`),
  createRefund: (orderId, details, idempotencyKey) =>
    api.post(`/refunds/orders/${orderId}`, details, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  getCoupons: (params) => api.get('/admin/coupons', { params }),
  setCouponStatus: (couponId, status) => api.patch(`/admin/coupons/${couponId}/status`, { status }),
}

export const notificationApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (notificationId) => api.patch(`/notifications/${notificationId}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
}

export const couponApi = {
  validate: (code) => api.post('/coupons/validate', { code }),
}

export const profileApi = {
  update: (details) => api.patch('/users/me', details),
  updateAccount: (details) => api.patch('/users/me/account', details),
  changePassword: (details) => api.patch('/users/me/password', details),
  addAddress: (address) => api.post('/users/me/addresses', address),
  updateAddress: (id, address) => api.patch(`/users/me/addresses/${id}`, address),
  deleteAddress: (id) => api.delete(`/users/me/addresses/${id}`),
  deleteAccount: (currentPassword) => api.delete('/users/me', { data: { currentPassword } }),
}

export const reviewApi = {
  list: (productId, params) => api.get(`/reviews/products/${productId}`, { params }),
}

export const qaApi = {
  list: (productId, params) => api.get(`/qa/products/${productId}/questions`, { params }),
}
