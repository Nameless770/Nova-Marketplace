import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { catalogApi, sellerCatalogApi } from '../../services/api.js'
import { formatMoney } from '../../utils/format.js'

// Prices are entered in major units for humans and sent as integer minor units,
// which is the only representation the API accepts.
function toMinor(value) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

const emptyProduct = {
  title: '',
  description: '',
  brand: '',
  categoryIds: [],
  imageUrl: '',
}

export function SellerProductFormPage() {
  const { productId } = useParams()
  const isEdit = Boolean(productId)
  const navigate = useNavigate()

  const loadCategories = useCallback(() => catalogApi.getCategories(), [])
  const { data: categoryData, status: categoryStatus } = useApiQuery(loadCategories, null)

  const loadProduct = useCallback(
    () =>
      isEdit ? sellerCatalogApi.getProduct(productId) : Promise.resolve({ data: { data: null } }),
    [isEdit, productId],
  )
  const { data: productData, status: productStatus, reload } = useApiQuery(loadProduct, null)

  if (isEdit && (productStatus === 'loading' || productStatus === 'idle'))
    return <LoadingState label="Loading product" />
  if (categoryStatus === 'loading' || categoryStatus === 'idle')
    return <LoadingState label="Loading categories" />

  const categories = categoryData?.categories ?? categoryData?.items ?? []
  const existing = productData?.product ?? null

  return (
    <ProductForm
      key={existing?._id ?? 'new'}
      isEdit={isEdit}
      existing={existing}
      categories={categories}
      onDone={reload}
      navigate={navigate}
    />
  )
}

