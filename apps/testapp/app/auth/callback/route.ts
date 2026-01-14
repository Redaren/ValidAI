import { handleAuthCallback } from '@playze/shared-auth/lib'

/**
 * Auth Callback Route
 *
 * Uses the shared callback handler which:
 * - Exchanges auth code for session
 * - Processes pending invitations automatically
 * - Handles multi-org routing:
 *   - 0 orgs: signs out, redirects to login with error
 *   - 1 org: auto-switches org, redirects to dashboard
 *   - 2+ orgs: redirects to org picker
 * - Refreshes session with updated JWT
 */
export async function GET(request: Request) {
  return await handleAuthCallback(request, {
    success: '/dashboard',
    selectOrg: '/login?select-org=true',
  })
}
