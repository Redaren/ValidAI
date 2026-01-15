import { AcceptInvitePage } from '@playze/shared-ui'

interface PageProps {
  searchParams: Promise<{
    invitation_id?: string
    error?: string
  }>
}

/**
 * Accept Invite Page
 *
 * Uses the shared AcceptInvitePage component which handles the invitation
 * acceptance flow for users.
 *
 * IMPORTANT: The shared component is a client component because:
 * - Magic links from signInWithOtp() include tokens in the URL hash (#access_token=xxx)
 * - URL hash fragments are client-side only - the server cannot see them
 * - The client component handles token detection and session establishment
 */
export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams

  return (
    <AcceptInvitePage
      invitationId={params.invitation_id}
      error={params.error}
    />
  )
}
