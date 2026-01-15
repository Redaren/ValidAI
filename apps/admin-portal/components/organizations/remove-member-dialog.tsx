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
import { useRemoveMember, type MemberOrInvitation } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface RemoveMemberDialogProps {
  organizationId: string
  organizationName: string
  member: MemberOrInvitation | null
  isOpen: boolean
  onClose: () => void
}

export function RemoveMemberDialog({
  organizationId,
  organizationName,
  member,
  isOpen,
  onClose,
}: RemoveMemberDialogProps) {
  const removeMember = useRemoveMember()
  const addToast = useToastStore((state) => state.addToast)

  const handleConfirm = async () => {
    if (!member) return

    try {
      await removeMember.mutateAsync({
        organizationId,
        userId: member.id,
      })

      addToast({
        title: 'Member removed',
        description: `${member.full_name || member.email} has been removed from ${organizationName}.`,
        variant: 'success',
      })

      onClose()
    } catch (error) {
      console.error('Error removing member:', error)
      addToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member.',
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
            Are you sure you want to remove <strong>{member?.full_name || member?.email}</strong>{' '}
            from <strong>{organizationName}</strong>?
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mt-4">
          <p className="text-sm">
            This action cannot be undone. The user will lose all access to this organization and
            its resources.
          </p>
        </Alert>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={removeMember.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={removeMember.isPending}>
            {removeMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
