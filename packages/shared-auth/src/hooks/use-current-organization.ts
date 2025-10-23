import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'
import type { Organization } from '@playze/shared-types'

/**
 * Hook to get the current active organization from user's JWT metadata.
 *
 * Uses get_current_organization() database function which bypasses RLS
 * to prevent infinite recursion in organization_members policies.
 *
 * The organization_id is stored in app_metadata.organization_id in the JWT.
 *
 * @example
 * const { data: org } = useCurrentOrganization()
 * return <div>Current Org: {org?.name}</div>
 */
export function useCurrentOrganization() {
  return useQuery({
    queryKey: queryKeys.organizations.current(),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call SECURITY DEFINER function via RPC (bypasses RLS, prevents recursion)
      const { data, error } = await supabase
        .rpc('get_current_organization')
        .maybeSingle()

      if (error) throw error
      return data as Organization | null
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
