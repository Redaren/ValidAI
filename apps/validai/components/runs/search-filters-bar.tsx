/**
 * Search Filters Bar Component
 *
 * @module components/runs/search-filters-bar
 * @description
 * Filter controls for search view including search input and type/area/result filters.
 *
 * **Features:**
 * - Debounced search input (300ms)
 * - Multi-select filter dropdowns
 * - Active filter badges with remove buttons
 * - Result counter display
 * - Clear all filters button
 *
 * @since Phase 4 - Search View
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Search as SearchIcon } from 'lucide-react'
import {
  Input,
  Button,
  Badge,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@playze/shared-ui'
import { useTranslations } from 'next-intl'
import type { Database } from '@playze/shared-types'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

export interface SearchFilters {
  searchTerm: string
  types: string[]
  areas: string[]
  resultFilter: string | null
}

interface SearchFiltersBarProps {
  /** Current filter state */
  filters: SearchFilters
  /** Callback when filters change */
  onFiltersChange: (filters: SearchFilters) => void
  /** Total operation results (unfiltered) */
  totalResults: OperationResult[]
  /** Filtered operation results count */
  filteredCount: number
}

const OPERATION_TYPES = [
  'validation',
  'extraction',
  'rating',
  'classification',
  'analysis',
  'traffic_light',
  'generic',
] as const

/**
 * SearchFiltersBar Component
 */
export function SearchFiltersBar({
  filters,
  onFiltersChange,
  totalResults,
  filteredCount,
}: SearchFiltersBarProps) {
  const t = useTranslations('runs.search')
  const [searchInput, setSearchInput] = useState(filters.searchTerm)

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.searchTerm) {
        onFiltersChange({ ...filters, searchTerm: searchInput })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput])

  // Extract unique areas from results
  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>()
    const results = Array.isArray(totalResults) ? totalResults : []
    results.forEach((result) => {
      const snapshot = result.operation_snapshot as any
      const area = snapshot?.area || 'Default'
      areas.add(area)
    })
    return Array.from(areas).sort()
  }, [totalResults])

  // Handle type filter toggle
  const handleTypeToggle = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type]
    onFiltersChange({ ...filters, types: newTypes })
  }

  // Handle area filter toggle
  const handleAreaToggle = (area: string) => {
    const newAreas = filters.areas.includes(area)
      ? filters.areas.filter((a) => a !== area)
      : [...filters.areas, area]
    onFiltersChange({ ...filters, areas: newAreas })
  }

  // Clear all filters
  const handleClearAll = () => {
    setSearchInput('')
    onFiltersChange({
      searchTerm: '',
      types: [],
      areas: [],
      resultFilter: null,
    })
  }

  // Remove individual filter
  const removeTypeFilter = (type: string) => {
    onFiltersChange({ ...filters, types: filters.types.filter((t) => t !== type) })
  }

  const removeAreaFilter = (area: string) => {
    onFiltersChange({ ...filters, areas: filters.areas.filter((a) => a !== area) })
  }

  const hasActiveFilters =
    filters.searchTerm ||
    filters.types.length > 0 ||
    filters.areas.length > 0 ||
    filters.resultFilter

  return (
    <div className="flex items-center gap-3 py-3">
      {/* LEFT ZONE: Search + Filter Dropdowns */}
      <div className="flex items-center gap-2">
        {/* Search Input - constrained to 320px */}
        <div className="relative w-80">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-9 shadow-none"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={t('clearSearch')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {t('filters.type')}
              {filters.types.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filters.types.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>{t('filters.type')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {OPERATION_TYPES.map((type) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={filters.types.includes(type)}
                onCheckedChange={() => handleTypeToggle(type)}
              >
                {t(`operationTypes.${type}`)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Area Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {t('filters.area')}
              {filters.areas.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filters.areas.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>{t('filters.area')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {uniqueAreas.length > 0 ? (
              uniqueAreas.map((area) => (
                <DropdownMenuCheckboxItem
                  key={area}
                  checked={filters.areas.includes(area)}
                  onCheckedChange={() => handleAreaToggle(area)}
                >
                  {area}
                </DropdownMenuCheckboxItem>
              ))
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No areas available
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* CENTER ZONE: Active Filter Chips (conditional) */}
      {hasActiveFilters && (
        <>
          {/* Visual separator */}
          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Active Filter Badges */}
            {filters.types.map((type) => (
              <Badge key={`type-${type}`} variant="secondary" className="gap-1">
                {t(`operationTypes.${type}`)}
                <button
                  onClick={() => removeTypeFilter(type)}
                  className="ml-1 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}

            {filters.areas.map((area) => (
              <Badge key={`area-${area}`} variant="secondary" className="gap-1">
                {area}
                <button
                  onClick={() => removeAreaFilter(area)}
                  className="ml-1 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}

            {/* Clear All Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-6 px-2 text-xs"
            >
              {t('filters.clearAll')}
            </Button>
          </div>
        </>
      )}

      {/* RIGHT ZONE: Result Counter */}
      <div className="ml-auto text-sm text-muted-foreground">
        {t('showing', { count: filteredCount, total: totalResults.length })}
      </div>
    </div>
  )
}
