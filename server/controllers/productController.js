import { recordProductView } from '../services/recommendationService.js'
import {
  createCategory,
  createProduct,
  createVariant,
  getProduct,
  getSellerProduct,
  listCategories,
  listAdminProducts,
  moderateProduct,
  removeProduct,
  removeProductAsAdmin,
  removeVariant,
  submitProduct,
  updateProduct,
  updateVariant,
} from '../services/productService.js'
import { searchProducts } from '../services/searchService.js'
import { getSellerProducts } from '../services/sellerService.js'

export async function categories(request, response) {
  response.json({
    success: true,
    data: { categories: await listCategories(request.query.parentId) },
  })
}

export async function category(request, response) {
  response.json({
    success: true,
    data: { categories: await listCategories(request.params.categoryId) },
  })
}

export async function createCategoryController(request, response) {
  response
    .status(201)
    .json({ success: true, data: { category: await createCategory(request.body) } })
}

export async function products(request, response) {
  response.json({ success: true, data: await searchProducts(request.query) })
}

export async function categoryProducts(request, response) {
  response.json({
    success: true,
    data: await searchProducts({ ...request.query, categoryId: request.params.categoryId }),
  })
}

export async function product(request, response) {
  const found = await getProduct(request.params.productId)
  // Fire-and-forget: view tracking feeds recommendations and must never delay
  // or fail product browsing.
  if (request.user) void recordProductView(request.user._id, found)
  response.json({ success: true, data: { product: found } })
}

export async function sellerProduct(request, response) {
  response.json({
    success: true,
    data: { product: await getSellerProduct(request.user._id, request.params.productId) },
  })
}

export async function sellerProducts(request, response) {
  // Deliberately not searchProducts: that pins status to 'active', so a seller
  // could never see their own drafts, and it derives the seller from a
  // denormalised field that fails open to the whole catalogue when unset.
  // getSellerProducts resolves the seller from the Seller collection instead.
  response.json({
    success: true,
    data: await getSellerProducts(request.user._id, request.query),
  })
}

export async function createSellerProduct(request, response) {
  response
    .status(201)
    .json({ success: true, data: { product: await createProduct(request.user._id, request.body) } })
}

export async function updateSellerProduct(request, response) {
  response.json({
    success: true,
    data: {
      product: await updateProduct(request.user._id, request.params.productId, request.body),
    },
  })
}

export async function removeSellerProduct(request, response) {
  await removeProduct(request.user._id, request.params.productId)
  response.status(204).send()
}

export async function submitSellerProduct(request, response) {
  response.json({
    success: true,
    data: { product: await submitProduct(request.user._id, request.params.productId) },
  })
}

export async function createSellerVariant(request, response) {
  response.status(201).json({
    success: true,
    data: {
      variant: await createVariant(request.user._id, request.params.productId, request.body),
    },
  })
}

export async function updateSellerVariant(request, response) {
  response.json({
    success: true,
    data: {
      variant: await updateVariant(
        request.user._id,
        request.params.productId,
        request.params.variantId,
        request.body,
      ),
    },
  })
}

export async function removeSellerVariant(request, response) {
  await removeVariant(request.user._id, request.params.productId, request.params.variantId)
  response.status(204).send()
}

export async function moderate(request, response) {
  response.json({
    success: true,
    data: {
      product: await moderateProduct(request.params.productId, request.body.status, {
        actorId: request.user._id,
        ip: request.ip,
      }),
    },
  })
}

export async function adminProducts(request, response) {
  response.json({ success: true, data: await listAdminProducts(request.query) })
}

export async function removeAdminProduct(request, response) {
  await removeProductAsAdmin(request.params.productId)
  response.status(204).send()
}
