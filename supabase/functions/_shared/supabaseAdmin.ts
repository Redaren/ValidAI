import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Create Supabase client with service-role key
 * Used by Edge Functions to perform admin operations
 *
 * @throws {Error} If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing
 * @returns {SupabaseClient} Supabase client with service-role privileges
 */
export function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}

/**
 * Create Supabase client with user's JWT token
 * Used when Edge Functions need to call RPC functions that use auth.uid()
 *
 * This creates a client authenticated as the user, so database functions
 * can use auth.uid() and auth.jwt() to get user context.
 *
 * @param {string} jwt - The user's JWT token from Authorization header
 * @throws {Error} If SUPABASE_URL or SUPABASE_ANON_KEY is missing
 * @returns {SupabaseClient} Supabase client with user context
 */
export function createUserClient(jwt: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}
