'use client'

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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
} from '@playze/shared-ui'
import { Loader2, Mail } from 'lucide-react'
import { inviteMemberSchema, type InviteMemberInput } from '@/lib/validations'
import { useInviteMember } from '@/lib/queries/organizations'
import { useToastStore } from '@/stores'

interface InviteMemberDialogProps {
  organizationId: string
  organizationName: string
  isOpen: boolean
  onClose: () => void
}

/**
 * Dialog component for inviting a new member to an organization via email.
 *
 * Features:
 * - Email input with validation
 * - Role selection (owner, admin, member, viewer)
 * - Sends magic link invitation via Edge Function
 * - Works for both new and existing users
 */
export function InviteMemberDialog({
  organizationId,
  organizationName,
  isOpen,
  onClose,
}: InviteMemberDialogProps) {
  const inviteMember = useInviteMember()
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      organizationId,
      email: '',
      role: 'member',
    },
  })

  const selectedRole = watch('role')

  const onSubmit = async (data: InviteMemberInput) => {
    try {
      const result = await inviteMember.mutateAsync(data)

      // Show different toast based on whether user was assigned (existing) or invited (new)
      const isAssigned = result?.status === 'assigned'

      addToast({
        title: isAssigned ? 'User assigned' : 'Invitation sent',
        description: result?.message || (isAssigned
          ? 'The user has been added to the organization.'
          : 'The invitation has been sent successfully.'),
        variant: 'success',
      })

      handleClose()
    } catch (error) {
      console.error('Error inviting member:', error)
      // Error is displayed via the Alert component below
    }
  }

  const handleClose = () => {
    reset({
      organizationId,
      email: '',
      role: 'member',
    })
    inviteMember.reset()
    onClose()
  }

  const handleRoleChange = (role: 'owner' | 'admin' | 'member' | 'viewer') => {
    setValue('role', role)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join <strong>{organizationName}</strong>.
            They will receive an email with a magic link to accept the invitation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                className="pl-10"
                {...register('email')}
                disabled={isSubmitting}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              If the user already has an account, they will be added to the organization immediately.
              Otherwise, they will receive an email invitation to sign up.
            </p>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
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

          {/* Error Alert */}
          {inviteMember.error && (
            <Alert variant="destructive">
              <p className="text-sm">
                {inviteMember.error instanceof Error
                  ? inviteMember.error.message
                  : 'Failed to send invitation. Please try again.'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
