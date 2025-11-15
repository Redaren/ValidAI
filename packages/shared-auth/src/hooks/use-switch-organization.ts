import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'
import type { SwitchOrganizationInput } from '@playze/shared-types'

/**
 * Hook to switch the user's active organization.
 *
 * This calls the Edge Function `switch-organization` which updates
 * the JWT metadata with the new organization_id.
 *
 * @example
 * const switchOrg = useSwitchOrganization()
 *
 * <button onClick={() => switchOrg.mutate({ organizationId: 'new-org-id' })}>
 *   Switch Org
 * </button>
 */
export function useSwitchOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SwitchOrganizationInput) => {
      const supabase = createBrowserClient()

      // Call Edge Function to update JWT in database
      const { data, error } = await supabase.functions.invoke('switch-organization', {
        body: { organizationId: input.organizationId }
      })

      if (error) throw error

      // Refresh session to get updated JWT from database
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError

      return data
    },
    onSuccess: () => {
      // Invalidate all organization-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all() })
    },
  })
}
