'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Organization Member
 * Returned by user_get_org_members() database function
 */
export interface OrgMember {
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  is_active: boolean
  joined_at: string
}

/**
 * Hook: Get members of an organization
 *
 * Fetches all members for the specified organization.
 * Requires user to be a member of the organization.
 *
 * @param organizationId - Organization UUID to fetch members for
 * @param appId - App ID for context (optional)
 * @returns Query result with members array
 *
 * @example
 * ```typescript
 * const { data: members, isLoading } = useOrgMembers(orgId, 'infracloud')
 *
 * // Display members
 * members?.map(member => (
 *   <div key={member.user_id}>
 *     {member.full_name || member.email} - {member.role}
 *     {!member.is_active && <span>Inactive</span>}
 *   </div>
 * ))
 * ```
 */
export function useOrgMembers(organizationId: string | undefined, appId?: string) {
  return useQuery({
    queryKey: queryKeys.organizations.members(organizationId || ''),
    queryFn: async () => {
      if (!organizationId) return []

      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('user_get_org_members', {
        p_organization_id: organizationId,
        p_app_id: appId,
      })

      if (error) throw error

      return (data || []) as OrgMember[]
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
