import { useCallback, useEffect, useMemo, useState } from 'react'
import { cartApi } from '../services/api.js'
import { useAuth } from './useAuth.js'
import { CartContext } from './cartContextValue.js'

// Live cart shared across the navbar badge and every product card, so adding
// from a card, or stepping quantity, updates the count everywhere at once.
export function CartProvider({ children }) {
  const { user } = useAuth()
  const isShopper = user?.role === 'customer'
  const [items, setItems] = useState([])

  const refresh = useCallback(async () => {
    if (!isShopper) return
    try {
      const response = await cartApi.get()
      setItems((response.data.data.cart ?? response.data.data)?.items ?? [])
    } catch {
      // Leave the last known cart in place if a refresh fails.
    }
  }, [isShopper])

  // Pull the cart on load and when the signed-in user changes. Deferred into a
  // microtask (as useApiQuery does) so state isn't set synchronously in effect.
  useEffect(() => {
    const task = Promise.resolve().then(refresh)
    return () => task.catch(() => {})
  }, [refresh])

  const addToCart = useCallback(async (item) => {
    const response = await cartApi.add(item)
    setItems(response.data.data.cart?.items ?? [])
    return response
  }, [])

  // A quantity below one removes the line entirely.
  const setQuantity = useCallback(async (itemId, quantity) => {
    const response = quantity < 1 ? await cartApi.remove(itemId) : await cartApi.update(itemId, quantity)
    setItems(response.data.data.cart?.items ?? [])
  }, [])

  const removeItem = useCallback(async (itemId) => {
    const response = await cartApi.remove(itemId)
    setItems(response.data.data.cart?.items ?? [])
  }, [])

  const count = items.reduce((sum, item) => sum + (item.quantity || 0), 0)

  const value = useMemo(
    () => ({ items, count, refresh, addToCart, setQuantity, removeItem }),
    [items, count, refresh, addToCart, setQuantity, removeItem],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
