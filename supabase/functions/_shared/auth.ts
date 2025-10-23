import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Check if email belongs to Playze admin
 * Queries admin_users table to verify admin status
 *
 * Uses service-role client to bypass RLS policies
 * Single source of truth: admin_users database table
 *
 * To add a new admin:
 * 1. Insert into admin_users table via SQL or Admin Portal UI
 * 2. No code changes or redeployment needed
 *
 * @param {string} email - Email address to check
 * @param {SupabaseClient} supabase - Supabase client (service-role)
 * @returns {Promise<boolean>} True if email is in admin_users table
 */
export async function isPlayzeAdmin(
  email: string,
  supabase: SupabaseClient
): Promise<boolean> {
  console.log('=== isPlayzeAdmin DEBUG ===')
  console.log('Input email:', email)
  console.log('Input email type:', typeof email)
  console.log('Lowercase email:', email?.toLowerCase())

  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email')  // Select email too for debugging
    .eq('email', email.toLowerCase())
    .maybeSingle()

  console.log('Query result data:', data)
  console.log('Query result error:', error)
  console.log('Return value:', !!data)
  console.log('=== END isPlayzeAdmin DEBUG ===')

  if (error) {
    console.error('Error checking admin status:', error)
    return false
  }

  return !!data
}

/**
 * Get authenticated user from request
 * Validates JWT from Authorization header and returns user object
 *
 * @param {Request} req - Incoming request with Authorization header
 * @param {SupabaseClient} supabase - Supabase client (service-role)
 * @returns {Promise<any | null>} User object or null if invalid
 */
export async function getUserFromRequest(
  req: Request,
  supabase: SupabaseClient
): Promise<any | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    console.error('Error getting user from token:', error)
    return null
  }

  return user
}

/**
 * Validate user is member of organization
 * Returns membership record if valid, null otherwise
 *
 * @param {SupabaseClient} supabase - Supabase client (service-role)
 * @param {string} userId - User ID to check
 * @param {string} orgId - Organization ID to check
 * @returns {Promise<any | null>} Membership record or null if not member
 */
export async function validateOrgMembership(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<any | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    console.error('Error validating org membership:', error)
    return null
  }

  return data
}

/**
 * Check if user is admin or owner in organization
 * Used for permission checks in organization management functions
 *
 * @param {any} membership - Membership record from validateOrgMembership
 * @returns {boolean} True if user is admin or owner
 */
export function isOrgAdmin(membership: any): boolean {
  return membership && (membership.role === 'admin' || membership.role === 'owner')
}
