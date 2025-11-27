/**
 * Runs Table Component
 *
 * @module components/runs/runs-table
 * @description
 * Displays a list of processor runs in a table format with search, sort, and pagination.
 * Each row is clickable and navigates to the run detail page.
 *
 * **Features:**
 * - Search by document name
 * - Sortable columns (status, document, started, duration, progress)
 * - Client-side pagination (10 rows per page default)
 * - Status badges with color coding
 * - Progress indicators
 * - Click to navigate to run details
 * - Empty state when no runs exist
 *
 * **Performance:**
 * - Displays up to 50 most recent runs (server limit)
 * - Pagination prevents whole-page scrolling
 * - Keeps header and navigation visible
 *
 * @since Phase 1.8
 * @updated Phase 1.10 - Added TanStack React Table integration
 */

'use client'

import * as React from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Input,
  Button,
  Checkbox,
} from '@playze/shared-ui'
import { formatDistanceToNow } from 'date-fns'
import type { Database } from '@playze/shared-types'
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SelectionActionBar } from './selection-action-bar'

type Run = Database['public']['Tables']['validai_runs']['Row']

/**
 * Props for RunsTable component
 */
interface RunsTableProps {
  /** Array of runs to display */
  runs: Run[]
  /** Processor ID for navigation */
  processorId: string
}

/**
 * Formats duration in milliseconds to human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

/**
 * Formats ISO date string to relative time
 */
function formatDateTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), { addSuffix: true })
}

/**
 * Formats file size in bytes
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * Renders run status badge
 */
function RunStatusBadge({ status, failedCount }: { status: string; failedCount: number }) {
  const t = useTranslations('runs.status')

  if (status === 'completed') {
    if (failedCount > 0) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          Partial
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="border-green-500 text-green-700">
        Success
      </Badge>
    )
  }

  if (status === 'failed') {
    return <Badge variant="destructive">{t('failed')}</Badge>
  }

  if (status === 'processing') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        Running
      </Badge>
    )
  }

  if (status === 'pending') {
    return <Badge variant="secondary">{t('pending')}</Badge>
  }

  if (status === 'cancelled') {
    return <Badge variant="outline">{t('cancelled')}</Badge>
  }

  return <Badge variant="outline">{status}</Badge>
}

/**
 * Runs Table
 *
 * Displays all runs for a processor in a searchable, sortable, paginated table.
 * Clicking a row navigates to the run detail page.
 *
 * **Table Columns:**
 * - Status - Run completion status (filterable, sortable)
 * - Document - Document name and size (searchable, sortable)
 * - Started - Relative start time (sortable)
 * - Duration - Total execution time (sortable)
 * - Progress - Operations completed/failed/total (sortable)
 *
 * @param runs - Array of run objects (max 50 from server)
 * @param processorId - Processor ID for navigation
 * @returns Table component with search, sort, and pagination
 *
 * @example
 * ```tsx
 * const { data: runs } = useProcessorRuns(processorId)
 * return <RunsTable runs={runs || []} processorId={processorId} />
 * ```
 */
