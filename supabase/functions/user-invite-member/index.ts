import { createAdminClient, createUserClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse } from '../_shared/response.ts'
import { validateRequired, validateEmail, validateUuid } from '../_shared/validation.ts'
import { sendEmail, existingUserInviteEmail } from '../_shared/email.ts'
import { verifyAndGetClaims } from '../_shared/auth.ts'

/**
 * Edge Function: user-invite-member
 *
 * Purpose: Self-service invitation by org members (not admins)
 * - Validates user is org member with invite permission via RPC
 * - Checks tier has can_invite_members feature via RPC
 * - Enforces role hierarchy (can't assign higher than own role) via RPC
 * - Sends invitation emails via Supabase Auth
 *
 * Method: POST
 * Auth: Requires authenticated org member with invite permission
 *
 * Input:
 * {
 *   "organizationId": "uuid",
 *   "emails": ["user@example.com", ...],  // Bulk support
 *   "role": "member",  // owner, admin, member, viewer (default: member)
 *   "appId": "infracloud"  // Required for tier feature check
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "email": "user@example.com",
 *       "status": "pending",  // or "assigned" for existing users, "failed" on error
 *       "invitationId": "uuid",
 *       "userExists": false,
 *       "emailSent": true
 *     },
 *     ...
 *   ]
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('user-invite-member', {
 *   body: {
 *     organizationId: 'org-uuid',
 *     emails: ['user1@example.com', 'user2@example.com'],
 *     role: 'member',
 *     appId: 'infracloud'
 *   }
 * })
 */

interface InviteResult {
  email: string
  status: 'pending' | 'assigned' | 'failed'
  invitationId?: string
  userExists?: boolean
  emailSent?: boolean
  error?: string
}

