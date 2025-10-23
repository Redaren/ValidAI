import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import type {
  UpdateSubscriptionTierInput,
  CancelSubscriptionInput,
} from '@/lib/validations'

/**
 * Query keys factory for subscriptions
 * Hierarchical structure for efficient cache invalidation
 */
export const subscriptionKeys = {
  all: ['admin', 'subscriptions'] as const,
  lists: () => [...subscriptionKeys.all, 'list'] as const,
  list: (filters?: unknown) => [...subscriptionKeys.lists(), filters] as const,
  details: () => [...subscriptionKeys.all, 'detail'] as const,
  detail: (id: string) => [...subscriptionKeys.details(), id] as const,
  appTiers: (appId: string) => ['admin', 'apps', appId, 'tiers'] as const,
}

/**
 * Hook: List all subscriptions
 * Returns subscriptions with organization, app, and tier details
 * Uses admin RPC function to bypass RLS and access ALL subscriptions
 */
export function useSubscriptions(filters?: { status?: string; appId?: string; search?: string }) {
  return useQuery({
    queryKey: subscriptionKeys.list(filters),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, returns ALL subscriptions)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_all_subscriptions')

      if (error) throw error

      // Apply client-side filtering
      let filtered = data || []

      if (filters?.status && filters.status !== 'all') {
        filtered = filtered.filter((sub: { status: string }) => sub.status === filters.status)
      }

      if (filters?.appId) {
        filtered = filtered.filter((sub: { app_id: string }) => sub.app_id === filters.appId)
      }

      if (filters?.search) {
        const search = filters.search.toLowerCase()
        filtered = filtered.filter((sub: { organization_name?: string }) =>
          sub.organization_name?.toLowerCase().includes(search)
        )
      }

      return filtered
    },
    enabled: true,
  })
}

/**
 * Hook: Get single subscription details
 * Uses admin RPC function (same as useSubscriptions, filtered client-side)
 */
export function useSubscription(id: string) {
  return useQuery({
    queryKey: subscriptionKeys.detail(id),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function and filter to single subscription
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_all_subscriptions')

      if (error) throw error

      // Find subscription by ID (client-side)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data?.find((sub: any) => sub.id === id) || null
    },
    enabled: !!id,
  })
}

/**
 * Hook: Get available tiers for an app
 * Uses admin RPC function for architectural consistency (100% admin RPC pattern)
 */
export function useAppTiers(appId: string) {
  return useQuery({
    queryKey: subscriptionKeys.appTiers(appId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (consistent with all other admin operations)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_app_tiers', {
        p_app_id: appId,
      })

      if (error) throw error
      return data
    },
    enabled: !!appId,
  })
}

/**
 * Mutation: Update subscription tier
 * Uses admin RPC function (no UPDATE policy exists for PostgREST)
 */
export function useUpdateSubscriptionTier() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateSubscriptionTierInput) => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, no UPDATE policy exists)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_update_subscription_tier', {
        subscription_id: input.subscriptionId,
        new_tier_id: input.tierId,
        new_tier_name: input.tierName,
        admin_notes: input.notes,
      })

      if (error) throw error
      return data?.[0] // RPC returns array
    },
    onSuccess: () => {
      // Invalidate subscriptions list
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}

/**
 * Mutation: Cancel subscription
 * Uses admin RPC function (no UPDATE policy exists for PostgREST)
 */
export function useCancelSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CancelSubscriptionInput) => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, no UPDATE policy exists)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_cancel_subscription', {
        subscription_id: input.subscriptionId,
        cancellation_reason: input.reason,
      })

      if (error) throw error
      return data?.[0] // RPC returns array
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}
