import { useCallback, useEffect, useMemo, useState } from 'react'
import { wishlistApi } from '../services/api.js'
import { useAuth } from './useAuth.js'
import { WishlistContext } from './wishlistContextValue.js'

// Live wishlist shared across product cards, so the heart reflects saved state
// and can toggle a product in or out without visiting the wishlist page.
export function WishlistProvider({ children }) {
  const { user } = useAuth()
  const isShopper = user?.role === 'customer'
  const [items, setItems] = useState([])

  const refresh = useCallback(async () => {
    if (!isShopper) return
    try {
      const response = await wishlistApi.get()
      setItems((response.data.data.wishlist ?? response.data.data)?.items ?? [])
    } catch {
      // Leave the last known wishlist in place if a refresh fails.
    }
  }, [isShopper])

  useEffect(() => {
    const task = Promise.resolve().then(refresh)
    return () => task.catch(() => {})
  }, [refresh])

  const add = useCallback(async (item) => {
    const response = await wishlistApi.add(item)
    setItems(response.data.data.wishlist?.items ?? [])
  }, [])

  const remove = useCallback(async (itemId) => {
    const response = await wishlistApi.remove(itemId)
    setItems(response.data.data.wishlist?.items ?? [])
  }, [])

  const value = useMemo(() => ({ items, refresh, add, remove }), [items, refresh, add, remove])

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}
