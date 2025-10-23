import { createAdminClient } from '../../_shared/supabaseAdmin.ts'
import { handleCors } from '../../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse } from '../../_shared/response.ts'
import { getUserFromRequest, validateOrgMembership } from '../../_shared/auth.ts'
import { validateRequired, validateUuid } from '../../_shared/validation.ts'

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

    // Verify user is member of target organization
    const membership = await validateOrgMembership(supabase, user.id, organizationId)
    if (!membership) {
      return forbiddenResponse('You are not a member of this organization')
    }

    // Update user's JWT metadata with new organization_id
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          organization_id: organizationId,
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
