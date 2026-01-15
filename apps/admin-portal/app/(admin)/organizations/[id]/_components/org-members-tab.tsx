'use client'

import { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import {
  Card,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DataTable,
  Input,
} from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'
import {
  Loader2,
  User,
  MoreHorizontal,
  Mail,
  Clock,
  XCircle,
  Edit,
  UserPlus,
  Link,
  Search,
  UserCheck,
  UserX,
  UserMinus,
} from 'lucide-react'
import {
  useOrganizationMembersAndInvitations,
  useCancelInvitation,
  useResendInvitation,
  useUpdateInvitationRole,
  useToggleMemberActive,
  ResendInvitationError,
  type MemberOrInvitation,
} from '@/lib/queries'
import { useDebounce } from '@/hooks'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { AssignMembershipDialog } from '@/components/organizations/assign-membership-dialog'
import { InviteMemberDialog } from '@/components/organizations/invite-member-dialog'
import { EditMemberRoleDialog } from '@/components/organizations/edit-member-role-dialog'
import { RemoveMemberDialog } from '@/components/organizations/remove-member-dialog'
import { useToastStore } from '@/stores'

interface OrgMembersTabProps {
  organizationId: string
  organizationName: string
}

const PAGE_SIZE = 10

export function OrgMembersTab({ organizationId, organizationName }: OrgMembersTabProps) {
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<string | null>(null)

  // Member action state
  const [editingMember, setEditingMember] = useState<MemberOrInvitation | null>(null)
  const [removingMember, setRemovingMember] = useState<MemberOrInvitation | null>(null)
  const [togglingMember, setTogglingMember] = useState<MemberOrInvitation | null>(null)

  // Search and pagination state (client-side filtering)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)
  const [page, setPage] = useState(0)

  // Reset to page 0 when search changes
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  const { data: items, isLoading } = useOrganizationMembersAndInvitations(organizationId)
  const cancelInvitation = useCancelInvitation()
  const resendInvitation = useResendInvitation()
  const updateInvitationRole = useUpdateInvitationRole()
  const toggleMemberActive = useToggleMemberActive()
  const addToast = useToastStore((state) => state.addToast)

  // Client-side filtering
  const filteredItems = useMemo(() => {
    if (!items) return []
    if (!debouncedSearch) return items

    const searchLower = debouncedSearch.toLowerCase()
    return items.filter(item =>
      item.email.toLowerCase().includes(searchLower) ||
      (item.full_name && item.full_name.toLowerCase().includes(searchLower))
    )
  }, [items, debouncedSearch])

  // Client-side pagination
  const paginatedItems = useMemo(() => {
    const start = page * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  const totalCount = filteredItems.length
  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await cancelInvitation.mutateAsync({ invitationId, organizationId })
      addToast({
        title: 'Invitation canceled',
        description: 'The invitation has been canceled.',
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
  }

  const handleResendInvitation = async (invitationId: string) => {
    try {
      const result = await resendInvitation.mutateAsync({ invitationId, organizationId })
      addToast({
        title: 'Invitation resent',
        description: result?.message || 'A new magic link has been sent to the user.',
        variant: 'success',
      })
    } catch (error: unknown) {
      console.error('Error resending invitation:', error)

      // Check if error is a ResendInvitationError with invitation URL for manual sharing
      if (error instanceof ResendInvitationError && error.invitationUrl) {
        addToast({
          title: 'Could not send email',
          description: 'Copy the invitation link to share manually.',
          variant: 'default',
        })
        // Auto-copy the URL to clipboard
        try {
          await navigator.clipboard.writeText(error.invitationUrl)
          addToast({
            title: 'Link copied',
            description: 'Invitation link copied to clipboard.',
            variant: 'success',
          })
        } catch (clipboardError) {
          console.error('Failed to copy to clipboard:', clipboardError)
        }
      } else {
        addToast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to resend invitation.',
          variant: 'destructive',
        })
      }
    }
  }

  const handleCopyInvitationLink = async (invitationId: string) => {
    // Get the organization's default app URL from the items data
    // For now, use the current origin as fallback
    const baseUrl = window.location.origin.replace('admin-portal', 'validai').replace(':3001', ':3000')
    const invitationUrl = `${baseUrl}/auth/accept-invite?invitation_id=${invitationId}`

    try {
      await navigator.clipboard.writeText(invitationUrl)
      addToast({
        title: 'Link copied',
        description: 'Invitation link copied to clipboard.',
        variant: 'success',
      })
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      addToast({
        title: 'Error',
        description: 'Failed to copy link to clipboard.',
        variant: 'destructive',
      })
    }
  }

  const handleEditRole = (item: MemberOrInvitation) => {
    setEditingRoleId(item.id)
    setPendingRole(item.role)
  }

  const handleSaveRole = async () => {
    if (!editingRoleId || !pendingRole) return

    try {
      await updateInvitationRole.mutateAsync({
        invitationId: editingRoleId,
        organizationId,
        role: pendingRole as 'owner' | 'admin' | 'member' | 'viewer',
      })
      addToast({
        title: 'Role updated',
        description: 'The invitation role has been updated.',
        variant: 'success',
      })
      setEditingRoleId(null)
      setPendingRole(null)
    } catch (error) {
      console.error('Error updating role:', error)
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update role.',
        variant: 'destructive',
      })
    }
  }

  const handleCancelEdit = () => {
    setEditingRoleId(null)
    setPendingRole(null)
  }

  // Handler for toggling member active status
  const handleToggleConfirm = async () => {
    if (!togglingMember) return

    try {
      await toggleMemberActive.mutateAsync({
        organizationId,
        userId: togglingMember.id,
        isActive: !togglingMember.member_is_active,
      })
      addToast({
        title: togglingMember.member_is_active ? 'Membership deactivated' : 'Membership activated',
        description: `${togglingMember.full_name || togglingMember.email}'s membership has been ${togglingMember.member_is_active ? 'deactivated' : 'activated'}.`,
        variant: 'success',
      })
    } catch (error) {
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to toggle membership status',
        variant: 'destructive',
      })
    } finally {
      setTogglingMember(null)
    }
  }

  // Define columns for DataTable
  const columns: ColumnDef<MemberOrInvitation>[] = useMemo(
    () => [
      {
        id: 'member',
        header: 'Member / Email',
        cell: ({ row }) => {
          const item = row.original
          return (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {item.avatar_url ? (
                  <Image
                    src={item.avatar_url}
                    alt={item.full_name || 'User'}
                    width={40}
                    height={40}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : item.entry_type === 'invitation' ? (
                  <Mail className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <User className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {item.full_name || item.email}
                  </p>
                  {item.entry_type === 'invitation' && (
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
                {item.full_name && (
                  <p className="text-xs text-muted-foreground">{item.email}</p>
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
          <Badge
            variant={
              row.original.role === 'owner' ? 'default' :
              row.original.role === 'admin' ? 'secondary' : 'outline'
            }
          >
            {row.original.role.charAt(0).toUpperCase() + row.original.role.slice(1)}
          </Badge>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const item = row.original
          if (item.entry_type === 'member') {
            return (
              <span className={item.member_is_active ? 'text-foreground' : 'text-muted-foreground'}>
                {item.member_is_active ? 'Active' : 'Inactive'}
              </span>
            )
          }
          return (
            <span className="text-sm text-muted-foreground">
              Invited {formatRelativeTime(item.invited_at)}
              <br />
              <span className="text-xs">Expires {formatRelativeTime(item.expires_at)}</span>
            </span>
          )
        },
      },
      {
        id: 'joined',
        header: 'Joined',
        cell: ({ row }) => {
          const item = row.original
          if (item.entry_type === 'member') {
            return (
              <span className={`text-sm text-muted-foreground ${!item.member_is_active ? 'opacity-60' : ''}`}>
                {formatDate(item.joined_at)}
              </span>
            )
          }
          return <span className="text-muted-foreground">—</span>
        },
      },
      {
        id: 'invitedBy',
        header: 'Invited By',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.invited_by_name || '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const item = row.original

          // Actions for members
          if (item.entry_type === 'member') {
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTogglingMember(item)}>
                    {item.member_is_active ? (
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
                  <DropdownMenuItem onClick={() => setEditingMember(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Change Role
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setRemovingMember(item)}
                    className="text-destructive"
                  >
                    <UserMinus className="mr-2 h-4 w-4" />
                    Remove from Organization
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }

          // Actions for invitations
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleResendInvitation(item.id)}
                  disabled={resendInvitation.isPending}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Resend Invitation
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleCopyInvitationLink(item.id)}
                >
                  <Link className="mr-2 h-4 w-4" />
                  Copy Invitation Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEditRole(item)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Role
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleCancelInvitation(item.id)}
                  disabled={cancelInvitation.isPending}
                  className="text-destructive"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Invitation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resendInvitation.isPending, cancelInvitation.isPending, toggleMemberActive.isPending]
  )

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (!items || items.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <User className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No members yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This organization doesn&apos;t have any members yet.
            Invite someone to get started.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Assign Existing User
            </Button>
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <Mail className="mr-2 h-4 w-4" />
              Invite by Email
            </Button>
          </div>
        </div>

        <AssignMembershipDialog
          organizationId={organizationId}
          isOpen={isAssignDialogOpen}
          onClose={() => setIsAssignDialogOpen(false)}
        />
        <InviteMemberDialog
          organizationId={organizationId}
          organizationName={organizationName}
          isOpen={isInviteDialogOpen}
          onClose={() => setIsInviteDialogOpen(false)}
        />
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Members & Invitations</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsAssignDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign User
          </Button>
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            <Mail className="mr-2 h-4 w-4" />
            Invite
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Data table with client-side pagination */}
        <DataTable
          columns={columns}
          data={paginatedItems}
          isLoading={false}
          manualPagination
          pageCount={pageCount}
          pageIndex={page}
          onPageChange={setPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
        />
      </div>

      <AssignMembershipDialog
        organizationId={organizationId}
        isOpen={isAssignDialogOpen}
        onClose={() => setIsAssignDialogOpen(false)}
      />
      <InviteMemberDialog
        organizationId={organizationId}
        organizationName={organizationName}
        isOpen={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
      />

      {/* Edit Role Dialog */}
      <Dialog open={!!editingRoleId} onOpenChange={() => handleCancelEdit()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Invitation Role</DialogTitle>
            <DialogDescription>
              Change the role that will be assigned when the user accepts the invitation.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select
              value={pendingRole || 'member'}
              onValueChange={setPendingRole}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (Read-only access)</SelectItem>
                <SelectItem value="member">Member (Standard access)</SelectItem>
                <SelectItem value="admin">Admin (Manage members and settings)</SelectItem>
                <SelectItem value="owner">Owner (Full control)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={updateInvitationRole.isPending}
            >
              {updateInvitationRole.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Management Dialogs */}
      <EditMemberRoleDialog
        organizationId={organizationId}
        organizationName={organizationName}
        member={editingMember}
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
      />

      <RemoveMemberDialog
        organizationId={organizationId}
        organizationName={organizationName}
        member={removingMember}
        isOpen={!!removingMember}
        onClose={() => setRemovingMember(null)}
      />

      {/* Toggle Active Confirmation Dialog */}
      <AlertDialog
        open={!!togglingMember}
        onOpenChange={(open) => !open && setTogglingMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingMember?.member_is_active ? 'Deactivate Membership' : 'Activate Membership'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingMember?.member_is_active ? (
                <>
                  Are you sure you want to deactivate{' '}
                  <strong>{togglingMember?.full_name || togglingMember?.email}</strong>&apos;s
                  membership in <strong>{organizationName}</strong>? They will lose access to the
                  organization until reactivated.
                </>
              ) : (
                <>
                  Are you sure you want to activate{' '}
                  <strong>{togglingMember?.full_name || togglingMember?.email}</strong>&apos;s
                  membership in <strong>{organizationName}</strong>? They will regain access to the
                  organization.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleConfirm} disabled={toggleMemberActive.isPending}>
              {toggleMemberActive.isPending ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
