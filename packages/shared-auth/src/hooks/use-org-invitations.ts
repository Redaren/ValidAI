'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Organization Invitation
 * Returned by user_get_org_invitations() database function
 */
export interface OrgInvitation {
  id: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: string
  invited_at: string
  expires_at: string
  invited_by_name: string | null
}

/**
 * Hook: Get pending invitations for an organization
 *
 * Fetches all pending invitations for the specified organization.
 * Requires user to be a member of the organization.
 *
 * @param organizationId - Organization UUID to fetch invitations for
 * @returns Query result with pending invitations array
 *
 * @example
 * ```typescript
 * const { data: invitations, isLoading } = useOrgInvitations(orgId)
 *
 * // Display invitations
 * invitations?.map(inv => (
 *   <div key={inv.id}>
 *     {inv.email} - {inv.role} - Expires: {inv.expires_at}
 *   </div>
 * ))
 * ```
 */
export function useOrgInvitations(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organizations.invitations(organizationId || ''),
    queryFn: async () => {
      if (!organizationId) return []

      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('user_get_org_invitations', {
        p_organization_id: organizationId,
      })

      if (error) throw error

      // Map the out_* columns back to the expected interface names
      // (DB columns were renamed to avoid PL/pgSQL variable shadowing)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((row: any) => ({
        id: row.id,
        email: row.out_email,
        role: row.out_role as OrgInvitation['role'],
        status: row.out_status,
        invited_at: row.invited_at,
        expires_at: row.expires_at,
        invited_by_name: row.invited_by_name,
      })) as OrgInvitation[]
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
