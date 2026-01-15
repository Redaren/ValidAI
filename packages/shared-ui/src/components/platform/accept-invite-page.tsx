'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Building2, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { createBrowserClient } from '@playze/shared-auth/client'

export interface AcceptInvitePageProps {
  /** The invitation ID from URL search params */
  invitationId?: string
  /** Error message from URL search params */
  error?: string
  /** Path to login page (default: '/login') */
  loginPath?: string
  /** Path to dashboard (default: '/dashboard') */
  dashboardPath?: string
  /** Additional CSS classes */
  className?: string
}

interface InvitationData {
  id: string
  organization_id: string
  organization_name: string
  organization_description: string | null
  email: string
  role: string
  status: string
  expires_at: string
  default_app_url: string | null
}

type PageState =
  | { type: 'initializing' }
  | { type: 'error'; title: string; message: string; showLogin?: boolean }
  | { type: 'ready'; invitation: InvitationData }
  | { type: 'accepting' }
  | { type: 'success' }

/**
 * Accept Invite Page Component
 *
 * Handles the complete invitation acceptance flow client-side.
 * This is necessary because magic links from signInWithOtp() include tokens
 * in the URL hash fragment, which is only accessible client-side.
 *
 * Flow:
 * 1. Initialize session (process URL hash tokens if present)
 * 2. Fetch and validate invitation details
 * 3. Show invitation UI
 * 4. Process acceptance on user action
 */
