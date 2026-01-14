'use client'

import { useRouter } from 'next/navigation'
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
import { useDeleteUser } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface DeleteUserDialogProps {
  userId: string
  userName: string
  userEmail: string
  isOpen: boolean
  onClose: () => void
}

export function DeleteUserDialog({
  userId,
  userName,
  userEmail,
  isOpen,
  onClose,
}: DeleteUserDialogProps) {
  const router = useRouter()
  const deleteUser = useDeleteUser()
  const addToast = useToastStore((state) => state.addToast)

  const handleConfirm = async () => {
    try {
      await deleteUser.mutateAsync(userId)

      addToast({
        title: 'User deleted',
        description: `${userName || userEmail} has been permanently deleted.`,
        variant: 'success',
      })

      onClose()
      // Navigate back to users list since user no longer exists
      router.push('/users')
    } catch (error) {
      console.error('Error deleting user:', error)
      const message = error instanceof Error ? error.message : 'Failed to delete user.'
      // Check if this is a business logic rejection (not a system error)
      const isBusinessLogic = message.includes('sole owner') || message.includes('Cannot delete')

      // Close dialog so user can see the toast message clearly
      onClose()

      addToast({
        title: isBusinessLogic ? 'Cannot Delete User' : 'Error',
        description: message,
        variant: isBusinessLogic ? 'default' : 'destructive',
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete User Permanently
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{' '}
            <strong>{userName || 'this user'}</strong> ({userEmail})?
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mt-4">
          <p className="text-sm font-medium mb-2">This action cannot be undone.</p>
          <ul className="text-sm list-disc list-inside space-y-1">
            <li>User account will be deleted</li>
            <li>Profile information will be removed</li>
            <li>All organization memberships will be revoked</li>
            <li>User preferences will be cleared</li>
          </ul>
        </Alert>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={deleteUser.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
