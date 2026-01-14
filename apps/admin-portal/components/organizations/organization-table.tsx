'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { DataTable, Badge, Button, Input } from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'
import { MoreHorizontal, Eye, Search, UserPlus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { useOrganizationsPaginated } from '@/lib/queries'
import { useDebounce } from '@/hooks'
import { formatDate } from '@/lib/utils'
import { InviteMemberDialog } from './invite-member-dialog'

type Organization = {
  id: string
  name: string
  description: string | null
  is_active: boolean | null
  member_count: number
  created_at: string | null
  updated_at: string | null
}

const PAGE_SIZE = 10

function OrganizationActions({ org }: { org: Organization }) {
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <>
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
          <DropdownMenuItem onSelect={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InviteMemberDialog
        organizationId={org.id}
        organizationName={org.name}
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  )
}

export function OrganizationTable() {
  // Search with debounce to avoid excessive API calls
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  // Pagination state
  const [page, setPage] = useState(0)

  // Query with server-side params
  const { data, isLoading } = useOrganizationsPaginated({
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const organizations = data?.organizations || []
  const totalCount = data?.totalCount || 0
  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  // Reset to page 0 when search changes
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

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
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search organizations by name or description..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Data table with server-side pagination */}
      <DataTable
        columns={columns}
        data={organizations}
        isLoading={isLoading}
        manualPagination
        pageCount={pageCount}
        pageIndex={page}
        onPageChange={setPage}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
      />
    </div>
  )
}
