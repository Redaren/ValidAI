"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Lock, Users, Eye, History, MoreHorizontal, Play } from "lucide-react"
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
}

export function ProcessorsTable({ data }: ProcessorsTableProps) {
  const router = useRouter()
  const t = useTranslations('processors')
  const [mounted, setMounted] = React.useState(false)

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "processor_name", desc: false }
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const columns = React.useMemo<ColumnDef<Processor>[]>(
    () => [
      {
        accessorKey: "processor_name",
        header: "Name",
        cell: ({ row }) => {
          const processor = row.original
          return (
            <Link
              href={`/proc/${processor.processor_id}`}
              className="font-semibold hover:underline"
            >
              {row.getValue("processor_name")}
            </Link>
          )
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          return <ProcessorStatusBadge status={row.getValue("status")} />
        },
      },
      {
        accessorKey: "processor_description",
        header: "Description",
        cell: ({ row }) => {
          const description = row.getValue("processor_description") as string | null
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
        header: "Visibility",
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
                processorId={processor.processor_id}
                processorName={processor.processor_name}
                defaultView="compliance"
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Run processor"
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
                title="View details"
                onClick={() => {
                  router.push(`/proc/${processor.processor_id}`)
                }}
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">View details</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="View runs"
                onClick={() => {
                  router.push(`/proc/${processor.processor_id}/runs`)
                }}
              >
                <History className="h-4 w-4" />
                <span className="sr-only">View runs</span>
              </Button>

              {mounted && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => router.push(`/proc/${processor.processor_id}`)}
                    >
                      View details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled
                      onClick={() => console.log("Edit:", processor.processor_id)}
                    >
                      Edit processor
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled
                      onClick={() => console.log("Delete:", processor.processor_id)}
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
    [router, mounted, t]
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  })

  return (
    <div>
      <div className="flex items-center py-4">
        <Input
          placeholder="Filter processors..."
          value={(table.getColumn("processor_name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("processor_name")?.setFilterValue(event.target.value)
          }
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
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
                  No processors found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}