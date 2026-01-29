import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse } from '../_shared/response.ts'
import { getAuthenticatedUser, isPlayzeAdmin } from '../_shared/auth.ts'
import { validateRequired, validateUuid } from '../_shared/validation.ts'

/**
 * Edge Function: cancel-invitation
 *
 * Purpose: Cancel a pending invitation and clean up orphaned user records (Playze admin only)
 *
 * When inviteUserByEmail() is called, Supabase creates a user record in auth.users
 * even before the user clicks the magic link. If the invitation is cancelled,
 * this orphaned user record needs to be cleaned up to allow proper re-invitation.
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
 *       "status": "canceled"
 *     },
 *     "userCleanedUp": true | false,
 *     "message": "Invitation canceled successfully"
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('cancel-invitation', {
 *   body: { invitationId: 'invitation-uuid' }
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
    const { user } = authResult

    // Verify user is Playze admin
    const isAdmin = await isPlayzeAdmin(user.email, supabase)
    if (!isAdmin) {
      return forbiddenResponse('Only Playze administrators can cancel invitations', origin)
    }

    // Parse and validate request body
    const { invitationId } = await req.json()

    const validationError = validateRequired({ invitationId }, ['invitationId'])
    if (validationError) {
      return errorResponse(validationError, 400, origin)
    }

    if (!validateUuid(invitationId)) {
      return errorResponse('Invalid invitation ID format', 400, origin)
    }

    console.log(`Admin ${user.email} canceling invitation ${invitationId}`)

    // Get invitation details BEFORE canceling (need the email)
    const { data: invitation, error: fetchError } = await supabase
      .from('organization_invitations')
      .select('id, email, status')
      .eq('id', invitationId)
      .single()

    if (fetchError || !invitation) {
      console.error('Error fetching invitation:', fetchError)
      return errorResponse('Invitation not found', 404, origin)
    }

    if (invitation.status !== 'pending') {
      return errorResponse(`Cannot cancel invitation with status: ${invitation.status}. Only pending invitations can be canceled.`, 400, origin)
    }

    const invitedEmail = invitation.email.toLowerCase().trim()

    // Cancel the invitation using RPC function
    const { data: cancelResult, error: cancelError } = await supabase
      .rpc('admin_cancel_invitation', {
        p_invitation_id: invitationId
      })

    if (cancelError) {
      console.error('Error canceling invitation:', cancelError)
      return errorResponse(cancelError.message || 'Failed to cancel invitation', 400, origin)
    }

    if (!cancelResult || cancelResult.length === 0) {
      return errorResponse('Failed to cancel invitation', 400, origin)
    }

    const canceledInvitation = cancelResult[0]
    console.log(`Invitation canceled: ${canceledInvitation.id}`)

    // Now check if we need to clean up an orphaned user
    // An orphaned user is one that:
    // 1. Has the same email as the invitation
    // 2. Has NOT confirmed their email (email_confirmed_at IS NULL)
    // 3. Is NOT a member of any organization
    let userCleanedUp = false

    // Use database function to check if user is orphaned
    // This function checks auth.users and organization_members
    const { data: userCheckResult, error: checkError } = await supabase.rpc(
      'check_orphaned_user_for_cleanup',
      { p_email: invitedEmail }
    )

    if (checkError) {
      console.error('Error checking for orphaned user:', checkError)
      // Don't fail the operation, just skip cleanup
    } else if (userCheckResult && userCheckResult.length > 0) {
      const orphanedUser = userCheckResult[0]

      if (orphanedUser.can_delete) {
        console.log(`User ${orphanedUser.user_id} is orphaned (unconfirmed, no memberships). Deleting...`)

        // Delete the orphaned user via Supabase Auth Admin API
        const { error: deleteError } = await supabase.auth.admin.deleteUser(orphanedUser.user_id)

        if (deleteError) {
          console.error('Error deleting orphaned user:', deleteError)
          // Don't fail the whole operation, just log it
        } else {
          console.log(`Successfully deleted orphaned user ${orphanedUser.user_id}`)
          userCleanedUp = true
        }
      } else {
        console.log(`User ${orphanedUser.user_id} cannot be deleted: confirmed=${orphanedUser.is_confirmed}, has_memberships=${orphanedUser.has_memberships}`)
      }
    } else {
      console.log(`No user found with email ${invitedEmail}`)
    }

    return successResponse({
      invitation: canceledInvitation,
      userCleanedUp,
      message: userCleanedUp
        ? 'Invitation canceled and orphaned user cleaned up'
        : 'Invitation canceled successfully'
    }, origin)

  } catch (error) {
    console.error('Unexpected error in cancel-invitation:', error)
    return errorResponse('Internal server error', 500, req.headers.get('origin'))
  }
})
