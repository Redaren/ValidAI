import { useAuthorization } from './use-authorization'

/**
 * Hook: Check if user has one of the required roles
 *
 * Internally uses useAuthorization() for optimal performance.
 *
 * @param appId - The app ID (e.g., 'testapp', 'roadcloud')
 * @param requiredRoles - Array of acceptable roles
 *
 * @example
 * ```typescript
 * // Check if user is owner or admin
 * const { data: isAdmin } = useHasRole('testapp', ['owner', 'admin'])
 *
 * if (!isAdmin) {
 *   return <div>Admin access required</div>
 * }
 * ```
 */
export function useHasRole(
  appId: string,
  requiredRoles: Array<'owner' | 'admin' | 'member' | 'viewer'>
) {
  const { data: auth, isLoading } = useAuthorization(appId)

  return {
    data: auth ? requiredRoles.includes(auth.user_role) : false,
    isLoading,
  }
}
