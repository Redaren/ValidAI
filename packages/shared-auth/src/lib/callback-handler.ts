import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

interface UserOrganization {
  organization_id: string
  organization_name: string
  user_role: string
  accessible_apps: string[]
  is_active: boolean
}

/**
 * Configuration for auth callback redirect paths.
 * All paths are relative to the app's origin.
 */
export interface CallbackRedirects {
  /** Where to redirect after successful login. Default: '/' */
  success?: string
  /** Where to redirect after accepting an invitation. Default: '/?welcome=true' */
  successWithWelcome?: string
  /** Where to redirect when user has no organizations. Default: '/login?error=no_organization' */
  noOrganization?: string
  /** Where to redirect for org selection. Default: '/login?select-org=true' */
  selectOrg?: string
  /** Base path for error redirects. Default: '/login' */
  errorBase?: string
}

const DEFAULT_REDIRECTS: Required<CallbackRedirects> = {
  success: '/',
  successWithWelcome: '/?welcome=true',
  noOrganization: '/login?error=no_organization',
  selectOrg: '/login?select-org=true',
  errorBase: '/login',
}

/**
 * Creates a redirect response compatible with Next.js route handlers.
 * Uses standard Response API to avoid Next.js version conflicts.
 */
function createRedirect(url: string | URL): Response {
  return Response.redirect(url.toString(), 302)
}

/**
 * Handles the auth callback from Supabase magic link authentication.
 * Exchanges the code for a session and processes any pending invitations.
 *
 * Flow:
 * 1. Exchange code for session
 * 2. If invitation: process via accept-invitation Edge Function
 * 3. If existing user:
 *    - 0 orgs: sign out, redirect to noOrganization path
 *    - 1 org: call switch-organization to refresh JWT, redirect to success path
 *    - 2+ orgs: redirect to selectOrg path (show org picker)
 *
 * @param request - The request object (works with any Next.js version)
 * @param redirects - Optional custom redirect paths (merged with defaults)
 * @returns Response with redirect to appropriate path
 */
export async function handleAuthCallback(
  request: Request,
  redirects?: CallbackRedirects
): Promise<Response> {
  const paths = { ...DEFAULT_REDIRECTS, ...redirects }
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    return createRedirect(new URL(paths.errorBase, request.url))
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
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
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )

  // Exchange code for session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return createRedirect(
      new URL(`${paths.errorBase}?error=${encodeURIComponent(error?.message || 'Unknown error')}`, request.url)
    )
  }

  // Check for pending invitation from magic link
  // The invitation_id is stored in user metadata when the magic link was created
  const invitationId = data.user.user_metadata?.invitation_id
  const redirectAppUrl = data.user.user_metadata?.redirect_app_url

  if (invitationId) {
    console.log(`Processing invitation ${invitationId} for user ${data.user.email}`)

    // Process invitation automatically via Edge Function
    // This creates profile/preferences, adds user to org, and marks invitation accepted
    const { error: inviteError } = await supabase.functions.invoke('accept-invitation', {
      body: { invitationId }
    })

    if (inviteError) {
      console.error('Error processing invitation:', inviteError)
      // Still redirect - user can manually accept later via /auth/accept-invite
    } else {
      console.log(`Invitation processed successfully for ${data.user.email}`)

      // Refresh session to get updated JWT with organization_id and accessible_apps
      await supabase.auth.refreshSession()
    }

    // Redirect to organization's default app if different from current app
    if (redirectAppUrl && !redirectAppUrl.includes(requestUrl.origin)) {
      const welcomePath = paths.successWithWelcome.includes('?')
        ? paths.successWithWelcome.split('?')[1]
        : 'welcome=true'
      return createRedirect(`${redirectAppUrl}${paths.success}?${welcomePath}`)
    }

    // Otherwise redirect with welcome flag
    return createRedirect(new URL(paths.successWithWelcome, request.url))
  }

  // No invitation - existing user login
  // Fetch user's organizations with their accessible apps
  const { data: userOrgs, error: orgsError } = await supabase
    .rpc('get_user_organizations_with_apps', { p_user_id: data.user.id })

  if (orgsError) {
    console.error('Error fetching user organizations:', orgsError)
    // Fail open - redirect to success, middleware will handle access
    return createRedirect(new URL(paths.success, request.url))
  }

  const organizations = (userOrgs || []) as UserOrganization[]

  // Handle based on number of organizations
  if (organizations.length === 0) {
    // No organizations - sign out and redirect with error
    console.log(`User ${data.user.email} has no organizations`)
    await supabase.auth.signOut()
    return createRedirect(new URL(paths.noOrganization, request.url))
  }

  if (organizations.length === 1) {
    // Single org - auto-select and refresh JWT via switch-organization
    const org = organizations[0]
    console.log(`User ${data.user.email} has single org: ${org.organization_name}`)

    const { error: switchError } = await supabase.functions.invoke('switch-organization', {
      body: { organizationId: org.organization_id }
    })

    if (switchError) {
      console.error('Error switching organization:', switchError)
      // Continue anyway - JWT may be stale but middleware will handle
    } else {
      // Refresh session to get updated JWT
      await supabase.auth.refreshSession()
    }

    return createRedirect(new URL(paths.success, request.url))
  }

  // Multiple orgs - redirect to org picker
  console.log(`User ${data.user.email} has ${organizations.length} orgs, showing picker`)
  return createRedirect(new URL(paths.selectOrg, request.url))
}
