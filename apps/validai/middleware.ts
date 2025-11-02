import createMiddleware from 'next-intl/middleware';
import { updateSession } from '@playze/shared-auth/middleware';
import { createServerClient } from '@playze/shared-auth/server';
import { type NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/locales';

// ============================================================
// Configure next-intl middleware
// ============================================================
const intlMiddleware = createMiddleware({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always', // Always include locale in URL
  localeDetection: true,
});

export async function middleware(request: NextRequest) {
  // ============================================================
  // STEP 1: Handle locale routing (next-intl)
  // ============================================================
  const intlResponse = intlMiddleware(request);

  // ⚠️ CRITICAL: Check if intl middleware wants to redirect
  // If it does, we MUST preserve the redirect and merge auth cookies into it
  const isRedirect = intlResponse.status >= 300 && intlResponse.status < 400;

  if (isRedirect) {
    // Intl wants to redirect (e.g., / → /en/)
    // Update session but return intl's redirect with auth cookies merged
    const authResponse = await updateSession(request);

    // Merge auth cookies into the redirect response
    authResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      intlResponse.cookies.set(cookie);
    });

    // Return the redirect with both intl and auth cookies
    return intlResponse;
  }

  // ============================================================
  // STEP 2: No redirect - continue with auth flow
  // ============================================================
  const authResponse = await updateSession(request);

  // ⚠️ CRITICAL: Check if auth middleware wants to redirect (e.g., to /auth/login)
  const isAuthRedirect = authResponse.status >= 300 && authResponse.status < 400;

  if (isAuthRedirect) {
    // Auth middleware is redirecting (unauthenticated user)
    // Return the auth redirect directly - don't merge with intl
    return authResponse;
  }

  // No auth redirect - merge auth cookies INTO intlResponse (preserves URL rewrite)
  authResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
    intlResponse.cookies.set(cookie);
  });

  // ============================================================
  // STEP 3: Extract path info for routing decisions
  // ============================================================
  const pathname = request.nextUrl.pathname;

  // Extract locale from path (e.g., /en/dashboard → "en")
  const locale = pathname.split('/')[1];

  // Remove locale prefix for route matching
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/');

  // Skip access check for auth routes and no-access page
  if (
    pathWithoutLocale.startsWith('/auth') ||
    pathWithoutLocale === '/no-access'
  ) {
    return intlResponse;
  }

  // ============================================================
  // STEP 4: Check ValidAI access for authenticated users
  // ============================================================
  // Note: Unauthenticated users are redirected by shared-auth middleware,
  // so if we reach here, user should be authenticated.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If no user (edge case - shouldn't happen with updated shared-auth),
  // let it pass through - shared-auth will redirect on next request
  if (!user) {
    return intlResponse;
  }

  // Check if user's organization has access to ValidAI
  const orgId = user.app_metadata?.organization_id;

  if (!orgId) {
    // User has no organization - redirect to no-access
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/no-access`;
    return NextResponse.redirect(url);
  }

  const { data: hasAccess, error } = await supabase
    .rpc('check_validai_access' as any, { p_org_id: orgId })
    .single();

  if (error || !hasAccess) {
    // Organization doesn't have ValidAI access - redirect to no-access
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/no-access`;
    return NextResponse.redirect(url);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - API routes (/api/*) - Never have locale prefixes
     * - Edge Functions (/functions/*) - Never have locale prefixes
     * - Next.js internals (/_next/*) - Static files, images, etc.
     *
     * Simplified pattern: Since API routes and functions should never
     * have locale prefixes, we can safely exclude any path starting
     * with /api, /functions, or /_next (which covers /static and /image).
     *
     * This prevents issues where locale-prefixed paths like /en/api/test
     * would incorrectly match with more complex negative lookaheads.
     */
    "/((?!api|functions|_next).*)",
  ],
};
