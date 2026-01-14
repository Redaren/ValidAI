import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse, forbiddenResponse } from '../_shared/response.ts'
import { getUserFromRequest } from '../_shared/auth.ts'
import { validateRequired, validateUuid } from '../_shared/validation.ts'

/**
 * Edge Function: auth/accept-invitation
 *
 * Purpose: Process invitation acceptance for new and existing users
 * - Creates profile/preferences if they don't exist (handles new users)
 * - Adds the user to the organization
 * - Updates their JWT metadata with the new organization
 *
 * This function is called:
 * 1. From auth callback after new user signs up via magic link (auto-accept)
 * 2. From /auth/accept-invite page when existing user clicks "Accept" button
 *
 * Method: POST
 * Auth: Requires authenticated user (the invited user)
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
 *     "organizationId": "uuid",
 *     "organizationName": "Acme Corp",
 *     "role": "member",
 *     "defaultAppUrl": "https://app.example.com" | null,
 *     "message": "Welcome to Acme Corp!"
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('accept-invitation', {
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

    // Get authenticated user
    const user = await getUserFromRequest(req, supabase)
    if (!user) {
      return unauthorizedResponse('Invalid or missing authentication token')
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

    console.log(`User ${user.email} accepting invitation ${invitationId}`)

    // Ensure profile exists (handles new users who didn't go through trigger)
    // The trigger on auth.users doesn't work in Supabase hosted projects
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null
    }, { onConflict: 'id', ignoreDuplicates: true })

    if (profileError) {
      console.error('Error creating profile:', profileError)
      // Continue anyway - profile creation is not critical for invitation acceptance
    }

    // Ensure user preferences exist
    const { error: prefsError } = await supabase.from('user_preferences').upsert({
      user_id: user.id
    }, { onConflict: 'user_id', ignoreDuplicates: true })

    if (prefsError) {
      console.error('Error creating preferences:', prefsError)
      // Continue anyway - preferences creation is not critical
    }

    // Process invitation via database function
    // This handles all validation and adds user to organization
    const { data: result, error: acceptError } = await supabase
      .rpc('handle_existing_user_invitation', {
        p_user_id: user.id,
        p_invitation_id: invitationId
      })

    if (acceptError) {
      console.error('Error accepting invitation:', acceptError)

      // Provide user-friendly error messages
      if (acceptError.message.includes('not found')) {
        return notFoundResponse('Invitation not found, expired, or already used')
      }
      if (acceptError.message.includes('email does not match')) {
        return errorResponse('This invitation was sent to a different email address')
      }

      return errorResponse(acceptError.message || 'Failed to accept invitation')
    }

    if (!result || result.length === 0) {
      return errorResponse('Failed to process invitation')
    }

    const invitation = result[0]
    console.log(`Invitation accepted: org=${invitation.result_organization_id}, role=${invitation.result_role}`)

    // Verify organization is active before completing acceptance
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('is_active')
      .eq('id', invitation.result_organization_id)
      .single()

    if (orgError || !org) {
      console.error('Error fetching organization:', orgError)
      return errorResponse('Organization not found', 404)
    }

    if (!org.is_active) {
      return forbiddenResponse('Organization is inactive. Cannot accept invitation.')
    }

    // Get accessible apps for this organization (also validates at least one exists)
    const { data: accessibleApps, error: appsError } = await supabase
      .rpc('get_org_accessible_apps', { org_id: invitation.result_organization_id })

    if (appsError) {
      console.error('Error fetching accessible apps:', appsError)
      return errorResponse('Failed to verify subscription status', 500)
    }

    if (!accessibleApps || accessibleApps.length === 0) {
      return forbiddenResponse('Organization has no active subscriptions. Cannot accept invitation.')
    }

    // Update user's JWT metadata with new organization and accessible_apps using admin API
    // This ensures the user's next session has the correct org context
    // Also clear invitation-related metadata to prevent re-triggering on future logins
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          organization_id: invitation.result_organization_id,
          accessible_apps: accessibleApps,
        },
        // Clear invitation-related user_metadata to prevent accept-invitation being called on normal logins
        user_metadata: {
          ...user.user_metadata,
          invitation_id: null,
          organization_id: null,
          organization_name: null,
          app_name: null,
          role: null,
          redirect_app_url: null,
        }
      }
    )

    if (updateError) {
      console.error('Error updating user metadata:', updateError)
      // Don't fail the request - user is already added to org
      // They just might need to manually switch organizations
    }

    console.log(`User ${user.email} successfully joined ${invitation.result_organization_name}`)

    return successResponse({
      organizationId: invitation.result_organization_id,
      organizationName: invitation.result_organization_name,
      role: invitation.result_role,
      defaultAppUrl: invitation.result_default_app_url || null,
      message: `Welcome to ${invitation.result_organization_name}!`
    })

  } catch (error) {
    console.error('Unexpected error in accept-invitation:', error)
    return errorResponse('Internal server error', 500)
  }
})
