import {
  createCheckoutSession,
  getPayment,
  getPaymentByCheckoutSession,
  handleStripeWebhook,
} from '../services/paymentService.js'

export async function checkoutSession(request, response) {
  const result = await createCheckoutSession(
    request.user._id,
    request.params.orderId,
    request.get('Idempotency-Key'),
  )
  response.status(201).json({ success: true, data: result })
}

export async function paymentStatus(request, response) {
  response.json({
    success: true,
    data: { payment: await getPayment(request.user._id, request.params.orderId) },
  })
}

export async function checkoutSessionStatus(request, response) {
  response.json({
    success: true,
    data: await getPaymentByCheckoutSession(request.user._id, request.params.sessionId),
  })
}

export async function stripeWebhook(request, response) {
  const result = await handleStripeWebhook(request.body, request.get('stripe-signature'))
  response.json({ success: true, data: result })
}