export function AcceptInvitePage({
  invitationId,
  error: errorFromUrl,
  loginPath = '/login',
  dashboardPath = '/dashboard',
  className,
}: AcceptInvitePageProps) {
  const [pageState, setPageState] = useState<PageState>({ type: 'initializing' })
  const [sessionWarning, setSessionWarning] = useState(false)
  const router = useRouter()

  // Create Supabase client once on mount - this triggers hash token detection
  const [supabase] = useState(() => createBrowserClient())

  // Initialize session and fetch invitation on mount
  useEffect(() => {
    const initialize = async () => {
      // Handle URL error parameter
      if (errorFromUrl) {
        setPageState({
          type: 'error',
          title: 'Error',
          message: errorFromUrl,
          showLogin: true,
        })
        return
      }

      // Check for invitation ID
      if (!invitationId) {
        setPageState({
          type: 'error',
          title: 'Missing Invitation',
          message: 'No invitation ID was provided.',
          showLogin: true,
        })
        return
      }

      try {
        // Step 1: Initialize session from URL hash tokens (if present)
        // getSession() will detect and store tokens from the URL hash
        console.log('Initializing session...')
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setPageState({
            type: 'error',
            title: 'Authentication Error',
            message: 'Failed to authenticate. Please try logging in again.',
            showLogin: true,
          })
          return
        }

        if (!session) {
          console.log('No session found, redirecting to login')
          router.push(`${loginPath}?next=${encodeURIComponent(`/auth/accept-invite?invitation_id=${invitationId}`)}`)
          return
        }

        console.log('Session established for user:', session.user.email)

        // Step 2: Fetch invitation details
        // Note: Using type assertion because get_invitation_details may not be in generated types
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const { data: invitation, error: invError } = await (supabase.rpc as any)(
          'get_invitation_details',
          { p_invitation_id: invitationId }
        ) as { data: InvitationData[] | null; error: any }
        /* eslint-enable @typescript-eslint/no-explicit-any */

        if (invError || !invitation || invitation.length === 0) {
          console.error('Error fetching invitation:', invError)
          setPageState({
            type: 'error',
            title: 'Invitation Not Found',
            message: 'This invitation may have been canceled, expired, or already used.',
          })
          return
        }

        const inviteData = invitation[0]

        // Step 3: Validate invitation status
        if (inviteData.status !== 'pending') {
          setPageState({
            type: 'error',
            title: 'Invitation Already Used',
            message: 'This invitation has already been accepted or canceled.',
          })
          return
        }

        // Step 4: Check expiration
        if (new Date(inviteData.expires_at) < new Date()) {
          setPageState({
            type: 'error',
            title: 'Invitation Expired',
            message: 'This invitation has expired. Please contact the organization administrator to request a new invitation.',
          })
          return
        }

        // Step 5: Verify email matches
        if (inviteData.email.toLowerCase() !== session.user.email?.toLowerCase()) {
          setPageState({
            type: 'error',
            title: 'Email Mismatch',
            message: `This invitation was sent to ${inviteData.email}. Please log in with that email address to accept this invitation.`,
            showLogin: true,
          })
          return
        }

        // All validations passed
        setPageState({ type: 'ready', invitation: inviteData })

      } catch (err) {
        console.error('Initialization error:', err)
        setPageState({
          type: 'error',
          title: 'Error',
          message: 'Something went wrong. Please try again.',
        })
      }
    }

    initialize()
  }, [supabase, router, invitationId, errorFromUrl, loginPath])

  const handleAccept = async () => {
    if (pageState.type !== 'ready') return

    // Capture invitation data before changing state
    const invitation = pageState.invitation

    setPageState({ type: 'accepting' })

    try {
      // Refresh session to ensure we have a valid, fresh access token
      // This is necessary because after login redirect, the client's internal state
      // may not be synchronized with the cookies
      const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError || !session) {
        console.error('Session refresh failed:', refreshError)
        setPageState({
          type: 'error',
          title: 'Session Expired',
          message: 'Your session has expired. Please log in again.',
          showLogin: true,
        })
        return
      }

      console.log('Session refreshed, access token valid until:', new Date(session.expires_at! * 1000))

      // Call Edge Function to process the invitation
      const { data, error: fnError } = await supabase.functions.invoke('accept-invitation', {
        body: { invitationId }
      })

      if (fnError) {
        console.error('Edge function error:', fnError)
        throw new Error('Failed to accept invitation. Please try again.')
      }

      // Check for error in response
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to accept invitation')
      }

      // Refresh session to get updated JWT with new organization
      const { error: postAcceptRefreshError } = await supabase.auth.refreshSession()
      if (postAcceptRefreshError) {
        console.error('Error refreshing session:', postAcceptRefreshError)
        setSessionWarning(true)
      }

      setPageState({ type: 'success' })

      // Redirect after brief delay to show success
      setTimeout(() => {
        if (invitation.default_app_url && !invitation.default_app_url.includes(window.location.origin)) {
          window.location.href = `${invitation.default_app_url}/?welcome=true`
        } else {
          router.push(`${dashboardPath}?welcome=true`)
        }
      }, 1500)

    } catch (err) {
      console.error('Error accepting invitation:', err)
      setPageState({
        type: 'error',
        title: 'Error',
        message: err instanceof Error ? err.message : 'Something went wrong',
      })
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

  // Loading state
  if (pageState.type === 'initializing') {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-muted/30 p-4 ${className || ''}`}>
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Loading Invitation...</h1>
          <p className="text-muted-foreground">Please wait while we verify your session.</p>
        </Card>
      </div>
    )
  }

  // Error state
  if (pageState.type === 'error') {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-muted/30 p-4 ${className || ''}`}>
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-destructive mb-4">{pageState.title}</h1>
          <p className="text-muted-foreground mb-6">{pageState.message}</p>
          {pageState.showLogin ? (
            <Link href={loginPath} className="text-primary hover:underline">
              Go to login
            </Link>
          ) : (
            <Link href={dashboardPath} className="text-primary hover:underline">
              Go to dashboard
            </Link>
          )}
        </Card>
      </div>
    )
  }

  // Accepting state
  if (pageState.type === 'accepting') {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-muted/30 p-4 ${className || ''}`}>
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Joining Organization...</h1>
          <p className="text-muted-foreground">Please wait while we process your invitation.</p>
        </Card>
      </div>
    )
  }

  // Success state
  if (pageState.type === 'success') {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-muted/30 p-4 ${className || ''}`}>
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Welcome!</h1>
          <p className="text-muted-foreground">You have successfully joined the organization.</p>
          {sessionWarning && (
            <p className="text-amber-600 text-sm mt-4">
              If you experience any issues, try logging out and back in.
            </p>
          )}
          <p className="text-muted-foreground text-sm mt-4">Redirecting to dashboard...</p>
        </Card>
      </div>
    )
  }

  // Ready state - show invitation details
  const { invitation } = pageState

  return (
    <div className={`min-h-screen flex items-center justify-center bg-muted/30 p-4 ${className || ''}`}>
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
          <h2 className="text-xl font-semibold text-center">{invitation.organization_name}</h2>
          {invitation.organization_description && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {invitation.organization_description}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <Badge
              variant={
                invitation.role === 'owner' ? 'default' :
                invitation.role === 'admin' ? 'secondary' : 'outline'
              }
            >
              {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {getRoleDescription(invitation.role)}
          </p>
        </div>

        {/* Accept Button */}
        <Button
          onClick={handleAccept}
          className="w-full"
          size="lg"
        >
          <CheckCircle className="mr-2 h-4 w-4" />
          Accept Invitation
        </Button>

        {/* Terms Notice */}
        <p className="text-xs text-muted-foreground mt-4">
          By accepting, you agree to join this organization and its terms of use.
        </p>

        {/* Decline Option */}
        <div className="mt-6 pt-4 border-t">
          <Link
            href={dashboardPath}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Not now? Return to dashboard
          </Link>
        </div>
      </Card>
    </div>
  )
}
