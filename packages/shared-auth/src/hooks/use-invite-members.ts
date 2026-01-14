'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'
import type { OrganizationRole } from '../lib/parse-emails'

/**
 * Input for inviting members
 */
export interface InviteMembersInput {
  organizationId: string
  emails: string[]
  role: OrganizationRole
  appId: string
}

/**
 * Result for a single invitation attempt
 */
export interface InviteResult {
  email: string
  status: 'pending' | 'assigned' | 'failed'
  invitationId?: string
  userExists?: boolean
  emailSent?: boolean
  error?: string
}

/**
 * Response from the invite-member Edge Function
 */
interface InviteMembersResponse {
  success: boolean
  data?: {
    results: InviteResult[]
    summary: {
      total: number
      successful: number
      failed: number
    }
  }
  error?: string
}

/**
 * Hook: Invite members to an organization (self-service)
 *
 * Handles bulk invitations via the user-invite-member Edge Function.
 * Validates permissions and tier features on the server side.
 *
 * @returns Mutation result with invite functionality
 *
 * @example
 * ```typescript
 * const inviteMembers = useInviteMembers()
 *
 * const handleInvite = async () => {
 *   const result = await inviteMembers.mutateAsync({
 *     organizationId: 'org-uuid',
 *     emails: ['user1@example.com', 'user2@example.com'],
 *     role: 'member',
 *     appId: 'infracloud'
 *   })
 *
 *   console.log(`Invited ${result.summary.successful} of ${result.summary.total} users`)
 * }
 * ```
 */
export function useInviteMembers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: InviteMembersInput) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke<InviteMembersResponse>(
        'user-invite-member',
        {
          body: {
            organizationId: input.organizationId,
            emails: input.emails,
            role: input.role,
            appId: input.appId,
          },
        }
      )

      if (error) {
        // Extract error message from FunctionsHttpError
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to send invitations'
        throw new Error(errorMessage)
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send invitations')
      }

      return data.data!
    },
    onSuccess: (_, variables) => {
      // Invalidate invitations query to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.invitations(variables.organizationId),
      })
    },
  })
}
