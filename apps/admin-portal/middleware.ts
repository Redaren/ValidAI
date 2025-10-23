import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from "@supabase/ssr"

/**
 * Middleware for Admin Portal
 *
 * Responsibilities:
 * 1. Refresh Supabase session on each request
 * 2. Check if user is authenticated
 * 3. Verify user is a Playze admin (via admin_users table)
 * 4. Redirect non-admins to /unauthorized page
 * 5. Allow unauthenticated access to /login and /unauthorized
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
  const publicRoutes = ['/login', '/unauthorized', '/auth/callback']
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

  // If authenticated user visits login page, redirect to home
  if (request.nextUrl.pathname === '/login') {
    const redirectResponse = NextResponse.redirect(new URL('/', request.url))
    // Copy cookies to preserve session
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirectResponse
  }

  // Check if user is admin using SECURITY DEFINER function (bypasses RLS)
  // This avoids circular RLS recursion when querying admin_users table directly
  const { data: isAdmin, error: adminError } = await supabase
    .rpc('is_playze_admin')

  // If RPC call fails, deny access (fail-safe)
  if (adminError) {
    console.error('Admin check failed:', adminError)
    const redirectResponse = NextResponse.redirect(new URL('/unauthorized', request.url))
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirectResponse
  }

  // If not admin, redirect to unauthorized
  if (!isAdmin) {
    const redirectResponse = NextResponse.redirect(new URL('/unauthorized', request.url))
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
