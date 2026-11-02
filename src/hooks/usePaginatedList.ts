import { useEffect, useMemo, useState } from 'react'

export function usePaginatedList<T>(items: T[], resetKey: string, pageSize = 24) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 })
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  useEffect(() => {
    setSelection((previous) => previous.key !== resetKey
      ? { key: resetKey, page: 1 }
      : previous.page > totalPages ? { ...previous, page: totalPages } : previous)
  }, [resetKey, totalPages])
  const page = selection.key === resetKey ? Math.min(selection.page, totalPages) : 1
  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])
  const setPage = (next: number) => setSelection({ key: resetKey, page: Math.max(1, Math.min(next, totalPages)) })
  return { pageItems, page, setPage }
}
