import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse } from '../_shared/response.ts'
import { getAuthenticatedUser, validateOrgMembership } from '../_shared/auth.ts'
import { validateRequired, validateUuid } from '../_shared/validation.ts'

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
 *     "defaultAppUrl": "https://app.example.com" | null,
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

    // Get authenticated user (uses getClaims() for asymmetric JWT support)
    const authResult = await getAuthenticatedUser(req, supabase)
    if (!authResult) {
      return unauthorizedResponse('Invalid or missing authentication token')
    }
    const { user } = authResult

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

    // Verify organization is active and get default app URL
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select(`
        is_active,
        default_app_id,
        default_app:apps!organizations_default_app_id_fkey(app_url)
      `)
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      console.error('Error fetching organization:', orgError)
      return errorResponse('Organization not found', 404)
    }

    if (!org.is_active) {
      return forbiddenResponse('Organization is inactive')
    }

    // Extract default app URL (handle both object and null cases)
    const defaultAppUrl = org.default_app?.app_url || null

    // Get accessible apps for this organization (also validates at least one exists)
    const { data: accessibleApps, error: appsError } = await supabase
      .rpc('get_org_accessible_apps', { org_id: organizationId })

    if (appsError) {
      console.error('Error fetching accessible apps:', appsError)
      return errorResponse('Failed to verify subscription status', 500)
    }

    if (!accessibleApps || accessibleApps.length === 0) {
      return forbiddenResponse('Organization has no active subscriptions')
    }

    // Update user's JWT metadata with new organization_id and accessible_apps
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          organization_id: organizationId,
          accessible_apps: accessibleApps,
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
      defaultAppUrl,
      message: 'Organization switched successfully. Please refresh your session to apply changes.'
    })

  } catch (error) {
    console.error('Unexpected error in switch-organization:', error)
    return errorResponse('Internal server error', 500)
  }
})
