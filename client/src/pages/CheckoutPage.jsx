import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState.jsx'
import { orderApi, paymentApi } from '../services/api.js'

const emptyAddress = { firstName: '', lastName: '', line1: '', city: '', state: '', postalCode: '', country: '' }

export function CheckoutPage() {
  const [address, setAddress] = useState(emptyAddress)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError(null)
    try { const order = await orderApi.create({ shippingAddress: address, billingAddress: address }); const result = await paymentApi.createCheckout(order.data.data.order._id, crypto.randomUUID()); window.location.href = result.data.data.url }
    catch (requestError) { setError(requestError.message); setLoading(false) }
  }
  return <section className="auth-panel"><p className="eyebrow">Almost yours</p><h2>Checkout</h2><form onSubmit={submit} className="address-form">{['firstName','lastName','line1','city','state','postalCode','country'].map((field) => <label key={field}>{field}<input required value={address[field]} onChange={(e) => setAddress({ ...address, [field]: e.target.value })} /></label>)}{error && <ErrorState message={error} />}<button className="primary-action" disabled={loading}>{loading ? 'Preparing payment' : 'Continue to secure payment'}</button><button type="button" className="text-button" onClick={() => navigate('/cart')}>Back to cart</button></form></section>
}
