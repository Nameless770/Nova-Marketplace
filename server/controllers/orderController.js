import {
  createOrderFromCart,
  getCustomerOrder,
  getSellerOrder,
  listCustomerOrders,
  listSellerOrders,
  updateSellerOrderStatus,
} from '../services/orderService.js'

export async function create(request, response) {
  response
    .status(201)
    .json({ success: true, data: await createOrderFromCart(request.user._id, request.body) })
}

export async function customerOrders(request, response) {
  response.json({ success: true, data: await listCustomerOrders(request.user._id, request.query) })
}

export async function customerOrder(request, response) {
  response.json({
    success: true,
    data: await getCustomerOrder(request.user._id, request.params.orderId),
  })
}

export async function sellerOrders(request, response) {
  response.json({ success: true, data: await listSellerOrders(request.user._id, request.query) })
}

export async function sellerOrder(request, response) {
  response.json({
    success: true,
    data: await getSellerOrder(request.user._id, request.params.sellerOrderId),
  })
}

export async function sellerOrderStatus(request, response) {
  const order = await updateSellerOrderStatus(
    request.user._id,
    request.params.sellerOrderId,
    request.body.status,
  )
  response.json({ success: true, data: { sellerOrder: order } })
}
