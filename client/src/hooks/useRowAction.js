import { useCallback, useState } from 'react'

// Shared pending/error handling for admin row mutations so each table does not
// re-implement it. Reloads the table on success.
export function useRowAction(reload) {
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const run = useCallback(
    async (id, action) => {
      setPendingId(id)
      setActionError(null)
      try {
        await action()
        await reload()
      } catch (requestError) {
        setActionError(requestError.message)
      } finally {
        setPendingId(null)
      }
    },
    [reload],
  )

  return { pendingId, actionError, run }
}
