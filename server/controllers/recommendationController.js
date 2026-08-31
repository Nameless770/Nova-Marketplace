import {
  listRecentlyViewed,
  recommendForUser,
  similarProducts,
} from '../services/recommendationService.js'

export async function forYou(request, response) {
  response.json({
    success: true,
    data: await recommendForUser(request.user._id, { limit: request.query.limit }),
  })
}

export async function similar(request, response) {
  response.json({
    success: true,
    data: await similarProducts(request.params.productId, { limit: request.query.limit }),
  })
}

export async function recentlyViewed(request, response) {
  response.json({
    success: true,
    data: await listRecentlyViewed(request.user._id, { limit: request.query.limit }),
  })
}
