import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'
import type { UserOrganization } from '@playze/shared-types'

/**
 * Hook to get all organizations the current user belongs to.
 *
 * Uses the database function `get_user_organizations()` which returns
 * organizations with the user's role in each.
 *
 * @example
 * const { data: orgs } = useUserOrganizations()
 * return <OrgSwitcher organizations={orgs} />
 */
export function useUserOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call database function via RPC
      const { data, error } = await supabase
        .rpc('get_user_organizations')

      if (error) throw error
      return data as UserOrganization[]
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
