import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, notFoundResponse } from '../_shared/response.ts'
import { getUserFromRequest, isPlayzeAdmin } from '../_shared/auth.ts'
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
 * Output (blocked - sole owner):
 * {
 *   "success": false,
 *   "error": "Cannot delete user. They are the sole owner of: Org A, Org B"
 * }
 *
 * Safety: Blocks deletion if user is the sole owner of any organization
 *
 * Cascade behavior (handled by database ON DELETE CASCADE):
 * - profiles → deleted
 * - organization_members → deleted
 * - user_preferences → deleted
 * - admin_users → deleted
 *
 * Audit trail (ON DELETE SET NULL):
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
    const adminUser = await getUserFromRequest(req, supabase)
    if (!adminUser) {
      return unauthorizedResponse('Invalid or missing authentication token')
    }

    // Verify user is Playze admin
    const isAdmin = await isPlayzeAdmin(adminUser.email, supabase)
    if (!isAdmin) {
      return forbiddenResponse('Only Playze administrators can delete users')
    }

    // Parse and validate request body
    const { userId } = await req.json()

    const validationError = validateRequired({ userId }, ['userId'])
    if (validationError) {
      return errorResponse(validationError)
    }

    // Prevent self-deletion
    if (userId === adminUser.id) {
      return errorResponse('You cannot delete your own account')
    }

    console.log(`Admin ${adminUser.email} attempting to delete user: ${userId}`)

    // Get user info before deletion (for logging and response)
    const { data: targetUser, error: userError } = await supabase.auth.admin.getUserById(userId)

    if (userError || !targetUser?.user) {
      console.error('User not found:', userError)
      return notFoundResponse('User not found')
    }

    const targetEmail = targetUser.user.email

    // Check if user is sole owner of any organization
    const { data: soleOwnerOrgs, error: checkError } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        organization_members!inner (
          user_id,
          role
        )
      `)
      .eq('organization_members.user_id', userId)
      .eq('organization_members.role', 'owner')

    if (checkError) {
      console.error('Error checking sole owner status:', checkError)
      return errorResponse('Failed to verify user ownership status', 500)
    }

    // For each org where user is owner, check if there are other owners
    const orgsWhereUserIsSoleOwner: string[] = []

    if (soleOwnerOrgs && soleOwnerOrgs.length > 0) {
      for (const org of soleOwnerOrgs) {
        // Check if there are other owners in this organization
        const { data: otherOwners, error: ownerCheckError } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', org.id)
          .eq('role', 'owner')
          .neq('user_id', userId)

        if (ownerCheckError) {
          console.error(`Error checking other owners for org ${org.id}:`, ownerCheckError)
          continue
        }

        // If no other owners exist, this user is the sole owner
        if (!otherOwners || otherOwners.length === 0) {
          orgsWhereUserIsSoleOwner.push(org.name)
        }
      }
    }

    // Block deletion if user is sole owner of any organization
    if (orgsWhereUserIsSoleOwner.length > 0) {
      const orgNames = orgsWhereUserIsSoleOwner.join(', ')
      console.log(`Deletion blocked - user is sole owner of: ${orgNames}`)
      return errorResponse(
        `Cannot delete user. They are the sole owner of: ${orgNames}. Please assign another owner first.`,
        400
      )
    }

    // Proceed with deletion
    console.log(`Deleting user ${targetEmail} (${userId})`)

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Error deleting user:', deleteError)
      return errorResponse('Failed to delete user', 500)
    }

    console.log(`User deleted successfully: ${targetEmail} (${userId}) by admin ${adminUser.email}`)

    return successResponse({
      deletedUserId: userId,
      email: targetEmail
    })

  } catch (error) {
    console.error('Unexpected error in delete-user:', error)
    return errorResponse('Internal server error', 500)
  }
})
