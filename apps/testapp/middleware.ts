import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from "@supabase/ssr"

/**
 * Middleware for TestApp
 *
 * Responsibilities:
 * 1. Refresh Supabase session on each request
 * 2. Check if user is authenticated
 * 3. Redirect unauthenticated users to /login
 * 4. Allow unauthenticated access to /login and /auth/callback
 *
 * NOTE: This uses standard user access pattern (PostgREST + RLS), NOT admin pattern.
 */
export async function middleware(request: NextRequest) {
  // Create response object that will be returned
  let response = NextResponse.next({
    request,
  })

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

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/auth/callback']
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))

  // Skip auth checks entirely for public routes to avoid race condition
  // (Callback route needs to complete auth exchange BEFORE middleware checks session)
  if (isPublicRoute) {
    return response
  }

  // Refresh session and get authenticated user (for protected routes)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (authError || !user) {
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
    // Copy cookies from the response to preserve any session updates
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirectResponse
  }

  // If authenticated user visits login page, redirect to dashboard
  if (request.nextUrl.pathname === '/login') {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    // Copy cookies to preserve session
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirectResponse
  }

  // Allow access with updated cookies
  return response
}

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
