import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * JWT Claims structure returned by getClaims()
 */
export interface JWTClaims {
  sub: string
  email?: string
  phone?: string
  role: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Verify JWT and get user claims using Supabase's built-in getClaims()
 * Works with both symmetric (HS256) and asymmetric (RS256/ES256) JWTs
 *
 * This is the recommended approach for Edge Functions as it:
 * - Uses the JWKS endpoint internally for asymmetric keys
 * - Works transparently with both old and new signing methods
 * - Is the official Supabase recommendation
 *
 * @param req - Incoming request with Authorization header
 * @returns User claims or null if invalid
 */
export async function verifyAndGetClaims(req: Request): Promise<JWTClaims | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')

  // Create a client just for verification
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabase.auth.getClaims(token)

  if (error || !data?.claims) {
    console.error('JWT verification failed:', error)
    return null
  }

  return data.claims as JWTClaims
}

/**
 * Get authenticated user with full user object
 * Combines getClaims() verification with getUser() for full user data
 *
 * This function:
 * 1. Verifies the JWT using getClaims() (supports asymmetric signing)
 * 2. Fetches the full user object using getUser()
 *
 * Use this when you need both JWT verification AND full user data.
 *
 * @param req - Incoming request with Authorization header
 * @param supabase - Supabase admin client (service-role)
 * @returns Object with user and claims, or null if invalid
 */
export async function getAuthenticatedUser(
  req: Request,
  supabase: SupabaseClient
): Promise<{ user: any; claims: JWTClaims } | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')

  // Create anon client for getClaims() verification
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
    return null
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey)

  // First verify the JWT using getClaims()
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token)

  if (claimsError || !claimsData?.claims) {
    console.error('JWT verification failed:', claimsError)
    return null
  }

  // Then get full user object using the admin client
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)

  if (userError || !user) {
    console.error('Failed to get user:', userError)
    return null
  }

  return { user, claims: claimsData.claims as JWTClaims }
}

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
 * Validate user is an active member of organization
 * Returns membership record if valid and active, null otherwise
 *
 * @param {SupabaseClient} supabase - Supabase client (service-role)
 * @param {string} userId - User ID to check
 * @param {string} orgId - Organization ID to check
 * @returns {Promise<any | null>} Membership record or null if not an active member
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
    .eq('is_active', true)
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
