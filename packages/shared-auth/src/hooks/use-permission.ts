import { useAuthorization } from './use-authorization'

/**
 * Hook: Check if user has a specific role-based permission
 *
 * Internally uses useAuthorization() for optimal performance.
 * Multiple permission checks on the same page = only ONE database query.
 *
 * @param appId - The app ID (e.g., 'testapp', 'roadcloud')
 * @param permissionName - The permission name (e.g., 'can_edit', 'can_delete')
 *
 * @example
 * ```typescript
 * const { data: canEdit } = usePermission('testapp', 'can_edit')
 * const { data: canDelete } = usePermission('testapp', 'can_delete')
 *
 * // Only ONE database query for both checks!
 *
 * if (!canEdit) {
 *   return <div>You don't have permission to edit</div>
 * }
 * ```
 */
export function usePermission(appId: string, permissionName: string) {
  const { data: auth, isLoading } = useAuthorization(appId)

  return {
    data: auth?.role_permissions?.[permissionName] || false,
    isLoading,
  }
}
