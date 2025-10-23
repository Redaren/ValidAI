import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Organization App Subscription
 * Returned by get_organization_apps() database function
 */
export interface OrganizationApp {
  app_id: string
  app_name: string
  app_description: string
  tier_name: string
  tier_display_name: string
  status: string
  features: Record<string, boolean>
  limits: Record<string, number>
  current_usage: Record<string, number>
}

/**
 * Hook: Get organization's app subscriptions
 *
 * Returns the app subscriptions for a specific organization or the current user's
 * organization (from JWT metadata). Includes tier details, features, limits, and usage.
 *
 * Security: Database function enforces:
 * - User must be a member of the requested organization
 * - Only returns data for ONE organization (no cross-org data leakage)
 * - Verifies membership before returning any data
 *
 * @param organizationId - Optional organization ID. If omitted, uses current org from JWT
 * @returns Query result with array of organization's active app subscriptions
 *
 * @example
 * ```typescript
 * // Get current organization's apps
 * const { data: apps } = useOrganizationApps()
 *
 * // Get specific organization's apps (if user is a member)
 * const { data: apps } = useOrganizationApps(orgId)
 *
 * // Find specific app subscription
 * const testAppSub = apps?.find(app => app.app_id === 'testapp')
 * ```
 */
export function useOrganizationApps(organizationId?: string) {
  return useQuery({
    queryKey: queryKeys.organizations.apps(organizationId || 'current'),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call database function (SECURITY DEFINER, verifies membership)
      // org_id parameter:
      // - If provided: Returns that org's apps (if user is a member)
      // - If undefined: Uses auth.user_organization_id() from JWT metadata
      const { data, error } = await supabase
        .rpc('get_organization_apps', {
          org_id: organizationId,
        })
        .returns<OrganizationApp[]>()

      if (error) throw error

      return data || []
    },
    enabled: true, // Always enabled - uses current org if none specified
  })
}
