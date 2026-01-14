'use client'

import * as React from 'react'
import { useState } from 'react'
import { useCanInvite } from '@playze/shared-auth'
import type { InviteResult } from '@playze/shared-auth'
import { Button, type ButtonProps } from '../ui/button'
import { InviteMembersDialog } from './invite-members-dialog'
import { UserPlus, Loader2 } from 'lucide-react'

export interface InviteMembersButtonProps {
  /** App ID for tier feature check */
  appId: string
  /** Button variant - default: 'default' */
  variant?: ButtonProps['variant']
  /** Button size - default: 'default' */
  size?: ButtonProps['size']
  /** Additional CSS class */
  className?: string
  /** Custom button text (default: 'Invite Members') */
  children?: React.ReactNode
  /** Optional callback after successful invitations */
  onSuccess?: (results: InviteResult[]) => void
}

/**
 * InviteMembersButton - Convenience wrapper for invite functionality
 *
 * Renders a button that opens the InviteMembersDialog.
 * Automatically hides if user doesn't have permission to invite.
 *
 * Features:
 * - Auto-hides when user can't invite (permission or tier)
 * - Loading state while checking permissions
 * - Customizable button appearance
 *
 * @example
 * ```tsx
 * <InviteMembersButton appId="infracloud">
 *   Invite Team Members
 * </InviteMembersButton>
 *
 * // Or with custom styling
 * <InviteMembersButton
 *   appId="infracloud"
 *   variant="outline"
 *   size="sm"
 *   onSuccess={(results) => toast.success(`Invited ${results.length} members`)}
 * />
 * ```
 */
export function InviteMembersButton({
  appId,
  variant = 'default',
  size = 'default',
  className,
  children,
  onSuccess,
}: InviteMembersButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { canInvite, isLoading } = useCanInvite(appId)

  // Loading state
  if (isLoading) {
    return (
      <Button variant={variant} size={size} className={className} disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    )
  }

  // Hide if user can't invite
  if (!canInvite) {
    return null
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setIsDialogOpen(true)}
      >
        <UserPlus className="mr-2 h-4 w-4" />
        {children || 'Invite Members'}
      </Button>

      <InviteMembersDialog
        appId={appId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  )
}
