import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, conflictResponse } from '../_shared/response.ts'
import { getAuthenticatedUser, isPlayzeAdmin } from '../_shared/auth.ts'
import { validateRequired, validateEmail } from '../_shared/validation.ts'

/**
 * Edge Function: create-user
 *
 * Purpose: Create user via Supabase Admin API (Playze admin only)
 *
 * Method: POST
 * Auth: Requires Playze admin user
 *
 * Input:
 * {
 *   "email": "user@example.com",       // Required
 *   "password": "securepass123",       // Optional - if not provided, sends invite email
 *   "full_name": "John Doe",           // Optional
 *   "send_email": true                 // Optional - default true (sends invite if no password)
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": {
 *     "user": { ... },
 *     "method": "direct" | "invitation",
 *     "message": "User created successfully" | "Invitation sent successfully"
 *   }
 * }
 *
 * Behavior:
 * - If password provided: Creates user with password using createUser() API
 *   - User can login immediately
 *   - Email is auto-confirmed (email_confirm: true)
 *   - Trigger automatically creates profile and preferences
 *
 * - If no password: Sends invitation email using inviteUserByEmail() API
 *   - User receives email with invite link
 *   - User sets own password during invitation acceptance
 *   - Trigger automatically creates profile and preferences after acceptance
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('create-user', {
 *   body: {
 *     email: 'user@example.com',
 *     password: 'securepass123',  // Optional
 *     full_name: 'John Doe'       // Optional
 *   }
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
      return forbiddenResponse('Only Playze administrators can create users', origin)
    }

    // Parse and validate request body
    const {
      email,
      password,
      full_name,
      send_email = true
    } = await req.json()

    const validationError = validateRequired({ email }, ['email'])
    if (validationError) {
      return errorResponse(validationError, 400, origin)
    }

    // Validate email format
    if (!validateEmail(email)) {
      return errorResponse('Invalid email format', 400, origin)
    }

    console.log(`Admin ${user.email} creating user: ${email}`)

    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.listUsers()
    const userExists = existingUser?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase())

    if (userExists) {
      return conflictResponse(`User with email '${email}' already exists`, origin)
    }

    // Two flows based on whether password is provided
    if (password) {
      // Flow 1: Direct user creation with password
      console.log('Creating user with password (direct creation)')

      const { data: userData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,  // Auto-confirm email since admin created
        user_metadata: full_name ? { full_name } : {}
      })

      if (createError) {
        console.error('Error creating user:', createError)

        // Handle specific error cases
        if (createError.message?.includes('already registered')) {
          return conflictResponse('User already exists', origin)
        }

        return errorResponse(`Failed to create user: ${createError.message}`, 500, origin)
      }

      console.log(`User created successfully: ${userData.user?.id}`)

      return successResponse({
        user: userData.user,
        method: 'direct',
        message: 'User created successfully. User can login immediately with provided password.'
      }, origin)

    } else {
      // Flow 2: Send invitation email
      console.log('Sending invitation email (no password provided)')

      if (!send_email) {
        return errorResponse('Password is required when send_email is false', 400, origin)
      }

      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          data: full_name ? { full_name } : {},
          redirectTo: `${Deno.env.get('SITE_URL') || 'http://localhost:3000'}/auth/accept-invite`
        }
      )

      if (inviteError) {
        console.error('Error sending invitation:', inviteError)

        if (inviteError.message?.includes('already registered')) {
          return conflictResponse('User already exists', origin)
        }

        return errorResponse(`Failed to send invitation: ${inviteError.message}`, 500, origin)
      }

      console.log(`Invitation sent successfully to: ${email}`)

      return successResponse({
        user: inviteData.user,
        method: 'invitation',
        message: 'Invitation email sent successfully. User will set password during invitation acceptance.'
      }, origin)
    }

  } catch (error) {
    console.error('Unexpected error in create-user:', error)
    return errorResponse('Internal server error', 500, req.headers.get('origin'))
  }
})
