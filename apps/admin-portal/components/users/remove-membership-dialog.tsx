'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Alert,
} from '@playze/shared-ui'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useRemoveUserMembership } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface Membership {
  organization_id: string
  organization_name: string
  role: string
}

interface RemoveMembershipDialogProps {
  userId: string
  userName: string
  membership: Membership | null
  isOpen: boolean
  onClose: () => void
}

export function RemoveMembershipDialog({
  userId,
  userName,
  membership,
  isOpen,
  onClose,
}: RemoveMembershipDialogProps) {
  const removeMembership = useRemoveUserMembership()
  const addToast = useToastStore((state) => state.addToast)

  const handleConfirm = async () => {
    if (!membership) return

    try {
      await removeMembership.mutateAsync({
        userId,
        organizationId: membership.organization_id,
      })

      addToast({
        title: 'Membership removed',
        description: `${userName} has been removed from ${membership.organization_name}.`,
        variant: 'success',
      })

      onClose()
    } catch (error) {
      console.error('Error removing membership:', error)
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove membership.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Remove from Organization
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{userName}</strong> from{' '}
            <strong>{membership?.organization_name}</strong>?
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mt-4">
          <p className="text-sm">
            This action cannot be undone. The user will lose all access to this organization
            and its resources.
          </p>
        </Alert>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={removeMembership.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={removeMembership.isPending}
          >
            {removeMembership.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