export function RunsTable({ runs, processorId }: RunsTableProps) {
  const router = useRouter()
  const t = useTranslations('runs.table')
  const tCompare = useTranslations('runs.compare')

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'started_at', desc: true }, // Default: newest first
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Define columns
  const columns = React.useMemo<ColumnDef<Run>[]>(
    () => [
      // Checkbox column for row selection
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            // Disable if no completed runs on page
            disabled={table.getRowModel().rows.every(row => row.original.status !== 'completed')}
          />
        ),
        cell: ({ row }) => {
          const isCompleted = row.original.status === 'completed'
          const selectedCount = Object.keys(rowSelection).length
          const isDisabled = !isCompleted || (selectedCount >= 5 && !row.getIsSelected())

          return (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              disabled={isDisabled}
              title={
                !isCompleted
                  ? tCompare('onlyCompletedRuns')
                  : selectedCount >= 5 && !row.getIsSelected()
                  ? 'Maximum 5 runs can be selected'
                  : undefined
              }
            />
          )
        },
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: 'status',
        header: () => t('status'),
        cell: ({ row }) => (
          <RunStatusBadge status={row.original.status} failedCount={row.original.failed_operations} />
        ),
        filterFn: 'includesString',
      },
      {
        id: 'document_name',
        accessorFn: (row) => {
          const snapshot = row.snapshot as { document: { name: string; size_bytes: number } }
          return snapshot.document.name
        },
        header: () => t('document'),
        cell: ({ row }) => {
          const snapshot = row.original.snapshot as {
            document: { name: string; size_bytes: number }
          }
          return (
            <div>
              <p className="font-medium">{snapshot.document.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(snapshot.document.size_bytes)}
              </p>
            </div>
          )
        },
        filterFn: 'includesString',
      },
      {
        accessorKey: 'started_at',
        header: () => t('started'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(row.original.started_at)}
          </span>
        ),
        sortingFn: 'datetime',
      },
      {
        id: 'duration',
        accessorFn: (row) => {
          return row.completed_at
            ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
            : Date.now() - new Date(row.started_at).getTime()
        },
        header: () => t('duration'),
        cell: ({ row }) => {
          const duration = row.original.completed_at
            ? new Date(row.original.completed_at).getTime() - new Date(row.original.started_at).getTime()
            : Date.now() - new Date(row.original.started_at).getTime()
          return <span className="font-mono text-sm">{formatDuration(duration)}</span>
        },
        sortingFn: 'basic',
      },
      {
        id: 'progress',
        accessorFn: (row) => (row.completed_operations + row.failed_operations) / row.total_operations,
        header: () => t('progress'),
        cell: ({ row }) => {
          const progressPercent =
            ((row.original.completed_operations + row.original.failed_operations) /
              row.original.total_operations) *
            100

          return (
            <div className="space-y-1">
              <div className="text-sm">
                {row.original.completed_operations + row.original.failed_operations} /{' '}
                {row.original.total_operations}
                {row.original.failed_operations > 0 && (
                  <span className="ml-2 text-xs text-destructive">
                    ({row.original.failed_operations} failed)
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )
        },
        sortingFn: 'basic',
      },
    ],
    [t, tCompare, rowSelection]
  )

  // Create table instance
  const table = useReactTable({
    data: runs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => row.original.status === 'completed', // Only allow completed runs to be selected
    enableMultiRowSelection: true,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 10, // Show 10 runs per page (prevents whole-page scrolling)
      },
    },
  })

  // Get selected run IDs
  const selectedRunIds = React.useMemo(() => {
    return table.getSelectedRowModel().rows.map((row) => row.original.id)
  }, [table, rowSelection])

  // Empty state
  if (runs.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('noRuns')}</p>
          <p className="text-xs text-muted-foreground">{t('noRunsDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex items-center gap-4">
        <Input
          placeholder={t('searchPlaceholder')}
          value={(table.getColumn('document_name')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('document_name')?.setFilterValue(event.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-area-header">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={(e) => {
                    // Don't navigate if clicking checkbox
                    const target = e.target as HTMLElement
                    if (target.closest('button[role="checkbox"]')) {
                      return
                    }
                    router.push(`/proc/${processorId}/runs/${row.original.id}`)
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          {t('showingInfo', {
            from: table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1,
            to: Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            ),
            total: table.getFilteredRowModel().rows.length,
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('previous')}
          </Button>

          <div className="text-sm">
            {t('pageInfo', {
              current: table.getState().pagination.pageIndex + 1,
              total: table.getPageCount(),
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t('next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Selection Action Bar */}
      <SelectionActionBar
        selectedRunIds={selectedRunIds}
        onClearSelection={() => table.resetRowSelection()}
        processorId={processorId}
      />
    </div>
  )
}
