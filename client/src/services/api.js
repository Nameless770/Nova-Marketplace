import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

let accessToken = null

export function setAccessToken(token) {
  accessToken = token
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
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
  create: (details) => api.post('/orders', details),
}

export const paymentApi = {
  createCheckout: (orderId, idempotencyKey) => api.post(`/payments/orders/${orderId}/checkout-session`, {}, { headers: { 'Idempotency-Key': idempotencyKey } }),
  getStatus: (orderId) => api.get(`/payments/orders/${orderId}`),
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
