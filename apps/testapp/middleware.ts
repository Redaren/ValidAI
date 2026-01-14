import { createAppMiddleware } from '@playze/shared-auth/middleware'

/**
 * TestApp Middleware
 *
 * Uses the shared middleware factory which handles:
 * - Session refresh on each request
 * - Public route bypass (/login, /auth/callback, /unauthorized)
 * - Unauthenticated redirect to /login
 * - App access check via JWT accessible_apps
 * - Cookie preservation on redirects
 */
export const middleware = createAppMiddleware({
  appId: 'testapp',
  authenticatedRedirect: '/dashboard',
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
