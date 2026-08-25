import {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '../services/cartService.js'

export async function currentCart(request, response) {
  response.json({ success: true, data: { cart: await getCart(request.user._id) } })
}

export async function addItem(request, response) {
  response
    .status(201)
    .json({ success: true, data: { cart: await addCartItem(request.user._id, request.body) } })
}

export async function updateItem(request, response) {
  response.json({
    success: true,
    data: {
      cart: await updateCartItem(request.user._id, request.params.itemId, request.body.quantity),
    },
  })
}

export async function removeItem(request, response) {
  response.json({
    success: true,
    data: { cart: await removeCartItem(request.user._id, request.params.itemId) },
  })
}

export async function emptyCart(request, response) {
  response.json({ success: true, data: { cart: await clearCart(request.user._id) } })
}
