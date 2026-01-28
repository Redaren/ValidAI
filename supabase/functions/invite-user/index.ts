import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, notFoundResponse } from '../_shared/response.ts'
import { getAuthenticatedUser, validateOrgMembership, isOrgAdmin } from '../_shared/auth.ts'
import { validateRequired, validateEmail } from '../_shared/validation.ts'

/**
 * Edge Function: invite-user
 *
 * Purpose: Invite a user to join an organization via email
 *
 * Method: POST
 * Auth: Requires authenticated user who is admin/owner of the organization
 *
 * Input:
 * {
 *   "email": "user@example.com",     // Required - Email to invite
 *   "organizationId": "uuid",        // Required - Organization to invite to
 *   "role": "admin" | "member" | "viewer"  // Required - Role to assign
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": {
 *     "invitation": {
 *       "email": "user@example.com",
 *       "organizationId": "uuid",
 *       "role": "member",
 *       "organizationName": "Acme Corp"
 *     }
 *   }
 * }
 *
 * Behavior:
 * - Validates user has admin/owner role in organization
 * - Sends invitation email via Supabase Auth
 * - Includes organization context in invitation metadata
 * - User receives email with link to accept invitation
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('invite-user', {
 *   body: {
 *     email: 'user@example.com',
 *     organizationId: 'uuid',
 *     role: 'member'
 *   }
 * })
 */

const VALID_ROLES = ['admin', 'member', 'viewer']

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

    // Parse and validate request body
    const { email, organizationId, role } = await req.json()

    const validationError = validateRequired(
      { email, organizationId, role },
      ['email', 'organizationId', 'role']
    )
    if (validationError) {
      return errorResponse(validationError)
    }

    // Validate email format
    if (!validateEmail(email)) {
      return errorResponse('Invalid email format')
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return errorResponse(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`)
    }

    console.log(`User ${user.email} inviting ${email} to org ${organizationId} as ${role}`)

    // Verify user has permission to invite (must be admin or owner)
    const membership = await validateOrgMembership(supabase, user.id, organizationId)
    if (!membership) {
      return forbiddenResponse('You are not a member of this organization')
    }

    if (!isOrgAdmin(membership)) {
      return forbiddenResponse('Only organization admins and owners can invite users')
    }

    // Get organization details for the invitation email
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', organizationId)
      .single()

    if (orgError || !organization) {
      console.error('Error fetching organization:', orgError)
      return notFoundResponse('Organization not found')
    }

    // Send invitation email via Supabase Auth
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${Deno.env.get('SITE_URL') || 'http://localhost:3000'}/auth/accept-invite`,
        data: {
          invited_to_org: organizationId,
          invited_role: role,
          organization_name: organization.name,
          invited_by: user.email,
        },
      }
    )

    if (inviteError) {
      console.error('Error sending invitation:', inviteError)

      // Handle specific error cases
      if (inviteError.message?.includes('already registered')) {
        return errorResponse('User is already registered. They can be added directly to the organization.', 409)
      }

      return errorResponse(`Failed to send invitation: ${inviteError.message}`, 500)
    }

    console.log(`Invitation sent successfully to ${email}`)

    return successResponse({
      invitation: {
        email,
        organizationId,
        role,
        organizationName: organization.name,
      },
    })

  } catch (error) {
    console.error('Unexpected error in invite-user:', error)
    return errorResponse('Internal server error', 500)
  }
})
