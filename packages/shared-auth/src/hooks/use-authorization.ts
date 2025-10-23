import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * User Authorization Context
 * Returned by get_user_authorization() database function
 */
export interface UserAuthorization {
  organization_id: string
  organization_name: string
  user_role: 'owner' | 'admin' | 'member' | 'viewer'
  app_id: string
  app_name: string
  app_description: string
  tier_name: string
  tier_display_name: string
  tier_features: Record<string, boolean>
  role_permissions: Record<string, boolean>
  tier_limits: Record<string, number>
  current_usage: Record<string, number>
  subscription_status: string
}

/**
 * Hook: Get complete authorization context for current user
 *
 * Returns user's role, tier features, AND role permissions in ONE database query.
 * This is the primary authorization hook - all other auth hooks use this internally.
 *
 * Performance: Single query instead of N queries for N features/permissions
 *
 * @param appId - Optional: Filter to specific app. If omitted, returns all apps.
 * @returns Query result with complete authorization context
 *
 * @example
 * ```typescript
 * // Get authorization for specific app
 * const { data: auth } = useAuthorization('testapp')
 *
 * // Check tier feature
 * const hasExport = auth?.tier_features?.export_reports
 *
 * // Check role permission
 * const canEdit = auth?.role_permissions?.can_edit
 *
 * // Check user role
 * const isAdmin = auth?.user_role === 'admin'
 * ```
 */
export function useAuthorization(appId: string) {
  return useQuery({
    queryKey: queryKeys.authorization.context(appId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call database function (SECURITY DEFINER, gets role + features + permissions)
      // Note: Using 'any' cast temporarily until types regenerate from Supabase
      const { data, error } = await (supabase.rpc as any)(
        'get_user_authorization',
        {
          p_org_id: undefined, // Uses JWT metadata
          p_app_id: appId,     // Always filter to one app
        }
      )

      if (error) throw error

      // Cast to expected type and return single object (always filtered to one app)
      const authData = data as UserAuthorization[]

      return authData?.[0] as UserAuthorization | undefined
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