Deno.serve(async (req) => {
  // Get origin for CORS
  const origin = req.headers.get('origin')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req)
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, origin)
  }

  try {
    // Get JWT token from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return unauthorizedResponse('Missing Authorization header', origin)
    }
    const jwt = authHeader.replace('Bearer ', '')

    // Verify JWT using getClaims() (supports asymmetric JWT signing)
    const claims = await verifyAndGetClaims(req)
    if (!claims) {
      return unauthorizedResponse('Invalid or missing authentication token', origin)
    }

    // Create admin client for service-role operations (email sending, fetching org details)
    const adminClient = createAdminClient()

    // Create user client for RPC calls that need auth.uid() context
    const userClient = createUserClient(jwt)

    // Get full user object (now that JWT is verified via getClaims())
    const { data: { user }, error: userError } = await adminClient.auth.getUser(jwt)
    if (userError || !user) {
      console.error('Error getting user from token:', userError)
      return unauthorizedResponse('Invalid or missing authentication token', origin)
    }

    // Parse and validate request body
    const { organizationId, emails, role = 'member', appId } = await req.json()

    // Validate required fields
    const validationError = validateRequired({ organizationId, emails, appId }, ['organizationId', 'emails', 'appId'])
    if (validationError) {
      return errorResponse(validationError, 400, origin)
    }

    if (!validateUuid(organizationId)) {
      return errorResponse('Invalid organization ID format', 400, origin)
    }

    if (!Array.isArray(emails) || emails.length === 0) {
      return errorResponse('emails must be a non-empty array', 400, origin)
    }

    if (emails.length > 50) {
      return errorResponse('Maximum 50 emails per request', 400, origin)
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return errorResponse('Invalid role. Must be owner, admin, member, or viewer', 400, origin)
    }

    console.log(`User ${user.email} inviting ${emails.length} user(s) to organization ${organizationId} as ${role}`)

    // Get organization details for email (use admin client for read access)
    const { data: organization, error: orgError } = await adminClient
      .from('organizations')
      .select('id, name, default_app_id')
      .eq('id', organizationId)
      .single()

    if (orgError || !organization) {
      console.error('Error fetching organization:', orgError)
      return errorResponse('Organization not found', 404, origin)
    }

    // Get redirect URL for invitation emails
    let redirectAppUrl = Deno.env.get('SITE_URL') || 'http://localhost:3001'
    let appName = 'Playze'

    // Query the app details (use admin client for read access)
    const { data: app } = await adminClient
      .from('apps')
      .select('app_url, name')
      .eq('id', appId)
      .eq('is_active', true)
      .single()

    if (app?.app_url) {
      redirectAppUrl = app.app_url
      console.log(`Using app URL: ${redirectAppUrl}`)
    }
    if (app?.name) {
      appName = app.name
      console.log(`Using app name: ${appName}`)
    }

    // Process each email
    const results: InviteResult[] = []

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim()

      // Validate email format
      if (!validateEmail(normalizedEmail)) {
        results.push({
          email: normalizedEmail,
          status: 'failed',
          error: 'Invalid email format'
        })
        continue
      }

      try {
        // Create invitation using RPC function with USER client
        // The RPC function uses auth.uid() so it needs user context, not admin context
        // The RPC function validates:
        // - User is org member
        // - User has can_invite permission
        // - Tier has can_invite_members feature
        // - Role hierarchy (can't assign higher than own role)
        const { data: inviteResult, error: inviteError } = await userClient
          .rpc('user_invite_member', {
            p_organization_id: organizationId,
            p_email: normalizedEmail,
            p_role: role,
            p_app_id: appId
          })

        if (inviteError) {
          console.error(`Error creating invitation for ${normalizedEmail}:`, inviteError)
          results.push({
            email: normalizedEmail,
            status: 'failed',
            error: inviteError.message || 'Failed to create invitation'
          })
          continue
        }

        if (!inviteResult || inviteResult.length === 0) {
          results.push({
            email: normalizedEmail,
            status: 'failed',
            error: 'Failed to create invitation'
          })
          continue
        }

        const invitation = inviteResult[0]
        console.log(`Invitation result for ${normalizedEmail}: invitation_id=${invitation.invitation_id}, user_exists=${invitation.user_exists}`)

        // If user already exists, they need to accept the invitation
        // For new users, send signup invitation email
        if (invitation.user_exists) {
          // User exists - send them a custom invitation email via Brevo
          // (NOT signInWithOtp which sends a generic "magic link" email)
          const acceptUrl = `${redirectAppUrl}/auth/accept-invite?invitation_id=${invitation.invitation_id}`

          const emailContent = existingUserInviteEmail({
            organizationName: organization.name,
            role: role,
            appName: appName,
            acceptUrl: acceptUrl
          })

          const emailResult = await sendEmail({
            to: normalizedEmail,
            subject: emailContent.subject,
            html: emailContent.html
          })

          if (!emailResult.success) {
            console.error(`Error sending invitation email to ${normalizedEmail}:`, emailResult.error)
            results.push({
              email: normalizedEmail,
              status: 'pending',
              invitationId: invitation.invitation_id,
              userExists: true,
              emailSent: false,
              error: 'Invitation created but email failed to send'
            })
          } else {
            console.log(`Invitation email sent to existing user ${normalizedEmail}, messageId: ${emailResult.messageId}`)
            results.push({
              email: normalizedEmail,
              status: 'pending',
              invitationId: invitation.invitation_id,
              userExists: true,
              emailSent: true
            })
          }
        } else {
          // New user - send signup invitation email
          const redirectUrl = `${redirectAppUrl}/auth/accept-invite?invitation_id=${invitation.invitation_id}`

          // Use admin client for admin.inviteUserByEmail (requires service-role)
          const { error: inviteEmailError } = await adminClient.auth.admin.inviteUserByEmail(
            normalizedEmail,
            {
              data: {
                organization_id: organizationId,
                organization_name: organization.name,
                app_name: appName,
                invitation_id: invitation.invitation_id,
                role: role,
                redirect_app_url: redirectAppUrl
              },
              redirectTo: redirectUrl
            }
          )

          if (inviteEmailError) {
            console.error(`Error sending invitation email to ${normalizedEmail}:`, inviteEmailError)
            results.push({
              email: normalizedEmail,
              status: 'pending',
              invitationId: invitation.invitation_id,
              userExists: false,
              emailSent: false,
              error: 'Invitation created but email failed to send'
            })
          } else {
            console.log(`Invitation email sent to ${normalizedEmail}`)
            results.push({
              email: normalizedEmail,
              status: 'pending',
              invitationId: invitation.invitation_id,
              userExists: false,
              emailSent: true
            })
          }
        }
      } catch (err) {
        console.error(`Unexpected error processing ${normalizedEmail}:`, err)
        results.push({
          email: normalizedEmail,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unexpected error'
        })
      }
    }

    // Summarize results
    const successful = results.filter(r => r.status !== 'failed').length
    const failed = results.filter(r => r.status === 'failed').length

    console.log(`Invitation results: ${successful} successful, ${failed} failed`)

    return successResponse({
      results,
      summary: {
        total: emails.length,
        successful,
        failed
      }
    }, origin)

  } catch (error) {
    console.error('Unexpected error in user-invite-member:', error)
    return errorResponse('Internal server error', 500, req.headers.get('origin'))
  }
})
