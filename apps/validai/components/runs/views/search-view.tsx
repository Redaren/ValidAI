/**
 * Search View Component
 *
 * @module components/runs/views/search-view
 * @description
 * Search and filter view for run operation results.
 * Combines metric cards (like compliance view) with powerful search/filter table.
 *
 * **Features:**
 * - Metric cards at top (Progress, Validations, Traffic Lights)
 * - Search across operation names, descriptions, results
 * - Filter by type, area, result values
 * - Sort by number, area, name, result
 * - Expandable rows with full details and thinking blocks
 * - Real-time updates during execution
 *
 * @since Phase 4 - Search View
 */

'use client'

import { useState, useMemo } from 'react'
import type { Database } from '@playze/shared-types'
import { ProgressChart, ValidationChart } from '../compliance-metrics-charts'
import { ComplianceSummaryCard } from '../compliance-summary-card'
import { PerAreaChart } from '../per-area-chart'
import { SearchFiltersBar, type SearchFilters } from '../search-filters-bar'
import {
  SearchResultsTable,
  type SortColumn,
  type SortDirection,
} from '../search-results-table'
import { RunViewLayout } from './run-view-layout'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

export interface SearchViewProps {
  run: Run
  operationResults: OperationResult[]
  isLoadingResults?: boolean
}

/**
 * Check if search term matches operation result
 */
function matchesSearchTerm(result: OperationResult, searchTerm: string): boolean {
  if (!searchTerm) return true

  const term = searchTerm.toLowerCase()
  const snapshot = result.operation_snapshot as any
  const structured = result.structured_output as any

  // Search in operation name
  if (snapshot?.name?.toLowerCase().includes(term)) return true

  // Search in operation description
  if (snapshot?.description?.toLowerCase().includes(term)) return true

  // Search in response text
  if (result.response_text?.toLowerCase().includes(term)) return true

  // Search in structured output comment
  if (structured?.comment?.toLowerCase().includes(term)) return true

  // Search in structured output conclusion (analysis)
  if (structured?.conclusion?.toLowerCase().includes(term)) return true

  // Search in extracted items
  if (Array.isArray(structured?.items)) {
    if (structured.items.some((item: string) => item.toLowerCase().includes(term))) {
      return true
    }
  }

  // Search in classification
  if (structured?.classification?.toLowerCase().includes(term)) return true

  return false
}

/**
 * Get sortable value for result column
 */
function getResultSortValue(result: OperationResult): number | string {
  const snapshot = result.operation_snapshot as any
  const operationType = snapshot?.operation_type || 'generic'
  const structured = result.structured_output as any

  switch (operationType) {
    case 'validation':
      // False = 0, True = 1
      return structured?.result === true ? 1 : 0

    case 'traffic_light':
      // Red = 0, Yellow = 1, Green = 2
      const light = structured?.traffic_light
      return light === 'green' ? 2 : light === 'yellow' ? 1 : 0

    case 'rating':
      // Numeric value
      return structured?.value ?? 0

    case 'extraction':
      // Number of items
      return Array.isArray(structured?.items) ? structured.items.length : 0

    case 'classification':
      // Alphabetical by classification
      return structured?.classification?.toLowerCase() || ''

    default:
      // Not sortable
      return ''
  }
}

/**
 * SearchView Component
 */
export function SearchView({ run, operationResults, isLoadingResults }: SearchViewProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    searchTerm: '',
    types: [],
    areas: [],
    resultFilter: null,
  })

  const [sortColumn, setSortColumn] = useState<SortColumn>('number')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Filter results
  const filteredResults = useMemo(() => {
    return operationResults.filter((result) => {
      // Search term filter
      if (!matchesSearchTerm(result, filters.searchTerm)) return false

      const snapshot = result.operation_snapshot as any

      // Type filter
      if (
        filters.types.length > 0 &&
        !filters.types.includes(snapshot?.operation_type)
      ) {
        return false
      }

      // Area filter
      if (filters.areas.length > 0) {
        const area = snapshot?.area || 'Default'
        if (!filters.areas.includes(area)) {
          return false
        }
      }

      return true
    })
  }, [operationResults, filters])

  // Sort results
  const sortedResults = useMemo(() => {
    if (!sortColumn) return filteredResults

    const sorted = [...filteredResults]

    sorted.sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortColumn) {
        case 'number':
          // Sort by execution_order
          aValue = a.execution_order ?? 0
          bValue = b.execution_order ?? 0
          break

        case 'area':
          // Sort by area name
          aValue = ((a.operation_snapshot as any)?.area || 'Default').toLowerCase()
          bValue = ((b.operation_snapshot as any)?.area || 'Default').toLowerCase()
          break

        case 'name':
          // Sort by operation name
          aValue = ((a.operation_snapshot as any)?.name || '').toLowerCase()
          bValue = ((b.operation_snapshot as any)?.name || '').toLowerCase()
          break

        case 'result':
          // Sort by result value (type-specific)
          aValue = getResultSortValue(a)
          bValue = getResultSortValue(b)
          break

        default:
          return 0
      }

      // Compare values
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [filteredResults, sortColumn, sortDirection])

  // Handle sort column change
  const handleSortChange = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Metrics Dashboard Header
  const metricsHeader = run.status === 'completed' ? (
    <div className="grid gap-4 md:grid-cols-3">
      <ComplianceSummaryCard run={run} />
      <ValidationChart operationResults={operationResults} />
      <PerAreaChart run={run} operationResults={operationResults} />
    </div>
  ) : (
    <div className="grid gap-4 md:grid-cols-3">
      <ProgressChart
        totalOperations={run.total_operations ?? 0}
        completedOperations={run.completed_operations ?? 0}
        failedOperations={run.failed_operations ?? 0}
      />
      <ValidationChart operationResults={operationResults} />
      <PerAreaChart run={run} operationResults={operationResults} />
    </div>
  )

  return (
    <RunViewLayout header={metricsHeader}>
      {/* Search and Filter Section */}
      <div className="space-y-4">
        <SearchFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          totalResults={operationResults}
          filteredCount={sortedResults.length}
        />

        <SearchResultsTable
          results={sortedResults}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
        />
      </div>
    </RunViewLayout>
  )
}
