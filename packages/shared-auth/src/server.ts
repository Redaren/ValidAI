import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { TypedSupabaseClient } from '@playze/shared-types'

/**
 * Creates a Supabase client for server-side operations (Server Components, Route Handlers).
 *
 * IMPORTANT: Don't put this client in a global variable. Always create a new client
 * within each function when using it (especially important for Fluid compute).
 */
export async function createServerClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies()

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    },
  ) as TypedSupabaseClient
}
