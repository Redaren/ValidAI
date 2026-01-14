'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'
import type { OrgMember } from './use-org-members'

/**
 * Extended OrgMember with invited_by_name for paginated queries
 */
export interface OrgMemberWithInviter extends OrgMember {
  /** Name of the person who invited this member (or null if unknown) */
  invited_by_name: string | null
}

/**
 * Parameters for paginated org members query
 */
export interface OrgMembersParams {
  /** Search term (matches email or full_name) */
  search?: string
  /** Number of results per page (default 10) */
  limit?: number
  /** Offset for pagination (default 0) */
  offset?: number
}

/**
 * Result shape for paginated org members query
 */
export interface OrgMembersPaginatedResult {
  /** Array of organization members with inviter info */
  members: OrgMemberWithInviter[]
  /** Total count of members (for pagination UI) */
  totalCount: number
}

/**
 * Hook: Get paginated members of an organization with search
 *
 * Fetches members for the specified organization with server-side
 * search and pagination. Scales to 1000+ members.
 *
 * @param organizationId - Organization UUID to fetch members for
 * @param appId - App ID for context (optional)
 * @param params - Search and pagination parameters
 * @returns Query result with { members, totalCount }
 *
 * @example
 * ```typescript
 * const [searchInput, setSearchInput] = useState('')
 * const debouncedSearch = useDebounce(searchInput, 300)
 * const [page, setPage] = useState(0)
 * const PAGE_SIZE = 10
 *
 * const { data, isLoading } = useOrgMembersPaginated(orgId, 'infracloud', {
 *   search: debouncedSearch || undefined,
 *   limit: PAGE_SIZE,
 *   offset: page * PAGE_SIZE,
 * })
 *
 * // Use data.members for display
 * // Use data.totalCount for pagination UI
 * const pageCount = Math.ceil((data?.totalCount || 0) / PAGE_SIZE)
 * ```
 */
export function useOrgMembersPaginated(
  organizationId: string | undefined,
  appId?: string,
  params?: OrgMembersParams
) {
  return useQuery({
    queryKey: queryKeys.organizations.membersPaginated(organizationId || '', params),
    queryFn: async (): Promise<OrgMembersPaginatedResult> => {
      if (!organizationId) return { members: [], totalCount: 0 }

      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('user_get_org_members_paginated', {
        p_organization_id: organizationId,
        p_app_id: appId ?? undefined,
        p_search: params?.search ?? undefined,
        p_limit: params?.limit ?? 10,
        p_offset: params?.offset ?? 0,
      })

      if (error) throw error

      // Extract totalCount from first row (all rows have same total_count)
      const totalCount = data?.[0]?.total_count ?? 0

      // Map to remove total_count from each row and cast to OrgMemberWithInviter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members: OrgMemberWithInviter[] = (data || []).map((row: any) => ({
        user_id: row.user_id,
        email: row.email,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        role: row.role as 'owner' | 'admin' | 'member' | 'viewer',
        is_active: row.is_active,
        joined_at: row.joined_at,
        invited_by_name: row.invited_by_name ?? null,
      }))

      return { members, totalCount }
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    // Keep previous data while fetching new page (prevents flicker)
    placeholderData: (previousData) => previousData,
  })
}
