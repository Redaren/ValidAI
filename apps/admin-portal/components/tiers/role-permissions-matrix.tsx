'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@playze/shared-ui'
import { Check, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'

interface RolePermissionsMatrixProps {
  appId: string
  appName: string
}

/**
 * Display role permissions matrix for an app
 * Shows what permissions each role (Owner, Admin, Member, Viewer) has
 *
 * **CURRENT (MVP):** Displays hardcoded default permissions via role_permissions_for_role() function.
 * All apps currently show the same permissions. The appId is passed but not yet used by the function.
 *
 * **FUTURE:** When per-app permissions are implemented (apps.role_permissions column),
 * this component will automatically show different permissions for different apps.
 *
 * See: supabase/migrations/20251218160000_get_user_authorization.sql for migration path.
 */
export function RolePermissionsMatrix({ appId, appName }: RolePermissionsMatrixProps) {
  const { data: permissions, isLoading } = useRolePermissions(appId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions for {appName}</CardTitle>
          <CardDescription>Loading permissions...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!permissions || permissions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions for {appName}</CardTitle>
          <CardDescription>No permissions configured</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Get all unique permission names
  const permissionNames = Array.from(
    new Set(
      permissions.flatMap((p) =>
        p.permissions ? Object.keys(p.permissions as Record<string, boolean>) : []
      )
    )
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role Permissions for {appName}</CardTitle>
        <CardDescription>
          Permissions granted to each role within this application
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-semibold text-sm">Permission</th>
                <th className="text-center p-3 font-semibold text-sm">Owner</th>
                <th className="text-center p-3 font-semibold text-sm">Admin</th>
                <th className="text-center p-3 font-semibold text-sm">Member</th>
                <th className="text-center p-3 font-semibold text-sm">Viewer</th>
              </tr>
            </thead>
            <tbody>
              {permissionNames.map((permissionName) => (
                <tr key={permissionName} className="border-b hover:bg-muted/50">
                  <td className="p-3 text-sm font-medium">
                    {formatPermissionName(permissionName)}
                  </td>
                  {['owner', 'admin', 'member', 'viewer'].map((role) => {
                    const rolePerms = permissions.find((p) => p.role === role)
                    const hasPermission =
                      rolePerms?.permissions?.[permissionName as keyof typeof rolePerms.permissions]
                    return (
                      <td key={role} className="p-3 text-center">
                        {hasPermission ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Current (MVP):</strong> Permissions are defined by the{' '}
            <code>role_permissions_for_role()</code> database function. All apps currently use the
            same default permissions.
          </p>
          <p>
            <strong>Future:</strong> Permissions will be customizable per app via{' '}
            <code>apps.role_permissions</code> column. See migration{' '}
            <code>20251218160000_get_user_authorization.sql</code> for implementation plan.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Hook to fetch role permissions for an app
 */
function useRolePermissions(appId: string) {
  return useQuery({
    queryKey: ['role-permissions', appId],
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call database function for each role
      const roles = ['owner', 'admin', 'member', 'viewer']
      const results = await Promise.all(
        roles.map(async (role) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase.rpc as any)('role_permissions_for_role', {
            p_app_id: appId,
            p_role: role,
          })

          if (error) throw error
          return { role, permissions: data as Record<string, boolean> }
        })
      )

      return results
    },
  })
}

/**
 * Format permission name from snake_case to readable format
 * Example: "can_manage_members" -> "Can Manage Members"
 */
function formatPermissionName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
