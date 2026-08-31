import {
  createRefund,
  listOrderRefunds,
  refundableSummary,
  submitRefundToProvider,
} from '../services/refundService.js'

export async function create(request, response) {
  const { refund, idempotentReplay } = await createRefund(
    request.user,
    request.params.orderId,
    { ...request.body, ip: request.ip },
    request.get('idempotency-key'),
  )

  // The refund is already recorded and the amount reserved. If the provider call
  // fails the refund stays pending and is retried out of band, so the response
  // still reports success for the recorded refund.
  let submitted = refund
  let providerError = null
  if (!idempotentReplay) {
    try {
      submitted = await submitRefundToProvider(refund._id)
    } catch (error) {
      providerError = error.code || 'PROVIDER_UNAVAILABLE'
    }
  }

  response.status(idempotentReplay ? 200 : 201).json({
    success: true,
    data: { refund: submitted, idempotentReplay, providerError },
  })
}

export async function forOrder(request, response) {
  response.json({
    success: true,
    data: await listOrderRefunds(request.user, request.params.orderId),
  })
}

export async function refundable(request, response) {
  response.json({
    success: true,
    data: await refundableSummary(request.user, request.params.orderId),
  })
}
