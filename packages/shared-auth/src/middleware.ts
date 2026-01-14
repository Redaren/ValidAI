import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Configuration options for createAppMiddleware.
 */
export interface AppMiddlewareOptions {
  /**
   * The app ID to check in accessible_apps (e.g., 'validai', 'testapp').
   * Must match the app_id in the apps table and JWT accessible_apps array.
   */
  appId: string

  /**
   * Additional public routes beyond the defaults.
   * Default public routes: ['/login', '/auth/callback', '/unauthorized']
   *
   * Use this for app-specific public pages like:
   * - '/auth/accept-invite' (for implicit flow invitation handling)
   */
  additionalPublicRoutes?: string[]

  /**
   * Where to redirect authenticated users who visit /login.
   * @default '/'
   */
  authenticatedRedirect?: string
}

/**
 * Creates middleware for a ValidAI user app.
 *
 * Handles:
 * 1. Session refresh on each request
 * 2. Public route bypass
 * 3. Unauthenticated redirect to /login
 * 4. App access check via JWT accessible_apps
 * 5. Cookie preservation on redirects
 *
 * @example
 * ```typescript
 * // apps/validai/middleware.ts
 * import { createAppMiddleware } from '@playze/shared-auth/middleware'
 *
 * export const middleware = createAppMiddleware({
 *   appId: 'validai',
 *   additionalPublicRoutes: ['/auth/accept-invite'],
 * })
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
 * }
 * ```
 */
export function createAppMiddleware(options: AppMiddlewareOptions) {
  const {
    appId,
    additionalPublicRoutes = [],
    authenticatedRedirect = '/'
  } = options

  // Default public routes that all apps need + any app-specific ones
  const publicRoutes = [
    '/login',
    '/auth/callback',
    '/unauthorized',
    ...additionalPublicRoutes
  ]

  return async function middleware(request: NextRequest) {
    // Create response object that will be returned
    const response = NextResponse.next({ request })

    // Create Supabase client with proper cookie handling
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Set cookies on both request and response
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            })
          },
        },
      },
    )

    // Check if public route - use startsWith for path matching
    const isPublicRoute = publicRoutes.some(route =>
      request.nextUrl.pathname.startsWith(route)
    )

    // Skip auth checks for public routes to avoid race condition
    // (Callback route needs to complete auth exchange BEFORE middleware checks session)
    if (isPublicRoute) {
      return response
    }

    // Refresh session and get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Helper to create redirect with preserved cookies
    const redirectWithCookies = (path: string) => {
      const redirectResponse = NextResponse.redirect(new URL(path, request.url))
      // Copy cookies from the response to preserve any session updates
      response.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
      })
      return redirectResponse
    }

    // If not authenticated, redirect to login
    if (authError || !user) {
      return redirectWithCookies('/login')
    }

    // If authenticated user visits login page, redirect to main page
    if (request.nextUrl.pathname === '/login') {
      return redirectWithCookies(authenticatedRedirect)
    }

    // Check if user has access to this app via JWT app_metadata.accessible_apps
    // This is populated by Edge Functions (switch-organization, accept-invitation) on login/org-switch
    const accessibleApps = user.app_metadata?.accessible_apps as string[] | undefined

    if (!accessibleApps || !accessibleApps.includes(appId)) {
      // User doesn't have app access - redirect to unauthorized page
      return redirectWithCookies('/unauthorized')
    }

    // Allow access with updated cookies
    return response
  }
}

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
 * Updates the user session in middleware with locale support.
 *
 * This function should be called in your Next.js middleware to:
 * 1. Refresh the user's session
 * 2. Optionally redirect unauthenticated users
 * 3. Return user claims for use in app-specific middleware
 *
 * Multi-language support: Automatically detects and preserves locale prefixes
 * in redirects (e.g., /sv/dashboard → /sv/auth/login)
 *
 * @returns Object with NextResponse and user claims
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
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
    return { response: NextResponse.redirect(url), user: null }
  }

  return { response: supabaseResponse, user }
}
