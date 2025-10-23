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
