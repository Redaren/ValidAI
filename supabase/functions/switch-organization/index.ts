import { createAdminClient } from '@shared/supabaseAdmin.ts'
import { handleCors } from '@shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse } from '@shared/response.ts'
import { getUserFromRequest } from '@shared/auth.ts'
import { validateRequired, validateUuid } from '@shared/validation.ts'

/**
 * Edge Function: auth/switch-organization
 *
 * Purpose: Switch user's active organization context by updating JWT metadata
 *
 * Method: POST
 * Auth: Requires valid JWT
 *
 * Input:
 * {
 *   "organizationId": "uuid"
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": {
 *     "organizationId": "uuid",
 *     "message": "Organization switched successfully..."
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('switch-organization', {
 *   body: { organizationId: 'new-org-uuid' }
 * })
 *
 * // Then refresh session to get new JWT
 * await supabase.auth.refreshSession()
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
    const { organizationId } = await req.json()

    const validationError = validateRequired({ organizationId }, ['organizationId'])
    if (validationError) {
      return errorResponse(validationError)
    }

    if (!validateUuid(organizationId)) {
      return errorResponse('Invalid organization ID format (must be valid UUID)')
    }

    // Fetch organization details AND user's role in single query
    const { data: orgWithRole, error: orgError } = await supabase
      .from('organization_members')
      .select(`
        role,
        organizations (
          id,
          name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (orgError || !orgWithRole || !orgWithRole.organizations) {
      console.error('Error fetching organization:', orgError)
      return forbiddenResponse('You are not a member of this organization')
    }

    const organization = orgWithRole.organizations

    // Fetch organization's active app subscriptions
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('organization_app_subscriptions')
      .select('app_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active')

    if (subscriptionError) {
      console.error('Error fetching subscriptions:', subscriptionError)
      // Don't fail the org switch if subscription query fails
      // Fall back to empty array
    }

    // Extract app IDs into array (e.g., ['validai', 'futureapp'])
    const appSubscriptions = subscriptions?.map(sub => sub.app_id) || []

    // Update user's JWT metadata with organization context
    // IMPORTANT: Replace entire app_metadata to remove old fields
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          organization_id: organizationId,
          organization_name: organization.name,
          organization_role: orgWithRole.role,
          app_subscriptions: appSubscriptions,
        }
      }
    )

    if (updateError) {
      console.error('Error updating user metadata:', updateError)
      return errorResponse('Failed to switch organization', 500)
    }

    console.log(`User ${user.id} switched to organization ${organizationId}`)

    return successResponse({
      organizationId,
      message: 'Organization switched successfully. Please refresh your session to apply changes.'
    })

  } catch (error) {
    console.error('Unexpected error in switch-organization:', error)
    return errorResponse('Internal server error', 500)
  }
})
