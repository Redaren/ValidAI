"use client"

import * as React from "react"
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
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

interface ProcessorsTableProps {
  data: Processor[]
  totalCount: number
  pageCount: number
  pageIndex: number
  onPageChange: (page: number) => void
  searchValue: string
  onSearchChange: (search: string) => void
}

export function ProcessorsTable({
  data,
  totalCount,
  pageCount,
  pageIndex,
  onPageChange,
  searchValue,
  onSearchChange,
}: ProcessorsTableProps) {
  const router = useRouter()
  const t = useTranslations('processors')
  const tTable = useTranslations('processors.table')
  const tPagination = useTranslations('runs.table') // Reuse pagination translations
  const [mounted, setMounted] = React.useState(false)

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: false }
  ])

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const columns = React.useMemo<ColumnDef<Processor>[]>(
    () => [
      {
        accessorKey: "name",
        header: () => tTable('name'),
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
        cell: ({ row }) => {
          return <ProcessorStatusBadge status={row.getValue("status")} />
        },
      },
      {
        accessorKey: "description",
        header: () => tTable('description'),
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

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    manualPagination: true, // Server-side pagination
    pageCount: pageCount,   // Total pages from server
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center py-4">
        <Input
          placeholder={t('filterPlaceholder')}
          value={searchValue}
          onChange={(event) => {
            onSearchChange(event.target.value)
            onPageChange(0) // Reset to first page on search
          }}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
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

      {/* Pagination Controls - Only show if more than 1 page (server-side) */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            {tPagination('showingInfo', {
              from: pageIndex * 10 + 1,
              to: Math.min((pageIndex + 1) * 10, totalCount),
              total: totalCount,
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pageIndex - 1)}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              {tPagination('previous')}
            </Button>

            <div className="text-sm">
              {tPagination('pageInfo', {
                current: pageIndex + 1,
                total: pageCount,
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
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
