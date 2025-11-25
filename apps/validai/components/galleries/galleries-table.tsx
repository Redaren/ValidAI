'use client'

import * as React from 'react'
import { Plus, MoreHorizontal, Eye, Pencil, Trash2, Copy, ChevronLeft, ChevronRight, Lock, Users, LayoutGrid } from 'lucide-react'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useRouter, Link } from '@/lib/i18n/navigation'
import { useTranslations } from 'next-intl'

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
} from '@playze/shared-ui'
import { Gallery } from '@/app/queries/galleries'
import { GalleryStatusBadge } from './gallery-status-badge'

interface GalleriesTableProps {
  data: Gallery[]
  totalCount: number
  pageCount: number
  pageIndex: number
  onPageChange: (page: number) => void
  searchValue: string
  onSearchChange: (search: string) => void
  isLoading: boolean
  isEmpty: boolean
  onCreateClick: () => void
  mode: 'client' | 'server'
}

export function GalleriesTable({
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
}: GalleriesTableProps) {
  const router = useRouter()
  const t = useTranslations()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')

  // Define columns
  const columns = React.useMemo<ColumnDef<Gallery>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        enableGlobalFilter: true,
        cell: ({ row }) => (
          <Link href={`/gallery/${row.original.id}`} className="font-semibold hover:underline">
            {row.getValue('name')}
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <GalleryStatusBadge status={row.getValue('status')} />,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        enableGlobalFilter: true,
        cell: ({ row }) => {
          const description = row.getValue('description') as string | null
          const truncated = description && description.length > 60
            ? description.substring(0, 60) + '...'
            : description
          return (
            <span className="text-muted-foreground">
              {truncated || <span className="italic">No description</span>}
            </span>
          )
        },
      },
      {
        accessorKey: 'visibility',
        header: 'Visibility',
        cell: ({ row }) => {
          const visibility = row.getValue('visibility') as string
          const Icon = visibility === 'personal' ? Lock : Users
          const label = visibility === 'personal' ? 'Personal' : 'Organization'

          return (
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{label}</span>
            </div>
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const gallery = row.original

          return (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Edit Gallery"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/gallery/${gallery.id}`)
                }}
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit Gallery</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.push(`/sv/${gallery.id}`)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Gallery
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(gallery.id)
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [router]
  )

  // Configure table based on mode
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: mode === 'client' ? globalFilter : searchValue,
      ...(mode === 'server' && {
        pagination: {
          pageIndex,
          pageSize: 10,
        },
      }),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: mode === 'client' ? setGlobalFilter : onSearchChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: mode === 'client' ? getFilteredRowModel() : undefined,
    getPaginationRowModel: mode === 'client' ? getPaginationRowModel() : undefined,
    manualPagination: mode === 'server',
    manualFiltering: mode === 'server',
    pageCount: mode === 'server' ? pageCount : undefined,
  })

  // Handle search input
  const handleSearchChange = (value: string) => {
    if (mode === 'client') {
      setGlobalFilter(value)
    } else {
      onSearchChange(value)
    }
  }

  // Handle pagination
  const handlePreviousPage = () => {
    if (mode === 'client') {
      table.previousPage()
    } else {
      onPageChange(pageIndex - 1)
    }
  }

  const handleNextPage = () => {
    if (mode === 'client') {
      table.nextPage()
    } else {
      onPageChange(pageIndex + 1)
    }
  }

  const canPreviousPage = mode === 'client' ? table.getCanPreviousPage() : pageIndex > 0
  const canNextPage = mode === 'client' ? table.getCanNextPage() : pageIndex < pageCount - 1

  // Empty state
  if (isEmpty && !isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
        <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
          <LayoutGrid className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No galleries yet</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            Create your first gallery to organize processors by areas like Sales, HR, or Compliance.
          </p>
          <Button onClick={onCreateClick}>
            <Plus className="mr-2 h-4 w-4" />
            Create Gallery
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <Input
          placeholder="Search galleries..."
          value={mode === 'client' ? globalFilter : searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={() => router.push(`/sv/${row.original.id}`)}
                  className="cursor-pointer hover:bg-muted/50"
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
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (mode === 'client' ? table.getPageCount() > 1 : pageCount > 1) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {mode === 'client' ? table.getPageCount() : pageCount}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={!canPreviousPage || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!canNextPage || isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
