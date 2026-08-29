import { createCoupon, listCoupons, validateCartCoupon } from '../services/couponService.js'

export async function validate(request, response) {
  response.json({
    success: true,
    data: await validateCartCoupon(request.user._id, request.body.code),
  })
}

export async function createSellerCoupon(request, response) {
  response.status(201).json({
    success: true,
    data: { coupon: await createCoupon(request.user._id, request.body, 'seller') },
  })
}

export async function sellerCoupons(request, response) {
  response.json({
    success: true,
    data: { coupons: await listCoupons(request.user._id, 'seller', request.query) },
  })
}

export async function createPlatformCoupon(request, response) {
  response.status(201).json({
    success: true,
    data: { coupon: await createCoupon(request.user._id, request.body, 'platform') },
  })
}

export async function platformCoupons(request, response) {
  response.json({
    success: true,
    data: { coupons: await listCoupons(request.user._id, 'platform', request.query) },
  })
}
