"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Lock, Users, History, MoreHorizontal, Play, ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter, Link } from "@/lib/i18n/navigation"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import { ProcessorStatusBadge } from "./processor-status-badge"
import { RunProcessorDialog } from "./run-processor-dialog"
import { Processor } from "@/app/queries/processors/use-processors"
import { useTranslations } from 'next-intl'

/**
 * Props for the ProcessorsTable component
 */
interface ProcessorsTableProps {
  /**
   * Array of processor objects to display
   * - In client mode: Contains ALL processors (up to 1000)
   * - In server mode: Contains current page of processors (typically 10)
   */
  data: Processor[]

  /**
   * Total number of processors across all pages
   * Used for pagination controls and empty state logic
   */
  totalCount: number

  /**
   * Total number of pages available
   * - In client mode: Always 1 (all data loaded)
   * - In server mode: Calculated as Math.ceil(totalCount / pageSize)
   */
  pageCount: number

  /**
   * Current page index (0-based)
   * - In client mode: Managed by TanStack Table internally
   * - In server mode: Controlled by parent component
   */
  pageIndex: number

  /**
   * Callback to change the current page
   * - In client mode: Updates TanStack Table state (no API call)
   * - In server mode: Triggers new API request from parent
   */
  onPageChange: (page: number) => void

  /**
   * Current search input value
   * - In client mode: Ignored (uses internal globalFilter state)
   * - In server mode: Displayed in input and sent to API
   */
  searchValue: string

  /**
   * Callback when search input changes
   * - In client mode: Not called (uses internal state)
   * - In server mode: Updates parent state → debounced API call
   */
  onSearchChange: (search: string) => void

  /**
   * Whether data is currently loading from API
   * Shows loading spinner/overlay
   */
  isLoading: boolean

  /**
   * Whether the table has no data to display
   * Shows appropriate empty state (with or without "Create" button)
   */
  isEmpty: boolean

  /**
   * Callback when user clicks "Create" button in empty state
   */
  onCreateClick: () => void

  /**
   * Operating mode that determines filtering/pagination behavior
   *
   * **Client Mode (≤50 processors):**
   * - All data loaded initially (single API call)
   * - Instant search: TanStack Table filters in-memory (0ms, 0 API calls)
   * - Instant pagination: TanStack Table paginates in-memory (0 API calls)
   * - Best UX for small datasets
   *
   * **Server Mode (>50 processors):**
   * - Paginated data loading (10 processors per page)
   * - Debounced search: 300ms delay, then API call with search param
   * - Server-side pagination: API call per page change
   * - Efficient for large datasets
   */
  mode: 'client' | 'server'
}

/**
 * Hybrid client/server-side table for displaying and filtering processors
 *
 * **Architecture:**
 * This component supports two operating modes that are determined by the parent
 * based on dataset size:
 *
 * 1. **Client Mode (≤50 total processors)**
 *    - Parent loads ALL processors in a single API call (up to 1000 limit)
 *    - This component uses TanStack Table's built-in filtering and pagination
 *    - Search is instant (filters in-memory with no API calls)
 *    - Pagination is instant (paginates in-memory with no API calls)
 *    - Provides native desktop-app-like UX
 *
 * 2. **Server Mode (>50 total processors)**
 *    - Parent loads paginated data (10 processors per page)
 *    - This component triggers API calls via callbacks
 *    - Search is debounced (300ms delay, then API call)
 *    - Pagination triggers API calls
 *    - Efficient for large datasets
 *
 * **Mode Detection:**
 * The parent component determines mode after fetching initial data:
 * ```typescript
 * const totalCount = data?.totalCount ?? 0
 * const mode = totalCount > 0 && totalCount <= 50 ? 'client' : 'server'
 * ```
 *
 * **Performance:**
 * - Client mode: 1 API call on mount, then 0 API calls forever
 * - Server mode: 1 API call on mount, then 1 per search/page change
 *
 * **Why Hybrid?**
 * Most users have <50 processors and benefit from instant search.
 * Users with >50 processors need server-side pagination to avoid loading
 * thousands of records into the browser.
 *
 * @example
 * ```tsx
 * // Parent determines mode and fetches appropriate data
 * const { data } = useUserProcessors(false, {
 *   loadAll: shouldUseClientMode,  // Load all if ≤50
 *   search: shouldUseClientMode ? '' : debouncedSearch,
 *   pageIndex: shouldUseClientMode ? 0 : pageIndex,
 * })
 *
 * <ProcessorsTable
 *   data={data?.processors ?? []}
 *   mode={shouldUseClientMode ? 'client' : 'server'}
 *   // ... other props
 * />
 * ```
 */
