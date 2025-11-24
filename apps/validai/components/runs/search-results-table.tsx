/**
 * Search Results Table Component
 *
 * @module components/runs/search-results-table
 * @description
 * Sortable table displaying filtered operation results.
 * Renders rows with expandable details using SearchResultRow.
 *
 * **Features:**
 * - Sortable columns (#, Area, Name, Result where applicable)
 * - Visual sort indicators (↑/↓)
 * - Empty state for no results
 * - Column titles with tooltips
 *
 * @since Phase 4 - Search View
 */

'use client'

import { ArrowUp, ArrowDown } from 'lucide-react'
import type { Database } from '@playze/shared-types'
import { SearchResultRow } from './search-result-row'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

export type SortColumn = 'area' | 'name' | 'result' | null
export type SortDirection = 'asc' | 'desc'

interface SearchResultsTableProps {
  /** Filtered and sorted operation results to display */
  results: OperationResult[]
  /** Current sort column */
  sortColumn: SortColumn
  /** Current sort direction */
  sortDirection: SortDirection
  /** Callback when sort changes */
  onSortChange: (column: SortColumn) => void
}

/**
 * SearchResultsTable Component
 */
export function SearchResultsTable({
  results,
  sortColumn,
  sortDirection,
  onSortChange,
}: SearchResultsTableProps) {
  const t = useTranslations('runs.search')

  /**
   * Render sort indicator
   */
  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return null
    }

    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    )
  }

  /**
   * Column header with sort
   */
  const SortableHeader = ({
    column,
    children,
    className,
  }: {
    column: SortColumn
    children: React.ReactNode
    className?: string
  }) => (
    <th
      onClick={() => onSortChange(column)}
      className={cn(
        'cursor-pointer select-none px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-muted/50',
        sortColumn === column && 'bg-muted/30',
        className
      )}
      title={t('sort.unsorted')}
    >
      <div className="flex items-center">
        {children}
        <SortIndicator column={column} />
      </div>
    </th>
  )

  /**
   * Non-sortable header
   */
  const Header = ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <th className={cn('px-4 py-3 text-left text-sm font-semibold', className)}>
      {children}
    </th>
  )

  // Empty state
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {t('noResults')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('noResultsDescription')}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full border-collapse">
        <thead className="border-b bg-muted/30">
          <tr>
            {/* # Column */}
            <Header className="w-[60px] text-center">
              {t('columns.number')}
            </Header>

            {/* Area Column */}
            <SortableHeader column="area" className="w-[140px]">
              {t('columns.area')}
            </SortableHeader>

            {/* Name Column */}
            <SortableHeader column="name" className="w-[320px]">
              {t('columns.name')}
            </SortableHeader>

            {/* Type Column (not sortable) */}
            <Header className="w-[60px] text-center">{t('columns.type')}</Header>

            {/* Result Column */}
            <SortableHeader column="result" className="w-[280px]">
              {t('columns.result')}
            </SortableHeader>
          </tr>
        </thead>

        <tbody className="divide-y">
          {results.map((result) => (
            <SearchResultRow
              key={result.id}
              result={result}
              operationNumber={result.execution_order + 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
