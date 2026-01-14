'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { useUpdateUserMembershipRole } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface Membership {
  organization_id: string
  organization_name: string
  role: string
}

interface EditMembershipRoleDialogProps {
  userId: string
  membership: Membership | null
  isOpen: boolean
  onClose: () => void
}

export function EditMembershipRoleDialog({
  userId,
  membership,
  isOpen,
  onClose,
}: EditMembershipRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<string>('member')
  const updateRole = useUpdateUserMembershipRole()
  const addToast = useToastStore((state) => state.addToast)

  // Reset role when membership changes
  useEffect(() => {
    if (membership) {
      setSelectedRole(membership.role)
    }
  }, [membership])

  const handleSave = async () => {
    if (!membership) return

    try {
      await updateRole.mutateAsync({
        userId,
        organizationId: membership.organization_id,
        role: selectedRole as 'owner' | 'admin' | 'member' | 'viewer',
      })

      addToast({
        title: 'Role updated',
        description: `Role has been changed to ${selectedRole}.`,
        variant: 'success',
      })

      onClose()
    } catch (error) {
      console.error('Error updating role:', error)
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update role.',
        variant: 'destructive',
      })
    }
  }

  const handleClose = () => {
    setSelectedRole(membership?.role || 'member')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Role</DialogTitle>
          <DialogDescription>
            Change the role for this user in <strong>{membership?.organization_name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select
            value={selectedRole}
            onValueChange={setSelectedRole}
            disabled={updateRole.isPending}
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
          <Button variant="outline" onClick={handleClose} disabled={updateRole.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateRole.isPending || selectedRole === membership?.role}
          >
            {updateRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
