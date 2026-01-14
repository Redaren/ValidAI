'use client'

import * as React from 'react'
import { useState, useMemo } from 'react'
import {
  useInviteMembers,
  useCanInvite,
  useCurrentOrganization,
  parseEmails,
  getAssignableRoles,
  getRoleDisplayName,
  type OrganizationRole,
  type InviteResult,
} from '@playze/shared-auth'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'
import { Loader2, AlertCircle, CheckCircle, XCircle, Mail } from 'lucide-react'

export interface InviteMembersDialogProps {
  /** App ID for tier feature check */
  appId: string
  /** Whether the dialog is open */
  isOpen: boolean
  /** Callback when dialog is closed */
  onClose: () => void
  /** Optional callback after successful invitations */
  onSuccess?: (results: InviteResult[]) => void
}

/**
 * InviteMembersDialog - Complete dialog for inviting members to an organization
 *
 * Features:
 * - Textarea for bulk email paste (comma, newline, space separated)
 * - Live parsing with valid/invalid count display
 * - Role selector (filtered by user's role level)
 * - Loading state during submission
 * - Results display with success/failure per email
 *
 * Permissions:
 * - Checks can_invite role permission
 * - Checks can_invite_members tier feature
 * - Enforces role hierarchy (can't assign higher than own role)
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 *
 * <InviteMembersDialog
 *   appId="infracloud"
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSuccess={(results) => toast.success(`Invited ${results.length} members`)}
 * />
 * ```
 */
export function InviteMembersDialog({
  appId,
  isOpen,
  onClose,
  onSuccess,
}: InviteMembersDialogProps) {
  const [emailInput, setEmailInput] = useState('')
  const [selectedRole, setSelectedRole] = useState<OrganizationRole>('member')
  const [results, setResults] = useState<InviteResult[] | null>(null)

  const { data: org } = useCurrentOrganization()
  const { canInvite, isLoading: canInviteLoading, userRole, reason } = useCanInvite(appId)
  const inviteMembers = useInviteMembers()

  // Parse emails as user types
  const parsedEmails = useMemo(() => parseEmails(emailInput), [emailInput])

  // Get roles user can assign
  const assignableRoles = useMemo(
    () => (userRole ? getAssignableRoles(userRole) : []),
    [userRole]
  )

  // Reset state when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setEmailInput('')
      setSelectedRole('member')
      setResults(null)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!org?.id || parsedEmails.valid.length === 0) return

    setResults(null)

    try {
      const result = await inviteMembers.mutateAsync({
        organizationId: org.id,
        emails: parsedEmails.valid,
        role: selectedRole,
        appId,
      })

      setResults(result.results)
      onSuccess?.(result.results)
    } catch {
      // Error is handled by mutation state
    }
  }

  const handleClose = () => {
    setEmailInput('')
    setSelectedRole('member')
    setResults(null)
    onClose()
  }

  // Permission denied state
  if (!canInviteLoading && !canInvite) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              Invite Members
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {reason === 'tier_limit' ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Self-service invitations are not available on your current plan. Please
                  contact your administrator or upgrade to Pro to invite members.
                </AlertDescription>
              </Alert>
            ) : reason === 'no_permission' ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your role does not have permission to invite members. Please contact an
                  administrator.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to be a member of an organization to invite others.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Results display
  if (results) {
    const successful = results.filter((r) => r.status !== 'failed')
    const failed = results.filter((r) => r.status === 'failed')

    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Invitation Results
            </DialogTitle>
            <DialogDescription>
              {successful.length} of {results.length} invitations sent successfully
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50"
              >
                <span className="text-sm truncate flex-1">{result.email}</span>
                {result.status === 'failed' ? (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-xs text-destructive truncate max-w-[150px]">
                      {result.error}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <Badge variant="outline" className="text-xs">
                      {result.status === 'assigned' ? 'Added' : 'Invited'}
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Main form
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite Members
          </DialogTitle>
          <DialogDescription>
            Invite people to join {org?.name || 'your organization'}. They&apos;ll receive an
            email invitation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email input */}
          <div className="space-y-2">
            <Label htmlFor="emails">Email Addresses</Label>
            <Textarea
              id="emails"
              placeholder="Enter email addresses (comma, space, or newline separated)&#10;&#10;Example:&#10;john@example.com&#10;jane@example.com, bob@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
            />

            {/* Parsing feedback */}
            <div className="flex items-center gap-4 text-sm">
              {parsedEmails.valid.length > 0 && (
                <span className="text-green-600">
                  {parsedEmails.valid.length} valid email{parsedEmails.valid.length !== 1 ? 's' : ''}
                </span>
              )}
              {parsedEmails.invalid.length > 0 && (
                <span className="text-destructive">
                  {parsedEmails.invalid.length} invalid
                </span>
              )}
            </div>

            {/* Invalid emails detail */}
            {parsedEmails.invalid.length > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Invalid: {parsedEmails.invalid.join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Role selector */}
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as OrganizationRole)}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getRoleDisplayName(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              You can assign roles up to your own level ({userRole}).
            </p>
          </div>
        </div>

        {/* Error display */}
        {inviteMembers.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {inviteMembers.error instanceof Error
                ? inviteMembers.error.message
                : 'Failed to send invitations'}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={inviteMembers.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={parsedEmails.valid.length === 0 || inviteMembers.isPending}
          >
            {inviteMembers.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>Send {parsedEmails.valid.length > 0 ? `${parsedEmails.valid.length} ` : ''}Invitation{parsedEmails.valid.length !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
