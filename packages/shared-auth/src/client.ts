import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr"
import type { TypedSupabaseClient } from '@playze/shared-types'

/**
 * Creates a Supabase client for browser-side operations (Client Components).
 */
export function createBrowserClient(): TypedSupabaseClient {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as TypedSupabaseClient
}
