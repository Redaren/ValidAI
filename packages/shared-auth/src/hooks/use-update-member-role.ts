'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Input for updating a member's role
 */
export interface UpdateMemberRoleInput {
  organizationId: string
  userId: string
  newRole: 'owner' | 'admin' | 'member' | 'viewer'
  appId?: string // For permission check
}

/**
 * Result from updating a member's role
 */
export interface UpdateMemberRoleResult {
  success: boolean
  message: string
}

/**
 * Hook: Update a member's role (self-service)
 *
 * Updates a member's role via the user_update_member_role RPC function.
 * Requires the user to have can_manage_members permission.
 *
 * Business rules enforced:
 * - Cannot change own role
 * - Can only manage members at same or lower role level
 * - Can only assign roles at same or lower level
 * - Cannot demote the last active owner
 *
 * @returns Mutation result with update functionality
 *
 * @example
 * ```typescript
 * const updateRole = useUpdateMemberRole()
 *
 * const handleRoleChange = async (userId: string, newRole: string) => {
 *   try {
 *     await updateRole.mutateAsync({
 *       organizationId: currentOrgId,
 *       userId,
 *       newRole: newRole as 'admin' | 'member' | 'viewer',
 *       appId: 'infracloud'
 *     })
 *     toast.success('Role updated successfully')
 *   } catch (error) {
 *     toast.error(error.message)
 *   }
 * }
 * ```
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateMemberRoleInput): Promise<UpdateMemberRoleResult> => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('user_update_member_role', {
        p_org_id: input.organizationId,
        p_user_id: input.userId,
        p_new_role: input.newRole,
        p_app_id: input.appId,
      })

      if (error) {
        throw new Error(error.message || 'Failed to update role')
      }

      // Function returns TABLE, so data is an array
      const result = (data as UpdateMemberRoleResult[] | null)?.[0]

      if (!result) {
        throw new Error('No response from server')
      }

      if (!result.success) {
        throw new Error(result.message || 'Failed to update role')
      }

      return result
    },
    onSuccess: (_, variables) => {
      // Invalidate members query to refetch the latest state
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      })
    },
  })
}
