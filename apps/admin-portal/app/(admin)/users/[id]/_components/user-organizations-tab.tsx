'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Card,
  Button,
  DataTable,
  SortableHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@playze/shared-ui'
import {
  Loader2,
  Building2,
  MoreHorizontal,
  Edit,
  UserMinus,
  Plus,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useUserMemberships, useToggleUserMembershipActive } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { AssignToOrganizationDialog } from '@/components/users/assign-to-organization-dialog'
import { EditMembershipRoleDialog } from '@/components/users/edit-membership-role-dialog'
import { RemoveMembershipDialog } from '@/components/users/remove-membership-dialog'
import { useToastStore } from '@/stores'

interface UserOrganizationsTabProps {
  userId: string
  userName: string
}

interface Membership {
  organization_id: string
  organization_name: string
  organization_is_active: boolean
  role: string
  joined_at: string
  member_is_active: boolean
  invited_by_name: string | null
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

export function UserOrganizationsTab({ userId, userName }: UserOrganizationsTabProps) {
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null)
  const [removingMembership, setRemovingMembership] = useState<Membership | null>(null)
  const [togglingMembership, setTogglingMembership] = useState<Membership | null>(null)

  const { data: memberships, isLoading } = useUserMemberships(userId) as {
    data: Membership[] | undefined
    isLoading: boolean
  }

  const toggleActive = useToggleUserMembershipActive()
  const { addToast } = useToastStore()

  const handleToggleConfirm = async () => {
    if (!togglingMembership) return

    try {
      await toggleActive.mutateAsync({
        userId,
        organizationId: togglingMembership.organization_id,
        isActive: !togglingMembership.member_is_active,
      })
      addToast({
        title: togglingMembership.member_is_active ? 'Membership deactivated' : 'Membership activated',
        description: `${userName}'s membership in ${togglingMembership.organization_name} has been ${togglingMembership.member_is_active ? 'deactivated' : 'activated'}.`,
        variant: 'success',
      })
    } catch (error) {
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to toggle membership status',
        variant: 'destructive',
      })
    } finally {
      setTogglingMembership(null)
    }
  }

  const columns = useMemo<ColumnDef<Membership>[]>(
    () => [
      {
        id: 'icon',
        header: '',
        cell: () => (
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'organization_name',
        header: ({ column }) => <SortableHeader column={column} title="Organization" />,
        cell: ({ row }) => (
          <Link
            href={`/organizations/${row.original.organization_id}`}
            className={`font-medium hover:underline ${!row.original.member_is_active ? 'opacity-60' : ''}`}
          >
            {row.original.organization_name}
          </Link>
        ),
      },
      {
        accessorKey: 'role',
        header: ({ column }) => <SortableHeader column={column} title="Role" />,
        cell: ({ row }) => (
          <span className={!row.original.member_is_active ? 'opacity-60' : ''}>
            {ROLE_LABELS[row.original.role] || row.original.role}
          </span>
        ),
      },
      {
        accessorKey: 'member_is_active',
        header: ({ column }) => <SortableHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <span className={row.original.member_is_active ? 'text-foreground' : 'text-muted-foreground'}>
            {row.original.member_is_active ? 'Active' : 'Inactive'}
          </span>
        ),
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.member_is_active ? 1 : 0
          const b = rowB.original.member_is_active ? 1 : 0
          return a - b
        },
      },
      {
        accessorKey: 'joined_at',
        header: ({ column }) => <SortableHeader column={column} title="Joined" />,
        cell: ({ row }) => (
          <span className={`text-muted-foreground ${!row.original.member_is_active ? 'opacity-60' : ''}`}>
            {formatDate(row.original.joined_at)}
          </span>
        ),
        sortingFn: (rowA, rowB) => {
          const a = new Date(rowA.original.joined_at).getTime()
          const b = new Date(rowB.original.joined_at).getTime()
          return a - b
        },
      },
      {
        accessorKey: 'invited_by_name',
        header: ({ column }) => <SortableHeader column={column} title="Invited By" />,
        cell: ({ row }) => (
          <span className={`text-muted-foreground ${!row.original.member_is_active ? 'opacity-60' : ''}`}>
            {row.original.invited_by_name || '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const membership = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTogglingMembership(membership)}>
                  {membership.member_is_active ? (
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
                <DropdownMenuItem onClick={() => setEditingMembership(membership)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Change Role
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setRemovingMembership(membership)}
                  className="text-destructive"
                >
                  <UserMinus className="mr-2 h-4 w-4" />
                  Remove from Organization
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        enableSorting: false,
      },
    ],
    []
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

  if (!memberships || memberships.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No organizations</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This user is not a member of any organizations yet.
          </p>
          <Button className="mt-4" onClick={() => setIsAssignDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add to Organization
          </Button>
        </div>

        <AssignToOrganizationDialog
          userId={userId}
          userName={userName}
          isOpen={isAssignDialogOpen}
          onClose={() => setIsAssignDialogOpen(false)}
        />
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Organizations ({memberships.length})</h3>
        <Button onClick={() => setIsAssignDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add to Organization
        </Button>
      </div>

      <DataTable columns={columns} data={memberships} pageSize={10} />

      {/* Dialogs */}
      <AssignToOrganizationDialog
        userId={userId}
        userName={userName}
        isOpen={isAssignDialogOpen}
        onClose={() => setIsAssignDialogOpen(false)}
      />

      <EditMembershipRoleDialog
        userId={userId}
        membership={editingMembership}
        isOpen={!!editingMembership}
        onClose={() => setEditingMembership(null)}
      />

      <RemoveMembershipDialog
        userId={userId}
        userName={userName}
        membership={removingMembership}
        isOpen={!!removingMembership}
        onClose={() => setRemovingMembership(null)}
      />

      {/* Toggle Active Confirmation Dialog */}
      <AlertDialog
        open={!!togglingMembership}
        onOpenChange={(open) => !open && setTogglingMembership(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingMembership?.member_is_active ? 'Deactivate Membership' : 'Activate Membership'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingMembership?.member_is_active ? (
                <>
                  Are you sure you want to deactivate <strong>{userName}</strong>&apos;s membership in{' '}
                  <strong>{togglingMembership?.organization_name}</strong>? They will lose access to
                  the organization until reactivated.
                </>
              ) : (
                <>
                  Are you sure you want to activate <strong>{userName}</strong>&apos;s membership in{' '}
                  <strong>{togglingMembership?.organization_name}</strong>? They will regain access to
                  the organization.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleConfirm} disabled={toggleActive.isPending}>
              {toggleActive.isPending ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
