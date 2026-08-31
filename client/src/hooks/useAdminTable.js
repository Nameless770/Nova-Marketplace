import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Owns query state (search, filters, sort, page) for an admin table and
// refetches whenever it changes. Search is debounced so typing does not
// fire a request per keystroke.
export function useAdminTable(fetcher, { filters: initialFilters = {}, sortBy, sortDir } = {}) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [sort, setSort] = useState({ sortBy, sortDir: sortDir ?? 'desc' })
  const [page, setPage] = useState(1)

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  const params = useMemo(() => {
    const next = { page, limit: 20 }
    if (search.trim()) next.q = search.trim()
    if (sort.sortBy) {
      next.sortBy = sort.sortBy
      next.sortDir = sort.sortDir
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value) next[key] = value
    }
    return next
  }, [page, search, sort, filters])

  const reload = useCallback(async () => {
    const id = requestId.current + 1
    requestId.current = id
    setStatus('loading')
    setError(null)
    try {
      const response = await fetcher(params)
      if (requestId.current !== id) return // a newer request superseded this one
      setData(response.data.data)
      setStatus('success')
    } catch (requestError) {
      if (requestId.current !== id) return
      setError(requestError.message)
      setStatus('error')
    }
  }, [fetcher, params])

  useEffect(() => {
    const task = Promise.resolve().then(reload)
    return () => task.catch(() => {})
  }, [reload])

  const setFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }, [])

  const toggleSort = useCallback((field) => {
    setSort((current) =>
      current.sortBy === field
        ? { sortBy: field, sortDir: current.sortDir === 'asc' ? 'desc' : 'asc' }
        : { sortBy: field, sortDir: 'desc' },
    )
    setPage(1)
  }, [])

  return {
    items: data?.items ?? [],
    meta: data?.meta ?? { page: 1, totalPages: 1, total: 0 },
    status,
    error,
    reload,
    searchInput,
    setSearchInput,
    filters,
    setFilter,
    sort,
    toggleSort,
    page,
    setPage,
  }
}
