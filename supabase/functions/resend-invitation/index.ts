import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, notFoundResponse } from '../_shared/response.ts'
import { getAuthenticatedUser, isPlayzeAdmin } from '../_shared/auth.ts'
import { validateRequired, validateUuid } from '../_shared/validation.ts'

/**
 * Edge Function: organizations/resend-invitation
 *
 * Purpose: Resend an invitation email for a pending invitation (Playze admin only)
 * Resets the expiration date and sends a new magic link
 *
 * Method: POST
 * Auth: Requires Playze admin user
 *
 * Input:
 * {
 *   "invitationId": "uuid"
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": {
 *     "invitation": {
 *       "id": "uuid",
 *       "email": "user@example.com",
 *       "expires_at": "2025-01-26T..."
 *     },
 *     "emailSent": true,
 *     "message": "Invitation resent successfully"
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('resend-invitation', {
 *   body: { invitationId: 'invitation-uuid' }
 * })
 */

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req)
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const supabase = createAdminClient()

    // Get authenticated user (uses getClaims() for asymmetric JWT support)
    const authResult = await getAuthenticatedUser(req, supabase)
    if (!authResult) {
      return unauthorizedResponse('Invalid or missing authentication token')
    }
    const { user } = authResult

    // Verify user is Playze admin
    const isAdmin = await isPlayzeAdmin(user.email, supabase)
    if (!isAdmin) {
      return forbiddenResponse('Only Playze administrators can resend invitations')
    }

    // Parse and validate request body
    const { invitationId } = await req.json()

    const validationError = validateRequired({ invitationId }, ['invitationId'])
    if (validationError) {
      return errorResponse(validationError)
    }

    if (!validateUuid(invitationId)) {
      return errorResponse('Invalid invitation ID format')
    }

    console.log(`Admin ${user.email} resending invitation ${invitationId}`)

    // Get invitation details with organization's default app
    const { data: invitation, error: fetchError } = await supabase
      .from('organization_invitations')
      .select(`
        id,
        email,
        role,
        status,
        organization_id,
        organizations (
          id,
          name,
          default_app_id
        )
      `)
      .eq('id', invitationId)
      .single()

    if (fetchError || !invitation) {
      console.error('Error fetching invitation:', fetchError)
      return notFoundResponse('Invitation not found')
    }

    if (invitation.status !== 'pending') {
      return errorResponse(`Cannot resend invitation with status: ${invitation.status}. Only pending invitations can be resent.`)
    }

    // Reset expiration date using RPC function
    const { data: resetResult, error: resetError } = await supabase
      .rpc('admin_reset_invitation_expiry', {
        p_invitation_id: invitationId
      })

    if (resetError) {
      console.error('Error resetting invitation expiry:', resetError)
      return errorResponse(resetError.message || 'Failed to reset invitation expiry')
    }

    if (!resetResult || resetResult.length === 0) {
      return errorResponse('Failed to reset invitation expiry')
    }

    const updatedInvitation = resetResult[0]
    console.log(`Invitation expiry reset: ${updatedInvitation.expires_at}`)

    // Get organization's default app URL and name for redirect and email (same logic as invite-member)
    let redirectAppUrl = Deno.env.get('SITE_URL') || 'http://localhost:3001'
    let appName = 'Playze'
    const org = invitation.organizations as { id: string; name: string; default_app_id: string | null } | null

    if (org?.default_app_id) {
      // Get the app URL and name for the default app
      const { data: app } = await supabase
        .from('apps')
        .select('app_url, name')
        .eq('id', org.default_app_id)
        .eq('is_active', true)
        .single()

      if (app?.app_url) {
        redirectAppUrl = app.app_url
        console.log(`Using organization's default app URL: ${redirectAppUrl}`)
      }
      if (app?.name) {
        appName = app.name
        console.log(`Using organization's default app name: ${appName}`)
      }
    }

    // Construct redirect URL with invitation ID
    const redirectUrl = `${redirectAppUrl}/auth/accept-invite?invitation_id=${invitationId}`

    // Check if user already exists in auth.users
    // Use RPC function since PostgREST can't query auth schema directly
    const { data: existingUserId, error: userLookupError } = await supabase
      .rpc('check_user_exists_by_email', { p_email: invitation.email })

    if (userLookupError) {
      console.error('Error looking up user:', userLookupError)
    }

    if (existingUserId) {
      // User already exists - use signInWithOtp to send magic link
      console.log(`User ${invitation.email} already exists (id: ${existingUserId}), using signInWithOtp`)

      // Create anon client for signInWithOtp (it's a client method, not admin)
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!
      )

      const { error: otpError } = await anonClient.auth.signInWithOtp({
        email: invitation.email,
        options: {
          shouldCreateUser: false, // User already exists
          emailRedirectTo: redirectUrl,
          data: {
            invitation_id: invitationId,
            organization_id: invitation.organization_id,
            organization_name: org?.name || 'Organization',
            app_name: appName,
            role: invitation.role,
            redirect_app_url: redirectAppUrl
          }
        }
      })

      if (otpError) {
        console.error('signInWithOtp failed:', otpError)
        // Return error with invitation URL for manual sharing
        return errorResponse(
          'Could not send email automatically. Please share the invitation link manually.',
          400,
          { invitationUrl: redirectUrl }
        )
      }

      console.log(`Magic link sent to existing user ${invitation.email}`)
      return successResponse({
        invitation: updatedInvitation,
        emailSent: true,
        message: 'Login link sent. User will complete invitation after signing in.'
      })
    }

    // User doesn't exist - use inviteUserByEmail to create user and send invite
    console.log(`User ${invitation.email} does not exist, using inviteUserByEmail`)
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(
      invitation.email,
      {
        data: {
          organization_id: invitation.organization_id,
          organization_name: org?.name || 'Organization',
          app_name: appName,
          invitation_id: invitationId,
          role: invitation.role,
          redirect_app_url: redirectAppUrl
        },
        redirectTo: redirectUrl
      }
    )

    if (emailError) {
      console.error('inviteUserByEmail failed:', emailError)
      // Return error with invitation URL for manual sharing
      return errorResponse(
        'Could not send invitation email. Please share the invitation link manually.',
        400,
        { invitationUrl: redirectUrl }
      )
    }

    console.log(`Invitation email resent successfully to ${invitation.email}`)

    return successResponse({
      invitation: updatedInvitation,
      emailSent: true,
      message: 'Invitation resent successfully. A new magic link has been sent to the user.'
    })

  } catch (error) {
    console.error('Unexpected error in resend-invitation:', error)
    return errorResponse('Internal server error', 500)
  }
})
