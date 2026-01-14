'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Input for canceling an invitation
 */
export interface CancelInvitationInput {
  invitationId: string
  organizationId: string // For query invalidation
  appId?: string // For permission check
}

/**
 * Result from canceling an invitation
 */
export interface CancelInvitationResult {
  id: string
  email: string
  status: string
  /** True if invitation was already processed (accepted/canceled/expired) */
  alreadyProcessed?: boolean
}

/**
 * Hook: Cancel a pending invitation (self-service)
 *
 * Cancels an invitation via the user_cancel_invitation RPC function.
 * Requires the user to have can_manage_members permission.
 *
 * If the invitation was already accepted or processed, returns a result
 * with `alreadyProcessed: true` instead of throwing an error. This allows
 * the UI to show a friendly message and refresh the list.
 *
 * @returns Mutation result with cancel functionality
 *
 * @example
 * ```typescript
 * const cancelInvitation = useCancelInvitation()
 *
 * const handleCancel = async (invitationId: string) => {
 *   const result = await cancelInvitation.mutateAsync({
 *     invitationId,
 *     organizationId: currentOrgId,
 *     appId: 'infracloud'
 *   })
 *
 *   if (result.alreadyProcessed) {
 *     toast.info('This invitation was already accepted or processed')
 *   } else {
 *     toast.success('Invitation canceled')
 *   }
 * }
 * ```
 */
export function useCancelInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CancelInvitationInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('user_cancel_invitation', {
        p_invitation_id: input.invitationId,
        p_app_id: input.appId,
      })

      // Handle "already processed" case gracefully
      if (error) {
        const errorMessage = error.message || ''
        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('already processed')
        ) {
          // Return a special result indicating the invitation was already handled
          return {
            id: input.invitationId,
            email: '',
            status: 'already_processed',
            alreadyProcessed: true,
          } as CancelInvitationResult
        }
        throw new Error(error.message || 'Failed to cancel invitation')
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        // No rows returned means invitation wasn't pending
        return {
          id: input.invitationId,
          email: '',
          status: 'already_processed',
          alreadyProcessed: true,
        } as CancelInvitationResult
      }

      // Map the out_* columns back to the expected interface names
      // (DB columns were renamed to avoid PL/pgSQL variable shadowing)
      const row = data[0]
      return {
        id: row.out_id,
        email: row.out_email,
        status: row.out_status,
      } as CancelInvitationResult
    },
    onSuccess: (_, variables) => {
      // Always invalidate invitations query to refetch the latest state
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.invitations(variables.organizationId),
      })
    },
  })
}
