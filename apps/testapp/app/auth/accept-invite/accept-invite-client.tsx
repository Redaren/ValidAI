'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, Button, Badge } from '@playze/shared-ui'
import { Building2, CheckCircle, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@playze/shared-auth/client'

interface AcceptInviteClientProps {
  invitationId: string
  organizationName: string
  organizationDescription: string | null
  role: string
  defaultAppUrl?: string | null
}

/**
 * Accept Invite Client Component
 *
 * Displays the invitation details and handles the acceptance flow.
 * When user clicks "Accept", it calls the accept-invitation Edge Function
 * which adds them to the organization and updates their JWT.
 */
export function AcceptInviteClient({
  invitationId,
  organizationName,
  organizationDescription,
  role,
  defaultAppUrl,
}: AcceptInviteClientProps) {
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionWarning, setSessionWarning] = useState(false)
  const router = useRouter()

  const handleAccept = async () => {
    setIsAccepting(true)
    setError(null)

    try {
      const supabase = createBrowserClient()

      // Call Edge Function to process the invitation
      const { data, error: fnError } = await supabase.functions.invoke('accept-invitation', {
        body: { invitationId }
      })

      if (fnError) {
        throw new Error('Failed to accept invitation. Please try again.')
      }

      // Check for error in response
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to accept invitation')
      }

      // Refresh session to get updated JWT with new organization
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) {
        console.error('Error refreshing session:', refreshError)
        // Show warning but continue - user is already in the org
        setSessionWarning(true)
      }

      // Redirect to organization's default app, or current app if not set
      // Check if defaultAppUrl is set and different from current origin
      if (defaultAppUrl && !defaultAppUrl.includes(window.location.origin)) {
        // Redirect to the organization's default app
        window.location.href = `${defaultAppUrl}/?welcome=true`
      } else {
        // Stay in current app
        router.push('/dashboard?welcome=true')
      }
    } catch (err) {
      console.error('Error accepting invitation:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsAccepting(false)
    }
  }

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Full control over the organization'
      case 'admin':
        return 'Manage members and settings'
      case 'member':
        return 'Standard access to organization resources'
      case 'viewer':
        return 'Read-only access'
      default:
        return 'Organization member'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full p-8 text-center">
        {/* Organization Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Building2 className="h-8 w-8 text-primary" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2">You&apos;re Invited!</h1>
        <p className="text-muted-foreground mb-6">
          You have been invited to join
        </p>

        {/* Organization Details */}
        <div className="bg-muted rounded-lg p-4 mb-6 text-left">
          <h2 className="text-xl font-semibold text-center">{organizationName}</h2>
          {organizationDescription && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {organizationDescription}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <Badge
              variant={
                role === 'owner' ? 'default' :
                role === 'admin' ? 'secondary' : 'outline'
              }
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {getRoleDescription(role)}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Session Warning */}
        {sessionWarning && (
          <div className="bg-amber-500/10 text-amber-700 rounded-lg p-3 mb-4 text-sm">
            You&apos;ve joined the organization. If you can&apos;t access data, please log out and back in.
          </div>
        )}

        {/* Accept Button */}
        <Button
          onClick={handleAccept}
          disabled={isAccepting}
          className="w-full"
          size="lg"
        >
          {isAccepting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Accept Invitation
            </>
          )}
        </Button>

        {/* Terms Notice */}
        <p className="text-xs text-muted-foreground mt-4">
          By accepting, you agree to join this organization and its terms of use.
        </p>

        {/* Decline Option */}
        <div className="mt-6 pt-4 border-t">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Not now? Return to dashboard
          </Link>
        </div>
      </Card>
    </div>
  )
}
