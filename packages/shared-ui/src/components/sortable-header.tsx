'use client'

import type { Column } from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from './ui/button'

interface SortableHeaderProps<TData> {
  column: Column<TData, unknown>
  title: string
}

/**
 * SortableHeader - A reusable column header component with A-Z/Z-A sorting
 *
 * @example
 * ```tsx
 * const columns: ColumnDef<MyData>[] = [
 *   {
 *     accessorKey: 'name',
 *     header: ({ column }) => <SortableHeader column={column} title="Name" />,
 *   },
 * ]
 * ```
 */
export function SortableHeader<TData>({ column, title }: SortableHeaderProps<TData>) {
  const sorted = column.getIsSorted()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {title}
      {sorted === 'asc' ? (
        <ArrowUp className="ml-2 h-4 w-4" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="ml-2 h-4 w-4" />
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  )
}
