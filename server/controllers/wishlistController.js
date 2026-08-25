import { addWishlistItem, getWishlist, removeWishlistItem } from '../services/wishlistService.js'

export async function currentWishlist(request, response) {
  response.json({ success: true, data: { wishlist: await getWishlist(request.user._id) } })
}

export async function addItem(request, response) {
  response.status(201).json({
    success: true,
    data: { wishlist: await addWishlistItem(request.user._id, request.body) },
  })
}

export async function removeItem(request, response) {
  response.json({
    success: true,
    data: { wishlist: await removeWishlistItem(request.user._id, request.params.itemId) },
  })
}
