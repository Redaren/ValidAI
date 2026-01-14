'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { DataTable, type ColumnDef } from '@playze/shared-ui'
import {
  Badge,
  Input,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { useAllInvitations, useCancelInvitationGlobal, type InvitationWithOrg } from '@/lib/queries'
import { useDebounce } from '@/hooks'
import { useToastStore } from '@/stores'
import { Search, MoreHorizontal, XCircle, Mail, Clock } from 'lucide-react'

const PAGE_SIZE = 10

const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
  viewer: 'outline',
}

export function InvitationsTable() {
  // Search with debounce to avoid excessive API calls
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  // Pagination state
  const [page, setPage] = useState(0)

  // Query with server-side params
  const { data, isLoading } = useAllInvitations({
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const invitations = data?.invitations || []
  const totalCount = data?.totalCount || 0
  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  // Cancel mutation
  const cancelInvitation = useCancelInvitationGlobal()
  const addToast = useToastStore((state) => state.addToast)

  // Reset to page 0 when search changes
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  const handleCancelInvitation = useCallback(async (invitation: InvitationWithOrg) => {
    try {
      await cancelInvitation.mutateAsync({
        invitationId: invitation.id,
        organizationId: invitation.organization_id,
      })
      addToast({
        title: 'Invitation canceled',
        description: `Invitation for ${invitation.email} has been canceled.`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Error canceling invitation:', error)
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel invitation.',
        variant: 'destructive',
      })
    }
  }, [cancelInvitation, addToast])

  const columns: ColumnDef<InvitationWithOrg>[] = useMemo(
    () => [
      {
        id: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.email}</span>
          </div>
        ),
      },
      {
        id: 'organization',
        header: 'Organization',
        cell: ({ row }) => (
          <Link
            href={`/organizations/${row.original.organization_id}`}
            className="text-primary hover:underline"
          >
            {row.original.organization_name}
          </Link>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Badge variant={ROLE_VARIANTS[row.original.role] || 'outline'}>
            {row.original.role.charAt(0).toUpperCase() + row.original.role.slice(1)}
          </Badge>
        ),
      },
      {
        accessorKey: 'invited_at',
        header: 'Invited',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.invited_at), {
              addSuffix: true,
            })}
          </span>
        ),
      },
      {
        accessorKey: 'expires_at',
        header: 'Expires',
        cell: ({ row }) => {
          const expiresAt = new Date(row.original.expires_at)
          const isExpiringSoon = expiresAt.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000 // 2 days

          return (
            <div className="flex items-center gap-1">
              {isExpiringSoon && <Clock className="h-3 w-3 text-amber-500" />}
              <span className={`text-sm ${isExpiringSoon ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {formatDistanceToNow(expiresAt, { addSuffix: true })}
              </span>
            </div>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleCancelInvitation(row.original)}
                disabled={cancelInvitation.isPending}
                className="text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Invitation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [cancelInvitation.isPending, handleCancelInvitation]
  )

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by email or organization..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Data table with server-side pagination */}
      <DataTable
        columns={columns}
        data={invitations}
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
