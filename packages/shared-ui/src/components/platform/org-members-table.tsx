'use client'

import * as React from 'react'
import { useMemo, useState, useEffect } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  useOrgMembersPaginated,
  useUpdateMemberRole,
  useToggleMemberActive,
  useAuthorization,
  useAuth,
  useDebounce,
  type OrgMemberWithInviter,
} from '@playze/shared-auth'
import { DataTable } from '../data-table'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { MoreHorizontal, Users, AlertCircle, Shield, UserCheck, UserX } from 'lucide-react'

// Role hierarchy levels
const ROLE_LEVELS: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

export interface OrgMembersTableProps {
  /** Organization ID to fetch members for */
  organizationId: string | undefined
  /** App ID for permission check */
  appId: string
  /** Whether to show action buttons - default: true */
  showActions?: boolean
  /** Custom empty state message */
  emptyMessage?: string
  /** Additional CSS class */
  className?: string
  /** Number of items per page - default: 10 */
  pageSize?: number
  /**
   * Callback when action completes
   * @param action - The action that was performed
   * @param member - The member affected
   */
  onActionComplete?: (action: 'role_changed' | 'status_changed', member: OrgMemberWithInviter) => void
}

/**
 * OrgMembersTable - Display members of an organization with pagination and search
 *
 * Features:
 * - Displays member avatar, name, email, role, status, joined date
 * - Server-side search on email and name (debounced 300ms)
 * - Server-side pagination (scales to 1000+ members)
 * - Actions dropdown (for users with can_manage_members permission)
 *   - Change role (respects role hierarchy)
 *   - Activate/Deactivate member
 * - Confirmation dialogs before actions
 * - Loading state with DataTable skeleton
 * - Empty state message
 *
 * @example
 * ```tsx
 * const { data: org } = useCurrentOrganization()
 *
 * <OrgMembersTable
 *   organizationId={org?.id}
 *   appId="infracloud"
 *   showActions={true}
 *   pageSize={10}
 * />
 * ```
 */
