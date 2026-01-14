import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js'
import type { InvitationSearchInput } from '@/lib/validations'
import { orgKeys } from './organizations'

/**
 * Query keys factory for invitations (platform-wide)
 * Provides hierarchical query key structure for TanStack Query caching
 */
export const invitationKeys = {
  all: ['admin', 'invitations'] as const,
  lists: () => [...invitationKeys.all, 'list'] as const,
  list: (filters?: InvitationSearchInput) => [...invitationKeys.lists(), filters] as const,
}

/**
 * Invitation list result with pagination metadata
 */
export interface InvitationWithOrg {
  id: string
  email: string
  role: string
  status: string
  organization_id: string
  organization_name: string
  invited_by_name: string | null
  invited_at: string
  expires_at: string
}

interface InvitationsListResult {
  invitations: InvitationWithOrg[]
  totalCount: number
}

/**
 * Hook: List all pending invitations with server-side search and pagination
 * Returns invitations with organization info and total count for pagination
 * Uses admin RPC function to bypass RLS and access ALL invitations
 *
 * @param filters - Optional search and pagination filters
 * @returns Query result with invitation list and total count
 */
export function useAllInvitations(filters?: InvitationSearchInput) {
  return useQuery({
    queryKey: invitationKeys.list(filters),
    queryFn: async (): Promise<InvitationsListResult> => {
      const supabase = createBrowserClient()

      // Call admin function with server-side search and pagination
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_all_invitations_paginated', {
        p_search: filters?.search || null,
        p_limit: filters?.limit || 10,
        p_offset: filters?.offset || 0,
      })

      if (error) throw error

      // Extract totalCount from first row (all rows have same total_count)
      const totalCount = data?.[0]?.total_count ?? 0

      // Map to remove total_count from each row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
      const invitations = (data || []).map(({ total_count: _, ...invitation }: any) => invitation)

      return { invitations, totalCount }
    },
    // Keep previous data while fetching new page (prevents flicker)
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook: Cancel invitation (platform-wide version)
 * Uses Edge Function to cancel invitation and clean up orphaned user records
 *
 * Note: This version invalidates both the global invitations list AND the
 * organization-specific members/invitations cache.
 */
export function useCancelInvitationGlobal() {
  const queryClient = useQueryClient()

  return useMutation({
    // organizationId is used in onSuccess for cache invalidation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mutationFn: async ({ invitationId, organizationId }: { invitationId: string; organizationId: string }) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke('cancel-invitation', {
        body: { invitationId },
      })

      // Handle Edge Function errors
      if (error) {
        let errorMessage = 'Failed to cancel invitation'

        if (error instanceof FunctionsHttpError) {
          try {
            const errorBody = await error.context.json()
            errorMessage = errorBody?.error || errorMessage
          } catch {
            // If we can't parse the error body, use default message
          }
        } else if (error instanceof FunctionsRelayError) {
          errorMessage = 'Network error while canceling invitation'
        } else if (error instanceof FunctionsFetchError) {
          errorMessage = 'Failed to connect to server'
        }

        throw new Error(errorMessage)
      }

      // Check for error in response body (Edge Function returns success: false)
      if (data && !data.success && data.error) {
        throw new Error(data.error)
      }

      return data?.data || null
    },
    onSuccess: (_, variables) => {
      // Invalidate global invitations list
      queryClient.invalidateQueries({
        queryKey: invitationKeys.lists(),
      })
      // Also invalidate organization-specific cache
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(variables.organizationId),
      })
    },
  })
}
