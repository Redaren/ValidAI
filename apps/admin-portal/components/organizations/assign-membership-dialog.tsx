'use client'

import { useState, useMemo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  Badge,
  DataTable,
} from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'
import { Loader2, User, CheckCircle2 } from 'lucide-react'
import { assignMembershipSchema, type AssignMembershipInput } from '@/lib/validations'
import { useAssignMember } from '@/lib/queries/organizations'
import { useUsers } from '@/lib/queries/users'
import { useToastStore } from '@/stores'

interface AssignMembershipDialogProps {
  organizationId: string
  isOpen: boolean
  onClose: () => void
}

interface UserRow {
  id: string
  email: string
  full_name: string | null
  organization_count: number
}

export function AssignMembershipDialog({
  organizationId,
  isOpen,
  onClose,
}: AssignMembershipDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<'owner' | 'admin' | 'member' | 'viewer'>('member')
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)

  const { data, isLoading: loadingUsers } = useUsers()
  const users = data?.users || []
  const assignMember = useAssignMember()
  const addToast = useToastStore((state) => state.addToast)

  const {
    handleSubmit,
    formState: { isSubmitting },
    setValue,
    reset,
  } = useForm<AssignMembershipInput>({
    resolver: zodResolver(assignMembershipSchema),
    defaultValues: {
      organizationId,
      userId: '',
      role: 'member',
    },
  })

  const handleSelectUser = useCallback((userId: string) => {
    // Toggle selection: if clicking the already-selected user, deselect them
    if (selectedUserId === userId) {
      setSelectedUserId(null)
      setValue('userId', '')
      setShowDuplicateWarning(false)
    } else {
      // Select new user
      setSelectedUserId(userId)
      setValue('userId', userId)
      setShowDuplicateWarning(false)
    }
  }, [selectedUserId, setValue])

  // Table columns for user selection
  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'select',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            {selectedUserId === row.original.id && (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
          </div>
        ),
      },
      {
        accessorKey: 'full_name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium">
              {row.original.full_name || 'Unknown User'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: 'organization_count',
        header: 'Organizations',
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.organization_count}
          </Badge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant={selectedUserId === row.original.id ? 'default' : 'outline'}
            onClick={() => handleSelectUser(row.original.id)}
          >
            {selectedUserId === row.original.id ? 'Selected' : 'Select'}
          </Button>
        ),
      },
    ],
    [selectedUserId, handleSelectUser]
  )

  const handleRoleChange = (role: 'owner' | 'admin' | 'member' | 'viewer') => {
    setSelectedRole(role)
    setValue('role', role)
  }

  const onSubmit = async (data: AssignMembershipInput) => {
    try {
      await assignMember.mutateAsync(data)

      addToast({
        title: 'Member assigned',
        description: 'The user has been successfully added as a member to this organization.',
        variant: 'success',
      })

      handleClose()
    } catch (error) {
      console.error('Error assigning member:', error)

      // Extract error message from Supabase PostgREST error object
      // Handles both standard Error instances and plain objects with message property
      const errorMessage = error instanceof Error
        ? error.message
        : typeof (error as Record<string, unknown>)?.message === 'string'
          ? (error as { message: string }).message
          : String(error || '')

      // Check if error is about duplicate membership
      if (errorMessage.includes('already a member')) {
        setShowDuplicateWarning(true)
      }
      // Error feedback is shown via the Alert component below (no toast needed)
    }
  }

  const handleClose = () => {
    reset()
    setSelectedUserId(null)
    setSelectedRole('member')
    setShowDuplicateWarning(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Membership</DialogTitle>
          <DialogDescription>
            Select a user from the list below and assign them a role in this organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 flex-1 overflow-hidden">
          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedRole}
              onValueChange={handleRoleChange}
              disabled={isSubmitting}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (Read-only access)</SelectItem>
                <SelectItem value="member">Member (Standard access)</SelectItem>
                <SelectItem value="admin">Admin (Manage members and settings)</SelectItem>
                <SelectItem value="owner">Owner (Full control)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The role determines what actions the user can perform within the organization.
            </p>
          </div>

          {/* User Selection Table */}
          <div className="flex-1 overflow-hidden flex flex-col space-y-2">
            <Label>
              Select User <span className="text-destructive">*</span>
            </Label>
            <div className="flex-1 overflow-hidden border rounded-md">
              <DataTable
                columns={columns}
                data={users || []}
                isLoading={loadingUsers}
                searchKey="email"
                searchPlaceholder="Search by email or name..."
                pageSize={5}
              />
            </div>
          </div>

          {/* Duplicate Warning */}
          {showDuplicateWarning && (
            <Alert variant="destructive">
              <p className="text-sm">
                This user is already a member of this organization. The membership was not updated.
                To change their role, please use the member management interface.
              </p>
            </Alert>
          )}

          {/* Error Alert */}
          {assignMember.error && !showDuplicateWarning && (
            <Alert variant="destructive">
              <p className="text-sm">
                {assignMember.error instanceof Error
                  ? assignMember.error.message
                  : typeof (assignMember.error as Record<string, unknown>)?.message === 'string'
                    ? (assignMember.error as { message: string }).message
                    : 'An unexpected error occurred'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedUserId}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Assigning...' : 'Assign Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