export function ProcessorsTable({
  data,
  totalCount,
  pageCount,
  pageIndex,
  onPageChange,
  searchValue,
  onSearchChange,
  isLoading,
  isEmpty,
  onCreateClick,
  mode,
}: ProcessorsTableProps) {
  const router = useRouter()
  const t = useTranslations('processors')
  const tTable = useTranslations('processors.table')
  const tPagination = useTranslations('runs.table') // Reuse pagination translations
  const [mounted, setMounted] = React.useState(false)

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: false }
  ])

  // Client-side filter state (only used in client mode)
  const [globalFilter, setGlobalFilter] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * Determines which operating mode we're in
   * This flag controls all conditional behavior throughout the component
   */
  const isClientMode = mode === 'client'

  /**
   * Mode-aware search input handler
   *
   * **Client Mode:**
   * - Updates internal `globalFilter` state
   * - TanStack Table immediately filters rows in-memory
   * - No parent state update, no API call
   * - Instant feedback (0ms delay)
   *
   * **Server Mode:**
   * - Calls parent's `onSearchChange` callback
   * - Parent updates search state
   * - After 300ms debounce, parent triggers API call
   * - Resets to page 0 (first page of search results)
   *
   * @param event - React change event from the search input
   */
  const handleSearchChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value

      if (isClientMode) {
        // Client mode: Update table's global filter (instant, no API call)
        setGlobalFilter(value)
      } else {
        // Server mode: Update parent state (triggers API call after debounce)
        onSearchChange(value)
        onPageChange(0) // Reset to first page on search
      }
    },
    [isClientMode, onSearchChange, onPageChange]
  )

  const columns = React.useMemo<ColumnDef<Processor>[]>(
    () => [
      {
        accessorKey: "name",
        header: () => tTable('name'),
        enableGlobalFilter: true,
        cell: ({ row }) => {
          const processor = row.original
          return (
            <Link
              href={`/proc/${processor.id}`}
              className="font-semibold hover:underline"
            >
              {row.getValue("name")}
            </Link>
          )
        },
      },
      {
        accessorKey: "status",
        header: () => tTable('status'),
        enableGlobalFilter: false,
        cell: ({ row }) => {
          return <ProcessorStatusBadge status={row.getValue("status")} />
        },
      },
      {
        accessorKey: "description",
        header: () => tTable('description'),
        enableGlobalFilter: true,
        cell: ({ row }) => {
          const description = row.getValue("description") as string | null
          if (!description) return <span className="text-muted-foreground">No description</span>

          const truncated = description.length > 60
            ? description.substring(0, 60) + "..."
            : description

          return (
            <span className="text-muted-foreground">
              {truncated}
            </span>
          )
        },
      },
      {
        accessorKey: "visibility",
        header: () => tTable('visibility'),
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const visibility = row.getValue("visibility") as string
          const Icon = visibility === "personal" ? Lock : Users
          const label = visibility === "personal" ? "Personal" : "Organization"

          return (
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{label}</span>
            </div>
          )
        },
      },
      {
        id: "actions",
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const processor = row.original

          return (
            <div className="flex items-center gap-2">
              <RunProcessorDialog
                processorId={processor.id}
                processorName={processor.name}
                defaultView="compliance"
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Run processor"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Play className="h-4 w-4" />
                    <span className="sr-only">Run processor</span>
                  </Button>
                }
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="View runs"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/proc/${processor.id}/runs`)
                }}
              >
                <History className="h-4 w-4" />
                <span className="sr-only">View runs</span>
              </Button>

              {mounted && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => router.push(`/proc/${processor.id}`)}
                    >
                      View details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled
                    >
                      Edit processor
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled
                    >
                      Delete processor
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        },
      },
    ],
    [router, mounted, t, tTable]
  )

  /**
   * TanStack Table instance with mode-specific configuration
   *
   * **Client Mode Configuration:**
   * - `getFilteredRowModel()`: Enables in-memory filtering
   * - `getPaginationRowModel()`: Enables in-memory pagination
   * - `state.globalFilter`: Tracks search input value internally
   * - `onGlobalFilterChange`: Updates filter when user types
   * - `globalFilterFn`: Custom function that searches name AND description fields
   * - `initialState.pagination.pageSize`: Fixed at 10 rows per page
   *
   * **Server Mode Configuration:**
   * - `manualPagination: true`: Pagination controlled by parent (via API)
   * - `manualFiltering: true`: Filtering controlled by parent (via API)
   * - `pageCount`: Total pages from parent (based on totalCount)
   * - `state.pagination`: Current page from parent props
   *
   * **Why Conditional Configuration:**
   * - Client mode needs TanStack Table's filtering/pagination models
   * - Server mode needs manual control to trigger API calls via parent
   * - Using spread operator (...) to conditionally add config properties
   */
  const table = useReactTable<Processor>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),

    // Conditional configuration based on mode
    ...(isClientMode ? {
      // ========================================
      // CLIENT MODE: TanStack Table manages everything
      // ========================================
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      state: {
        sorting,
        globalFilter,
      },
      onGlobalFilterChange: setGlobalFilter,
      /**
       * Custom global filter function for client-side search
       * Searches across processor name and description fields
       * Case-insensitive substring matching
       */
      globalFilterFn: (row, columnId, filterValue) => {
        const search = String(filterValue).toLowerCase()
        const processor = row.original as Processor
        const name = String(processor.name || '').toLowerCase()
        const description = String(processor.description || '').toLowerCase()
        return name.includes(search) || description.includes(search)
      },
      initialState: {
        pagination: {
          pageSize: 10,
        },
      },
    } : {
      // ========================================
      // SERVER MODE: Parent controls pagination/filtering
      // ========================================
      manualPagination: true,
      manualFiltering: true,
      pageCount: pageCount,
      state: {
        sorting,
        pagination: {
          pageIndex,
          pageSize: 10,
        },
      },
    }),
  })

  /**
   * Determines what value to display in the search input field
   *
   * - Client mode: Uses internal `globalFilter` state (managed by TanStack Table)
   * - Server mode: Uses `searchValue` prop (managed by parent component)
   *
   * This ensures the input displays the correct value regardless of which
   * state system is controlling it.
   */
  const searchInputValue = isClientMode ? globalFilter : searchValue

  // Show initial loading state (only on first load)
  if (isLoading && data.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center py-4">
          <Input
            placeholder={t('filterPlaceholder')}
            value={searchInputValue}
            onChange={handleSearchChange}
            className="max-w-sm"
            disabled
          />
        </div>
        <div className="flex items-center justify-center py-12 rounded-md border">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  // Show empty state
  if (isEmpty) {
    const hasActiveSearch = searchInputValue.trim().length > 0

    return (
      <div className="space-y-4">
        <div className="flex items-center py-4">
          <Input
            placeholder={t('filterPlaceholder')}
            value={searchInputValue}
            onChange={handleSearchChange}
            className="max-w-sm"
          />
        </div>
        {hasActiveSearch ? (
          // No search results - don't show create button
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-md border">
            <h2 className="text-xl font-semibold mb-2">{t('noResults.title')}</h2>
            <p className="text-muted-foreground max-w-md">
              {t('noResults.description')}
            </p>
          </div>
        ) : (
          // Truly empty - show create button
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-md border">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('empty.title')}</h2>
            <p className="text-muted-foreground max-w-md">
              {t('empty.description')}
            </p>
            <Button className="mt-4" onClick={onCreateClick}>
              <Plus className="mr-2 h-4 w-4" />
              {t('empty.createFirst')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center py-4">
        <Input
          placeholder={t('filterPlaceholder')}
          value={searchInputValue}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border relative">
        {/* Show loading overlay during refetch (only in server mode when data already exists) */}
        {!isClientMode && isLoading && data.length > 0 && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-md">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        )}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-area-header">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const processor = row.original
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => router.push(`/proc/${processor.id}`)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No processors found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls - Mode-aware */}
      {(isClientMode ? table.getPageCount() > 1 : pageCount > 1) && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            {tPagination('showingInfo', {
              from: isClientMode
                ? table.getState().pagination.pageIndex * 10 + 1
                : pageIndex * 10 + 1,
              to: isClientMode
                ? Math.min((table.getState().pagination.pageIndex + 1) * 10, totalCount)
                : Math.min((pageIndex + 1) * 10, totalCount),
              total: totalCount,
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => isClientMode ? table.previousPage() : onPageChange(pageIndex - 1)}
              disabled={isClientMode ? !table.getCanPreviousPage() : pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              {tPagination('previous')}
            </Button>

            <div className="text-sm">
              {tPagination('pageInfo', {
                current: isClientMode
                  ? table.getState().pagination.pageIndex + 1
                  : pageIndex + 1,
                total: isClientMode ? table.getPageCount() : pageCount,
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => isClientMode ? table.nextPage() : onPageChange(pageIndex + 1)}
              disabled={isClientMode ? !table.getCanNextPage() : pageIndex >= pageCount - 1}
            >
              {tPagination('next')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
