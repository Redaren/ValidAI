'use client'

import * as React from 'react'
import {
  useOrgInvitations,
  useCancelInvitation,
  useAuthorization,
  type OrgInvitation,
} from '@playze/shared-auth'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { X, Clock, Mail, AlertCircle } from 'lucide-react'

export interface OrgInvitationsTableProps {
  /** Organization ID to fetch invitations for */
  organizationId: string | undefined
  /** App ID for permission check */
  appId: string
  /** Whether to show action buttons (cancel) - default: true */
  showActions?: boolean
  /** Custom empty state message */
  emptyMessage?: string
  /** Additional CSS class */
  className?: string
  /**
   * Callback when invitation cancel completes
   * @param alreadyProcessed - True if the invitation was already accepted/canceled/expired
   */
  onCancelComplete?: (alreadyProcessed: boolean) => void
}

/**
 * OrgInvitationsTable - Display pending invitations for an organization
 *
 * Features:
 * - Displays email, role, status, invited date, expires date
 * - Cancel button (for users with can_manage_members permission)
 * - Loading skeleton state
 * - Empty state message
 *
 * @example
 * ```tsx
 * const { data: org } = useCurrentOrganization()
 *
 * <OrgInvitationsTable
 *   organizationId={org?.id}
 *   appId="infracloud"
 *   showActions={true}
 * />
 * ```
 */
export function OrgInvitationsTable({
  organizationId,
  appId,
  showActions = true,
  emptyMessage = 'No pending invitations',
  className,
  onCancelComplete,
}: OrgInvitationsTableProps) {
  const { data: invitations, isLoading, error } = useOrgInvitations(organizationId)
  const { data: auth } = useAuthorization(appId)
  const cancelInvitation = useCancelInvitation()

  const canManageMembers = auth?.role_permissions?.can_manage_members === true

  const handleCancel = async (invitation: OrgInvitation) => {
    if (!organizationId) return

    const result = await cancelInvitation.mutateAsync({
      invitationId: invitation.id,
      organizationId,
      appId,
    })

    // Notify parent about the result
    onCancelComplete?.(result.alreadyProcessed ?? false)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-2 ${className || ''}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[100px]" />
          </div>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 text-destructive p-4 ${className || ''}`}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load invitations</span>
      </div>
    )
  }

  // Empty state
  if (!invitations || invitations.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-muted-foreground ${className || ''}`}>
        <Mail className="h-8 w-8 mb-2" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invited</TableHead>
            <TableHead>Expires</TableHead>
            {showActions && canManageMembers && <TableHead className="w-[80px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {invitation.role}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(invitation.invited_at)}
                {invitation.invited_by_name && (
                  <span className="block text-xs">by {invitation.invited_by_name}</span>
                )}
              </TableCell>
              <TableCell>
                {isExpired(invitation.expires_at) ? (
                  <Badge variant="destructive" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Expired
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {formatDate(invitation.expires_at)}
                  </span>
                )}
              </TableCell>
              {showActions && canManageMembers && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancel(invitation)}
                    disabled={cancelInvitation.isPending}
                    className="h-8 w-8 p-0"
                    title="Cancel invitation"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
