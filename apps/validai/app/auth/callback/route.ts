import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Auth Callback Route Handler
 *
 * This route is called by Supabase after a user clicks a magic link or completes OAuth.
 * It handles both token_hash (magic link) and code (OAuth PKCE) authentication flows.
 *
 * IMPORTANT: This route uses a special Supabase client configuration for Route Handlers.
 * Unlike Server Components, Route Handlers need direct access to request/response cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Create a response that we'll use to set cookies
  const response = NextResponse.next({
    request,
  })

  // Create Supabase client with Route Handler-specific cookie handling
  // This will set auth cookies on the response object
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Handle magic link authentication (token_hash flow)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (error) {
      console.error('Magic link verification error:', error)
      // Redirect to login with error message
      const errorResponse = NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
      )
      return errorResponse
    }
  }
  // Handle OAuth PKCE flow (code-based)
  else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('OAuth code exchange error:', error)
      // Redirect to login with error message
      const errorResponse = NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
      )
      return errorResponse
    }
  }

  // Successfully authenticated - redirect with cookies
  const successResponse = NextResponse.redirect(new URL(next, request.url))

  // Copy all cookies from the original response to the redirect response
  response.cookies.getAll().forEach(cookie => {
    successResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  return successResponse
}
