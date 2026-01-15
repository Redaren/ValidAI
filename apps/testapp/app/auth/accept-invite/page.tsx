import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { AcceptInviteClient } from './accept-invite-client'

interface PageProps {
  searchParams: Promise<{
    invitation_id?: string
    error?: string
  }>
}

/**
 * Accept Invite Page (Server Component)
 *
 * This page handles the invitation acceptance flow for existing users.
 * When a user clicks the magic link in their invitation email, they are
 * redirected here after authentication.
 *
 * Flow:
 * 1. User clicks magic link in email
 * 2. Supabase Auth callback authenticates the user
 * 3. User is redirected here with ?invitation_id=xxx
 * 4. This page validates the invitation and shows acceptance UI
 * 5. User clicks "Accept" which calls the accept-invitation Edge Function
 * 6. User is redirected to dashboard
 */
export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const params = await searchParams
  const { invitation_id, error: urlError } = params

  // Handle error from redirect
  if (urlError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error</h1>
          <p className="text-muted-foreground mb-6">{urlError}</p>
          <Link href="/login" className="text-primary hover:underline">
            Return to login
          </Link>
        </div>
      </div>
    )
  }

  // Require invitation ID
  if (!invitation_id) {
    redirect('/login?error=Missing%20invitation%20ID')
  }

  // Create Supabase client for server-side data fetching
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Can't set cookies in Server Component
          }
        },
      },
    }
  )

  // Get current authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    // User not authenticated - redirect to login with return URL
    redirect(`/login?next=/auth/accept-invite?invitation_id=${invitation_id}`)
  }

  // Get invitation details using public RPC function
  const { data: invitation, error: invError } = await supabase
    .rpc('get_invitation_details', { p_invitation_id: invitation_id })

  if (invError || !invitation || invitation.length === 0) {
    console.error('Error fetching invitation:', invError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Invitation Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This invitation may have been canceled, expired, or already used.
          </p>
          <Link href="/" className="text-primary hover:underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const inviteData = invitation[0]

  // Check if invitation has already been used
  if (inviteData.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Invitation Already Used</h1>
          <p className="text-muted-foreground mb-6">
            This invitation has already been accepted or canceled.
          </p>
          <Link href="/" className="text-primary hover:underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Check if invitation has expired
  if (new Date(inviteData.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Invitation Expired</h1>
          <p className="text-muted-foreground mb-6">
            This invitation has expired. Please contact the organization administrator
            to request a new invitation.
          </p>
          <Link href="/" className="text-primary hover:underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Check if email matches
  if (inviteData.email.toLowerCase() !== user.email?.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Email Mismatch</h1>
          <p className="text-muted-foreground mb-6">
            This invitation was sent to a different email address ({inviteData.email}).
            Please log in with that email address to accept this invitation.
          </p>
          <Link href="/login" className="text-primary hover:underline">
            Log in with different account
          </Link>
        </div>
      </div>
    )
  }

  // All validations passed - render the acceptance UI
  return (
    <AcceptInviteClient
      invitationId={invitation_id}
      organizationName={inviteData.organization_name}
      organizationDescription={inviteData.organization_description}
      role={inviteData.role}
      defaultAppUrl={inviteData.default_app_url}
    />
  )
}
