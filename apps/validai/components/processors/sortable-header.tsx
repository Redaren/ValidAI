"use client"

import * as React from "react"
import { Column } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import { cn } from "@/lib/utils"

interface SortableHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  title: string
  align?: "left" | "center" | "right"
}

/**
 * Reusable sortable table header component with dropdown controls
 *
 * Provides a clean dropdown interface for sorting table columns with:
 * - Visual indicators for current sort state
 * - Sort ascending/descending options
 * - Clear sort option
 * - Accessible keyboard navigation
 *
 * @example
 * ```tsx
 * {
 *   accessorKey: "name",
 *   header: ({ column }) => (
 *     <SortableHeader column={column} title="Name" />
 *   ),
 * }
 * ```
 */
export function SortableHeader<TData, TValue>({
  column,
  title,
  align = "left",
}: SortableHeaderProps<TData, TValue>) {
  const sortState = column.getIsSorted()

  return (
    <div className={cn("flex items-center", align === "right" && "justify-end", align === "center" && "justify-center")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
          >
            <span>{title}</span>
            {sortState === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : sortState === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Sort Ascending
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Sort Descending
          </DropdownMenuItem>
          {sortState && (
            <DropdownMenuItem onClick={() => column.clearSorting()}>
              <ChevronsUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
              Clear Sort
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
