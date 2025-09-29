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
import { Lock, Users, Eye, MoreHorizontal } from "lucide-react"
import { formatDistanceToNow } from "@/lib/utils"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProcessorStatusBadge } from "./processor-status-badge"
import { Processor } from "@/app/queries/processors/use-processors"

interface ProcessorsTableProps {
  data: Processor[]
}

export function ProcessorsTable({ data }: ProcessorsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "updated_at", desc: true }
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  const columns = React.useMemo<ColumnDef<Processor>[]>(
    () => [
      {
        accessorKey: "processor_name",
        header: "Name",
        cell: ({ row }) => {
          return (
            <div className="font-semibold">
              {row.getValue("processor_name")}
            </div>
          )
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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          return <ProcessorStatusBadge status={row.getValue("status")} />
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
        accessorKey: "updated_at",
        header: "Last Updated",
        cell: ({ row }) => {
          const date = row.getValue("updated_at") as string
          return (
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(date))} ago
            </span>
          )
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const processor = row.original

          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // TODO: Navigate to processor view
                  console.log("View processor:", processor.processor_id)
                }}
              >
                <Eye className="h-4 w-4" />
                <span className="ml-1">View</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => console.log("View:", processor.processor_id)}
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
            </div>
          )
        },
      },
    ],
    []
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