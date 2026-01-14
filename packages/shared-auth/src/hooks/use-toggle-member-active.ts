'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Input for toggling a member's active status
 */
export interface ToggleMemberActiveInput {
  organizationId: string
  userId: string
  isActive: boolean
  appId?: string // For permission check
}

/**
 * Result from toggling a member's active status
 */
export interface ToggleMemberActiveResult {
  success: boolean
  message: string
}

/**
 * Hook: Toggle a member's active status (self-service)
 *
 * Activates or deactivates a member via the user_toggle_member_active RPC function.
 * Requires the user to have can_manage_members permission.
 *
 * Business rules enforced:
 * - Cannot deactivate self
 * - Can only manage members at same or lower role level
 * - Cannot deactivate the last active owner
 *
 * @returns Mutation result with toggle functionality
 *
 * @example
 * ```typescript
 * const toggleActive = useToggleMemberActive()
 *
 * const handleToggle = async (userId: string, currentlyActive: boolean) => {
 *   try {
 *     await toggleActive.mutateAsync({
 *       organizationId: currentOrgId,
 *       userId,
 *       isActive: !currentlyActive,
 *       appId: 'infracloud'
 *     })
 *     toast.success(currentlyActive ? 'Member deactivated' : 'Member activated')
 *   } catch (error) {
 *     toast.error(error.message)
 *   }
 * }
 * ```
 */
export function useToggleMemberActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ToggleMemberActiveInput): Promise<ToggleMemberActiveResult> => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('user_toggle_member_active', {
        p_org_id: input.organizationId,
        p_user_id: input.userId,
        p_is_active: input.isActive,
        p_app_id: input.appId,
      })

      if (error) {
        throw new Error(error.message || 'Failed to update member status')
      }

      // Function returns TABLE, so data is an array
      const result = (data as ToggleMemberActiveResult[] | null)?.[0]

      if (!result) {
        throw new Error('No response from server')
      }

      if (!result.success) {
        throw new Error(result.message || 'Failed to update member status')
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
