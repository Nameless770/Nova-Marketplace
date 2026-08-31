import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { sellerApi } from '../../services/api.js'

// Initialised from props on mount; the parent remounts it via `key` whenever a
// different store loads, so no effect is needed to sync server state into form state.
function StoreProfileForm({ seller, onSaved }) {
  const [form, setForm] = useState({
    storeName: seller.storeName ?? '',
    description: seller.description ?? '',
    imageUrl: seller.image?.url ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await sellerApi.updateStore({
        storeName: form.storeName,
        description: form.description,
        ...(form.imageUrl.trim() ? { image: { url: form.imageUrl.trim() } } : {}),
      })
      setSaved(true)
      await onSaved()
    } catch (requestError) {
      setSaveError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="seller-form">
      <label>
        Store name
        <input
          value={form.storeName}
          minLength={2}
          maxLength={120}
          onChange={(event) => setForm({ ...form, storeName: event.target.value })}
          required
        />
      </label>
      <label>
        Description
        <textarea
          rows={5}
          maxLength={2000}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>
      <label>
        Logo image URL
        <input
          value={form.imageUrl}
          maxLength={2048}
          placeholder="https://..."
          onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
        />
      </label>
      {saveError && <ErrorState message={saveError} />}
      {saved && <p className="seller-saved">Store profile saved.</p>}
      <button className="primary-action" disabled={saving}>
        {saving ? 'Saving' : 'Save changes'}
      </button>
    </form>
  )
}

export function SellerStorePage() {
  const load = useCallback(() => sellerApi.getStore(), [])
  const { data, status, error, reload } = useApiQuery(load, null)

  if (status === 'loading' || status === 'idle') return <LoadingState label="Loading store" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const seller = data?.seller
  if (!seller) return <ErrorState message="Store profile not found" onRetry={reload} />

  return (
    <section>
      <p className="eyebrow">Store profile</p>
      <h2>Your storefront</h2>
      <p className="seller-subtle">
        Status <strong>{seller.status}</strong> · /{seller.slug}
      </p>
      <StoreProfileForm key={seller.id} seller={seller} onSaved={reload} />
    </section>
  )
}