export function OrgMembersTable({
  organizationId,
  appId,
  showActions = true,
  emptyMessage = 'No members found',
  className,
  pageSize = 10,
  onActionComplete,
}: OrgMembersTableProps) {
  // Search with debounce to avoid excessive API calls
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  // Pagination state
  const [page, setPage] = useState(0)

  // Reset to page 0 when search changes
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  // Query with server-side params
  const { data, isLoading, error } = useOrgMembersPaginated(organizationId, appId, {
    search: debouncedSearch || undefined,
    limit: pageSize,
    offset: page * pageSize,
  })

  const members = data?.members || []
  const totalCount = data?.totalCount || 0
  const pageCount = Math.ceil(totalCount / pageSize) || 1

  const { data: auth } = useAuthorization(appId)
  const { data: currentUser } = useAuth()
  const updateRole = useUpdateMemberRole()
  const toggleActive = useToggleMemberActive()

  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean
    type: 'role' | 'status'
    member: OrgMemberWithInviter | null
    newRole?: string
    newStatus?: boolean
  }>({ open: false, type: 'role', member: null })

  const canManageMembers = auth?.role_permissions?.can_manage_members === true
  const currentUserRole = auth?.user_role || 'viewer'
  const currentUserRoleLevel = ROLE_LEVELS[currentUserRole] || 0

  /**
   * Check if current user can manage the given member
   * - Must have can_manage_members permission
   * - Cannot manage self
   * - Can only manage members at same or lower role level
   */
  const canManageMember = (member: OrgMemberWithInviter) => {
    if (!canManageMembers) return false
    if (member.user_id === currentUser?.id) return false
    const memberRoleLevel = ROLE_LEVELS[member.role] || 0
    return memberRoleLevel <= currentUserRoleLevel
  }

  /**
   * Get roles that current user can assign (same or lower level)
   */
  const getAvailableRoles = () => {
    return Object.entries(ROLE_LEVELS)
      .filter(([, level]) => level <= currentUserRoleLevel)
      .sort(([, a], [, b]) => b - a) // Sort by level descending (owner first)
      .map(([role]) => role)
  }

  const handleRoleChange = (member: OrgMemberWithInviter, newRole: string) => {
    setConfirmDialog({
      open: true,
      type: 'role',
      member,
      newRole,
    })
  }

  const handleStatusToggle = (member: OrgMemberWithInviter) => {
    setConfirmDialog({
      open: true,
      type: 'status',
      member,
      newStatus: !member.is_active,
    })
  }

  const confirmAction = async () => {
    if (!confirmDialog.member || !organizationId) return

    try {
      if (confirmDialog.type === 'role' && confirmDialog.newRole) {
        await updateRole.mutateAsync({
          organizationId,
          userId: confirmDialog.member.user_id,
          newRole: confirmDialog.newRole as 'owner' | 'admin' | 'member' | 'viewer',
          appId,
        })
        onActionComplete?.('role_changed', confirmDialog.member)
      } else if (confirmDialog.type === 'status' && confirmDialog.newStatus !== undefined) {
        await toggleActive.mutateAsync({
          organizationId,
          userId: confirmDialog.member.user_id,
          isActive: confirmDialog.newStatus,
          appId,
        })
        onActionComplete?.('status_changed', confirmDialog.member)
      }
    } catch (err) {
      // Error is thrown from the mutation, let it bubble up
      console.error('Action failed:', err)
    }

    setConfirmDialog({ open: false, type: 'role', member: null })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  // Define columns for DataTable
  const columns: ColumnDef<OrgMemberWithInviter>[] = useMemo(
    () => [
      {
        id: 'member',
        header: 'Member',
        cell: ({ row }) => {
          const member = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.avatar_url || undefined} />
                <AvatarFallback>{getInitials(member.full_name, member.email)}</AvatarFallback>
              </Avatar>
              <div>
                <div className={`font-medium ${!member.is_active ? 'opacity-60' : ''}`}>
                  {member.full_name || member.email}
                  {member.user_id === currentUser?.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                  )}
                </div>
                {member.full_name && (
                  <div className="text-sm text-muted-foreground">{member.email}</div>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {ROLE_LABELS[row.original.role] || row.original.role}
          </Badge>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="secondary" className="gap-1">
              <UserCheck className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <UserX className="h-3 w-3" />
              Inactive
            </Badge>
          ),
      },
      {
        id: 'joined',
        header: 'Joined',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(row.original.joined_at)}
          </span>
        ),
      },
      {
        id: 'invitedBy',
        header: 'Invited by',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.invited_by_name || '—'}
          </span>
        ),
      },
      // Actions column - only show if user can manage members
      ...(showActions && canManageMembers
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: OrgMemberWithInviter } }) => {
                const member = row.original
                if (!canManageMember(member)) return null

                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Shield className="mr-2 h-4 w-4" />
                          Change Role
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {getAvailableRoles().map((role) => (
                            <DropdownMenuItem
                              key={role}
                              disabled={role === member.role}
                              onClick={() => handleRoleChange(member, role)}
                            >
                              {ROLE_LABELS[role]}
                              {role === member.role && ' (current)'}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem onClick={() => handleStatusToggle(member)}>
                        {member.is_active ? (
                          <>
                            <UserX className="mr-2 h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              },
            } as ColumnDef<OrgMemberWithInviter>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser?.id, canManageMembers, currentUserRoleLevel, showActions]
  )

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 text-destructive p-4 ${className || ''}`}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load members</span>
      </div>
    )
  }

  // Empty state (no search, no results)
  if (!isLoading && totalCount === 0 && !debouncedSearch) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-8 text-muted-foreground ${className || ''}`}
      >
        <Users className="h-8 w-8 mb-2" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Data table with server-side pagination and controlled search */}
      <DataTable
        columns={columns}
        data={members}
        isLoading={isLoading}
        manualPagination
        pageCount={pageCount}
        pageIndex={page}
        onPageChange={setPage}
        pageSize={pageSize}
        totalCount={totalCount}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search members by name or email..."
        initialColumnVisibility={{ invitedBy: false }}
      />

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open: boolean) => !open && setConfirmDialog({ ...confirmDialog, open: false })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'role'
                ? 'Change Member Role'
                : confirmDialog.newStatus
                  ? 'Activate Member'
                  : 'Deactivate Member'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'role' ? (
                <>
                  Are you sure you want to change{' '}
                  <strong>
                    {confirmDialog.member?.full_name || confirmDialog.member?.email}
                  </strong>
                  &apos;s role from{' '}
                  <strong>{ROLE_LABELS[confirmDialog.member?.role || '']}</strong> to{' '}
                  <strong>{ROLE_LABELS[confirmDialog.newRole || '']}</strong>?
                </>
              ) : confirmDialog.newStatus ? (
                <>
                  Are you sure you want to activate{' '}
                  <strong>
                    {confirmDialog.member?.full_name || confirmDialog.member?.email}
                  </strong>
                  ? They will regain access to the organization.
                </>
              ) : (
                <>
                  Are you sure you want to deactivate{' '}
                  <strong>
                    {confirmDialog.member?.full_name || confirmDialog.member?.email}
                  </strong>
                  ? They will lose access to the organization until reactivated.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={updateRole.isPending || toggleActive.isPending}
            >
              {updateRole.isPending || toggleActive.isPending ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
