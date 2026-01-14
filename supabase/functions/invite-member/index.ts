import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse } from '../_shared/response.ts'
import { getUserFromRequest, isPlayzeAdmin } from '../_shared/auth.ts'
import { validateRequired, validateEmail, validateUuid } from '../_shared/validation.ts'

/**
 * Edge Function: organizations/invite-member
 *
 * Purpose: Add a user to an organization (Playze admin only)
 * - Existing users: Added directly to organization (no email, no invitation)
 * - New users: Creates pending invitation and sends signup email
 *
 * Method: POST
 * Auth: Requires Playze admin user
 *
 * Input:
 * {
 *   "organizationId": "uuid",
 *   "email": "user@example.com",
 *   "role": "member" // owner, admin, member, viewer (default: member)
 * }
 *
 * Output for EXISTING users (direct assignment):
 * {
 *   "success": true,
 *   "data": {
 *     "email": "user@example.com",
 *     "role": "member",
 *     "status": "assigned",
 *     "userExists": true,
 *     "emailSent": false,
 *     "message": "User has been assigned to the organization"
 *   }
 * }
 *
 * Output for NEW users (invitation):
 * {
 *   "success": true,
 *   "data": {
 *     "invitation": { ... },
 *     "emailSent": true,
 *     "userExists": false,
 *     "message": "Invitation email sent..."
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('invite-member', {
 *   body: {
 *     organizationId: 'org-uuid',
 *     email: 'user@example.com',
 *     role: 'member'
 *   }
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

    // Get authenticated user
    const user = await getUserFromRequest(req, supabase)
    if (!user) {
      return unauthorizedResponse('Invalid or missing authentication token')
    }

    // Verify user is Playze admin
    const isAdmin = await isPlayzeAdmin(user.email, supabase)
    if (!isAdmin) {
      return forbiddenResponse('Only Playze administrators can invite members')
    }

    // Parse and validate request body
    const { organizationId, email, role = 'member' } = await req.json()

    const validationError = validateRequired({ organizationId, email }, ['organizationId', 'email'])
    if (validationError) {
      return errorResponse(validationError)
    }

    if (!validateUuid(organizationId)) {
      return errorResponse('Invalid organization ID format')
    }

    if (!validateEmail(email)) {
      return errorResponse('Invalid email format')
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return errorResponse('Invalid role. Must be owner, admin, member, or viewer')
    }

    console.log(`Admin ${user.email} inviting ${email} to organization ${organizationId} as ${role}`)

    // Get organization details for email
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single()

    if (orgError || !organization) {
      console.error('Error fetching organization:', orgError)
      return errorResponse('Organization not found', 404)
    }

    // Create invitation record using RPC function
    // This handles duplicate detection, email normalization, and user existence check
    // NOTE: We pass p_admin_user_id because service-role calls have no JWT context
    const { data: inviteResult, error: inviteError } = await supabase
      .rpc('admin_invite_member', {
        p_organization_id: organizationId,
        p_email: email.toLowerCase().trim(),
        p_role: role,
        p_admin_user_id: user.id  // Pass admin's user ID for invited_by
      })

    if (inviteError) {
      console.error('Error creating invitation:', inviteError)
      return errorResponse(inviteError.message || 'Failed to create invitation')
    }

    if (!inviteResult || inviteResult.length === 0) {
      return errorResponse('Failed to create invitation')
    }

    const invitation = inviteResult[0]
    console.log(`Invitation result: invitation_id=${invitation.invitation_id}, status=${invitation.status}, user_exists=${invitation.user_exists}`)

    // For existing users, they are directly assigned to the organization (no invitation/email needed)
    if (invitation.status === 'assigned') {
      console.log(`Existing user ${email} directly assigned to organization ${organizationId} as ${role}`)
      return successResponse({
        email: invitation.email,
        role: invitation.role,
        status: 'assigned',
        userExists: true,
        emailSent: false,
        message: 'User has been assigned to the organization'
      })
    }

    // For new users, continue with invitation email flow

    // Get organization's default app URL and name for redirect and email
    // If organization has a default_app_id set, use that app's URL and name
    // Otherwise fall back to SITE_URL (admin portal) and 'Playze' as app name
    let redirectAppUrl = Deno.env.get('SITE_URL') || 'http://localhost:3001'
    let appName = 'Playze'

    if (organization) {
      // Query the organization's default app and its URL
      const { data: orgWithApp } = await supabase
        .from('organizations')
        .select('default_app_id')
        .eq('id', organizationId)
        .single()

      if (orgWithApp?.default_app_id) {
        // Get the app URL and name for the default app
        const { data: app } = await supabase
          .from('apps')
          .select('app_url, name')
          .eq('id', orgWithApp.default_app_id)
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
    }

    const redirectUrl = `${redirectAppUrl}/auth/accept-invite?invitation_id=${invitation.invitation_id}`

    console.log(`Sending invitation email to new user ${email}, redirect: ${redirectUrl}`)

    // Send signup invitation email via Supabase Auth
    // This is only reached for NEW users (status='pending')
    // Existing users are handled above with direct assignment (status='assigned')
    let emailError: Error | null = null

    const { error } = await supabase.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
      {
        data: {
          organization_id: organizationId,
          organization_name: organization.name,
          app_name: appName,  // For email template: "You've been invited to {app_name}"
          invitation_id: invitation.invitation_id,
          role: role,
          redirect_app_url: redirectAppUrl  // Used for redirecting new users to correct app
        },
        redirectTo: redirectUrl
      }
    )
    emailError = error

    if (emailError) {
      console.error('Error sending invitation email:', emailError)
      // Invitation created but email failed - return partial success
      return successResponse({
        invitation: invitation,
        emailSent: false,
        message: 'Invitation created but email failed to send. You can resend the invitation later.'
      })
    }

    console.log(`Invitation email sent successfully to ${email}`)

    return successResponse({
      invitation: invitation,
      emailSent: true,
      userExists: false,
      status: 'pending',
      message: 'Invitation email sent. The user will be added to the organization after they sign up.'
    })

  } catch (error) {
    console.error('Unexpected error in invite-member:', error)
    return errorResponse('Internal server error', 500)
  }
})
