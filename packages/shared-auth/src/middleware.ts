import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Helper to strip locale prefix from pathname for multi-language apps.
 * Handles paths like /en/dashboard → /dashboard, /sv/auth/login → /auth/login
 *
 * @param pathname - The full pathname including potential locale prefix
 * @returns Pathname without locale prefix
 */
function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}\//, '/');
}

/**
 * Helper to extract locale from pathname.
 * Returns locale code (e.g., 'en', 'sv') or empty string if no locale present.
 *
 * @param pathname - The full pathname
 * @returns Locale code or empty string
 */
function extractLocale(pathname: string): string {
  const localeMatch = pathname.match(/^\/([a-z]{2})\//);
  return localeMatch ? localeMatch[1] : '';
}

/**
 * Updates the user session in middleware.
 *
 * This function should be called in your Next.js middleware to:
 * 1. Refresh the user's session
 * 2. Optionally redirect unauthenticated users
 *
 * Multi-language support: Automatically detects and preserves locale prefixes
 * in redirects (e.g., /sv/dashboard → /sv/auth/login)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getClaims() must be called to refresh the session
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  // Strip locale prefix for path checking (multi-language support)
  const pathname = request.nextUrl.pathname;
  const pathWithoutLocale = stripLocalePrefix(pathname);
  const locale = extractLocale(pathname);

  // Define public routes that don't require authentication
  const publicRoutes = ['/auth'];
  const isPublicRoute = publicRoutes.some(route => pathWithoutLocale.startsWith(route));

  // Redirect unauthenticated users to login (except for public routes)
  // Uses locale-stripped path for checking, preserves locale in redirect
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    // Preserve locale prefix in redirect URL
    url.pathname = locale ? `/${locale}/auth/login` : "/auth/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
