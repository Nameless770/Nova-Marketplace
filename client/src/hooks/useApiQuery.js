import { useCallback, useEffect, useState } from 'react'

export function useApiQuery(queryFn, initialValue) {
  const [data, setData] = useState(initialValue)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const response = await queryFn()
      setData(response.data.data)
      setStatus('success')
    } catch (requestError) {
      setError(requestError.message)
      setStatus('error')
    }
  }, [queryFn])

  useEffect(() => {
    const task = Promise.resolve().then(reload)
    return () => task.catch(() => {})
  }, [reload])

  return { data, status, error, reload }
}
