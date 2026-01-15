import { AcceptInviteClient } from './accept-invite-client'

interface PageProps {
  searchParams: Promise<{
    invitation_id?: string
    error?: string
  }>
}

/**
 * Accept Invite Page (Minimal Server Component)
 *
 * This page handles the invitation acceptance flow for existing users.
 *
 * IMPORTANT: This is a minimal server component that immediately renders
 * the client component. All auth logic MUST happen client-side because:
 * - Magic links from signInWithOtp() include tokens in the URL hash (#access_token=xxx)
 * - URL hash fragments are client-side only - the server cannot see them
 * - If we check auth server-side, we'll redirect to login before the client
 *   has a chance to process the hash tokens
 *
 * The client component handles:
 * 1. Detecting and processing URL hash tokens
 * 2. Establishing the session
 * 3. Fetching and validating the invitation
 * 4. Processing the acceptance
 */
export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const params = await searchParams

  return (
    <AcceptInviteClient
      invitationIdFromUrl={params.invitation_id}
      errorFromUrl={params.error}
    />
  )
}
