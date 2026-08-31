import {
  createReview,
  deleteReview,
  listProductReviews,
  listReviewsForModeration,
  moderateReview,
  updateReview,
} from '../services/reviewService.js'

export async function productReviews(request, response) {
  response.json({
    success: true,
    data: await listProductReviews(request.params.productId, request.query),
  })
}

export async function createCustomerReview(request, response) {
  const review = await createReview(request.user._id, request.params.productId, request.body)
  response.status(201).json({ success: true, data: { review } })
}

export async function updateCustomerReview(request, response) {
  const review = await updateReview(request.user._id, request.params.reviewId, request.body)
  response.json({ success: true, data: { review } })
}

export async function deleteCustomerReview(request, response) {
  await deleteReview(request.user._id, request.params.reviewId)
  response.status(204).send()
}

export async function moderationReviews(request, response) {
  response.json({ success: true, data: { reviews: await listReviewsForModeration(request.query) } })
}

export async function moderate(request, response) {
  const review = await moderateReview(
    request.params.reviewId,
    request.body.status,
    request.body.reason,
    { actorId: request.user._id, ip: request.ip },
  )
  response.json({ success: true, data: { review } })
}
