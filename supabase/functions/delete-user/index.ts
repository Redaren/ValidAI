import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, notFoundResponse } from '../_shared/response.ts'
import { getAuthenticatedUser, isPlayzeAdmin } from '../_shared/auth.ts'
import { validateRequired } from '../_shared/validation.ts'

/**
 * Edge Function: delete-user
 *
 * Purpose: Hard delete a user from the platform (Playze admin only)
 *
 * Method: POST
 * Auth: Requires Playze admin user
 *
 * Input:
 * {
 *   "userId": "uuid-of-user-to-delete"
 * }
 *
 * Output (success):
 * {
 *   "success": true,
 *   "data": {
 *     "deletedUserId": "uuid",
 *     "email": "deleted-user@example.com"
 *   }
 * }
 *
 * Note: If user is sole owner of organizations, those orgs will be left orphaned.
 * An admin can assign a new owner later via the admin portal.
 *
 * Cascade behavior (handled by database ON DELETE CASCADE):
 * - profiles → deleted
 * - organization_members → deleted (user removed from all orgs)
 * - user_preferences → deleted
 *
 * Audit trail (ON DELETE SET NULL):
 * - admin_users.created_by → NULL
 * - organizations.created_by → NULL
 * - organization_members.invited_by → NULL
 * - organization_invitations.invited_by → NULL
 * - organization_app_subscriptions.assigned_by → NULL
 * - invoices.created_by → NULL
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('delete-user', {
 *   body: { userId: 'uuid-of-user-to-delete' }
 * })
 */

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
    const supabase = createAdminClient()

    // Get authenticated user (uses getClaims() for asymmetric JWT support)
    const authResult = await getAuthenticatedUser(req, supabase)
    if (!authResult) {
      return unauthorizedResponse('Invalid or missing authentication token', origin)
    }
    const adminUser = authResult.user

    // Verify user is Playze admin
    const isAdmin = await isPlayzeAdmin(adminUser.email, supabase)
    if (!isAdmin) {
      return forbiddenResponse('Only Playze administrators can delete users', origin)
    }

    // Parse and validate request body
    const { userId } = await req.json()

    const validationError = validateRequired({ userId }, ['userId'])
    if (validationError) {
      return errorResponse(validationError, 400, origin)
    }

    // Prevent self-deletion
    if (userId === adminUser.id) {
      return errorResponse('You cannot delete your own account', 400, origin)
    }

    console.log(`Admin ${adminUser.email} attempting to delete user: ${userId}`)

    // Get user info before deletion (for logging and response)
    const { data: targetUser, error: userError } = await supabase.auth.admin.getUserById(userId)

    if (userError || !targetUser?.user) {
      console.error('User not found:', userError)
      return notFoundResponse('User not found', origin)
    }

    const targetEmail = targetUser.user.email

    // Proceed with deletion
    // Note: If user is sole owner of organizations, those orgs will be left orphaned
    // An admin can assign a new owner later via the admin portal
    console.log(`Deleting user ${targetEmail} (${userId})`)

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Error deleting user:', deleteError)
      return errorResponse('Failed to delete user', 500, origin)
    }

    console.log(`User deleted successfully: ${targetEmail} (${userId}) by admin ${adminUser.email}`)

    return successResponse({
      deletedUserId: userId,
      email: targetEmail
    }, origin)

  } catch (error) {
    console.error('Unexpected error in delete-user:', error)
    return errorResponse('Internal server error', 500, req.headers.get('origin'))
  }
})
