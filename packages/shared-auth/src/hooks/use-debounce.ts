'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to debounce a value
 * Useful for search inputs to avoid excessive API calls
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default 300ms)
 * @returns The debounced value
 *
 * @example
 * ```typescript
 * const [searchInput, setSearchInput] = useState('')
 * const debouncedSearch = useDebounce(searchInput, 300)
 *
 * // Use debouncedSearch in your query - won't fire until user stops typing
 * const { data } = useQuery({
 *   queryKey: ['search', debouncedSearch],
 *   queryFn: () => searchAPI(debouncedSearch),
 * })
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