function ProductForm({ isEdit, existing, categories, onDone, navigate }) {
  const [form, setForm] = useState(() =>
    existing
      ? {
          title: existing.title ?? '',
          description: existing.description ?? '',
          brand: existing.brand ?? '',
          categoryIds: (existing.categoryIds ?? []).map((c) => (typeof c === 'string' ? c : c._id)),
          imageUrl: existing.images?.[0]?.url ?? '',
        }
      : emptyProduct,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedId, setSavedId] = useState(existing?._id ?? null)

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  function toggleCategory(id) {
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(id)
        ? current.categoryIds.filter((c) => c !== id)
        : [...current.categoryIds, id].slice(0, 5),
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        brand: form.brand.trim(),
        categoryIds: form.categoryIds,
        images: [{ url: form.imageUrl.trim(), alt: form.title.trim() }],
        // Pricing lives on variants; this product always has at least one.
        hasVariants: true,
      }
      if (savedId) {
        await sellerCatalogApi.updateProduct(savedId, payload)
        await onDone()
      } else {
        const response = await sellerCatalogApi.createProduct(payload)
        setSavedId(response.data.data.product._id)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const canSubmit =
    form.title.trim().length >= 2 &&
    form.description.trim().length >= 2 &&
    form.categoryIds.length >= 1 &&
    form.imageUrl.trim().length > 0

  return (
    <section>
      <p className="eyebrow">Products</p>
      <h2>{isEdit || savedId ? 'Edit product' : 'New product'}</h2>
      <p className="seller-subtle">
        Products start as a draft. Add at least one variant with stock, then submit for review.
      </p>

      <form onSubmit={submit} className="seller-form">
        <label>
          Title
          <input
            value={form.title}
            minLength={2}
            maxLength={180}
            onChange={(e) => set('title', e.target.value)}
            required
          />
        </label>
        <label>
          Description
          <textarea
            rows={5}
            maxLength={10000}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            required
          />
        </label>
        <label>
          Brand
          <input
            value={form.brand}
            maxLength={120}
            onChange={(e) => set('brand', e.target.value)}
          />
        </label>
        <label>
          Image URL
          <input
            value={form.imageUrl}
            maxLength={2048}
            placeholder="https://..."
            onChange={(e) => set('imageUrl', e.target.value)}
            required
          />
        </label>

        <fieldset className="category-picker">
          <legend>Categories (1 to 5)</legend>
          {categories.length === 0 ? (
            <p className="seller-subtle">
              No categories exist yet. An admin must create one first.
            </p>
          ) : (
            categories.map((category) => (
              <label key={category._id} className="inline-toggle">
                <input
                  type="checkbox"
                  checked={form.categoryIds.includes(category._id)}
                  onChange={() => toggleCategory(category._id)}
                />
                {category.name}
              </label>
            ))
          )}
        </fieldset>

        {error && <ErrorState message={error} />}

        <button className="primary-action" disabled={!canSubmit || saving}>
          {saving ? 'Saving' : savedId ? 'Save changes' : 'Create draft'}
        </button>
        <button type="button" className="text-button" onClick={() => navigate('/seller/products')}>
          Back to products
        </button>
      </form>

      {savedId && <VariantManager productId={savedId} existing={existing} />}
    </section>
  )
}

/**
 * Variants and their stock. A product cannot be submitted for review without at
 * least one, because there would be nothing to buy.
 */
function VariantManager({ productId, existing }) {
  const load = useCallback(() => sellerCatalogApi.getProduct(productId), [productId])
  const { data, status, error, reload } = useApiQuery(load, null)
  const [form, setForm] = useState({ sku: '', name: '', price: '', quantity: '' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const variants = data?.product?.variants ?? []
  const productStatus = data?.product?.status ?? existing?.status

  async function addVariant(event) {
    event.preventDefault()
    const priceMinor = toMinor(form.price)
    const quantity = Number.parseInt(form.quantity, 10)
    if (priceMinor === null) {
      setActionError('Enter a valid price')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const created = await sellerCatalogApi.addVariant(productId, {
        sku: form.sku.trim(),
        name: form.name.trim(),
        priceMinor,
      })
      const variantId = created.data.data.variant._id
      // Stock is a separate concern from the variant itself, so it is set
      // through the inventory service rather than smuggled into the variant.
      await sellerCatalogApi.initInventory(variantId, {
        quantityOnHand: Number.isFinite(quantity) ? quantity : 0,
        lowStockThreshold: 5,
      })
      setForm({ sku: '', name: '', price: '', quantity: '' })
      await reload()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitForReview() {
    setBusy(true)
    setActionError(null)
    try {
      await sellerCatalogApi.submitProduct(productId)
      setSubmitted(true)
      await reload()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="variant-manager">
      <h3>Variants and stock</h3>

      {(status === 'loading' || status === 'idle') && <LoadingState label="Loading variants" />}
      {status === 'error' && <ErrorState message={error} onRetry={reload} />}

      {status === 'success' && (
        <>
          {variants.length === 0 ? (
            <p className="seller-subtle">
              No variants yet. Add one below so the product can be sold.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="seller-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => (
                    <tr key={variant._id}>
                      <td>{variant.sku}</td>
                      <td>{variant.name}</td>
                      <td>{formatMoney(variant.currentPriceMinor, 'USD')}</td>
                      <td>
                        <span className={`pill pill-${variant.status}`}>{variant.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={addVariant} className="inline-form">
            <input
              placeholder="SKU"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              required
            />
            <input
              placeholder="Name (e.g. Large / Black)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
            <input
              type="number"
              min="0"
              placeholder="Stock"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
            <button className="secondary-action" disabled={busy}>
              {busy ? 'Adding' : 'Add variant'}
            </button>
          </form>

          {actionError && <ErrorState message={actionError} />}

          <div className="seller-toolbar">
            <span className="seller-subtle">
              Status: <strong>{productStatus}</strong>
            </span>
            {productStatus === 'draft' && (
              <button
                type="button"
                className="primary-action"
                disabled={busy || variants.length === 0}
                onClick={submitForReview}
              >
                Submit for review
              </button>
            )}
            {submitted && (
              <span className="seller-saved">Submitted — an admin will review it.</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
