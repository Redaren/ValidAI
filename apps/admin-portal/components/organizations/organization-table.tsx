'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { DataTable, Badge, Button } from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'
import { MoreHorizontal, Eye } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { useOrganizations } from '@/lib/queries'
import { formatDate } from '@/lib/utils'

type Organization = {
  id: string
  name: string
  description: string | null
  is_active: boolean | null
  member_count: number
  created_at: string | null
  updated_at: string | null
}

function OrganizationActions({ org }: { org: Organization }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/organizations/${org.id}`}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function OrganizationTable() {
  const { data: organizations, isLoading } = useOrganizations() as {
    data: Organization[] | undefined
    isLoading: boolean
  }

  const columns = useMemo<ColumnDef<Organization>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Organization',
        cell: ({ row }) => (
          <Link
            href={`/organizations/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.description || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
            {row.original.is_active ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        accessorKey: 'member_count',
        header: 'Members',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.member_count}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => <OrganizationActions org={row.original} />,
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      data={organizations || []}
      isLoading={isLoading}
      searchKey="name"
      searchPlaceholder="Search organizations..."
      pageSize={10}
    />
  )
}
