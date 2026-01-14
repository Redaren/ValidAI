import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * User App (organization subscription or platform app)
 *
 * Returned by get_user_apps_with_admin() database function.
 * Combines organization subscribed apps with Admin Portal (for admins only).
 */
export interface UserApp {
  app_id: string
  app_name: string
  app_description: string
  app_url: string  // Full URL for navigation (e.g., http://localhost:3002)
  tier_name: string
  tier_display_name: string
  status: string
  features: Record<string, boolean>
  limits: Record<string, number>
  current_usage: Record<string, number>
  is_platform_app: boolean  // true for Admin Portal, false for subscribed apps
}

/**
 * Hook: Get user's accessible apps
 *
 * Returns organization's subscribed apps plus Admin Portal (if user is platform admin).
 *
 * Server-side security:
 * - Subscribed apps: Verified via get_organization_apps() (checks organization membership)
 * - Admin Portal: Verified via is_playze_admin() (checks admin_users table)
 * - Cannot be bypassed: Admin check happens server-side in database function
 *
 * Performance:
 * - Single database query via RPC
 * - Cached for 5 minutes via TanStack Query
 * - Reuses existing database functions (no duplication)
 *
 * @returns Query result with array of accessible apps
 *
 * @example
 * ```typescript
 * // Get all accessible apps (subscriptions + admin portal for admins)
 * const { data: apps, isLoading } = useUserAppsWithAdmin()
 *
 * // Filter by type
 * const platformApps = apps?.filter(app => app.is_platform_app)
 * const subscribedApps = apps?.filter(app => !app.is_platform_app)
 *
 * // Find specific app
 * const adminPortal = apps?.find(app => app.app_id === 'admin')
 * const validAI = apps?.find(app => app.app_id === 'validai')
 * ```
 *
 * @example
 * ```typescript
 * // Use in AppSwitcher component
 * function AppSwitcher() {
 *   const { data: apps } = useUserAppsWithAdmin()
 *
 *   return (
 *     <Dropdown>
 *       {apps?.map(app => (
 *         <MenuItem key={app.app_id}>
 *           {app.app_name}
 *           {app.is_platform_app && ' (Platform)'}
 *         </MenuItem>
 *       ))}
 *     </Dropdown>
 *   )
 * }
 * ```
 */
export function useUserAppsWithAdmin() {
  return useQuery({
    queryKey: queryKeys.user.appsWithAdmin(),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call database function (SECURITY DEFINER, combines subscriptions + admin check)
      // Returns:
      // - Organization's active app subscriptions (for all users)
      // - Admin Portal entry (only for platform administrators)
      const { data, error } = await supabase
        .rpc('get_user_apps_with_admin')
        .returns<UserApp[]>()

      if (error) throw error

      return data || []
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: true, // Always enabled - function handles authorization
  })
}
