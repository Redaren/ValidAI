import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js'
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  AssignSubscriptionInput,
  AssignMembershipInput,
} from '@/lib/validations'

/**
 * Query keys factory for organizations
 * Hierarchical structure for efficient cache invalidation
 */
export const orgKeys = {
  all: ['admin', 'organizations'] as const,
  lists: () => [...orgKeys.all, 'list'] as const,
  details: () => [...orgKeys.all, 'detail'] as const,
  detail: (id: string) => [...orgKeys.details(), id] as const,
  members: (id: string) => [...orgKeys.detail(id), 'members'] as const,
  subscriptions: (id: string) => [...orgKeys.detail(id), 'subscriptions'] as const,
}

/**
 * Hook: List all organizations
 * Uses admin RPC function that bypasses RLS and returns member counts
 */
export function useOrganizations() {
  return useQuery({
    queryKey: orgKeys.lists(),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // DEBUG: Log current session info
      const { data: { session } } = await supabase.auth.getSession()
      console.log('🔍 [useOrganizations] Current session:', {
        user_email: session?.user?.email,
        user_id: session?.user?.id,
        has_session: !!session,
      })

      // Call admin RPC function (bypasses RLS, includes member counts)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: organizations, error } = await (supabase as any)
        .rpc('admin_list_organizations')

      // DEBUG: Log query result
      console.log('🔍 [useOrganizations] RPC result:', {
        success: !error,
        count: organizations?.length || 0,
        error: error,
        organizations: organizations,
      })

      if (error) {
        console.error('❌ [useOrganizations] RPC failed:', error)
        throw error
      }

      return organizations || []
    },
  })
}

/**
 * Hook: Get single organization details
 * Uses admin RPC function that bypasses RLS and returns member count
 */
export function useOrganization(id: string) {
  return useQuery({
    queryKey: orgKeys.detail(id),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, includes member count)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_get_organization', { org_id: id })

      if (error) throw error

      // RPC returns array, we want single object
      return data?.[0] || null
    },
    enabled: !!id,
  })
}

/**
 * Hook: Get organization members with profiles
 * Uses admin RPC function that bypasses RLS and includes profile data
 */
export function useOrganizationMembers(organizationId: string) {
  return useQuery({
    queryKey: orgKeys.members(organizationId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, includes profile data via joins)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_list_organization_members', { org_id: organizationId })

      if (error) throw error

      // Map RPC result to match expected format
      // Note: organization_members table uses composite PK (organization_id, user_id), no id column
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((member: any) => ({
        id: member.user_id, // Use user_id as id for table key
        organization_id: member.organization_id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        invited_by: member.invited_by,
        profiles: {
          id: member.user_id,
          full_name: member.user_full_name,
          avatar_url: member.user_avatar_url,
        },
      }))
    },
    enabled: !!organizationId,
  })
}

/**
 * Hook: Get organization subscriptions
 * Uses admin RPC function that bypasses RLS and includes app/tier details
 */
export function useOrganizationSubscriptions(organizationId: string) {
  return useQuery({
    queryKey: orgKeys.subscriptions(organizationId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, includes app/tier via joins)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_list_organization_subscriptions', { org_id: organizationId })

      if (error) throw error

      // Map RPC result to match expected format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((sub: any) => ({
        ...sub,
        app: {
          id: sub.app_id,
          name: sub.app_name,
          description: sub.app_description,
        },
        tier: {
          id: sub.tier_id,
          tier_name: sub.tier_name,
          display_name: sub.tier_display_name,
          features: sub.tier_features,
          limits: sub.tier_limits,
        },
      }))
    },
    enabled: !!organizationId,
  })
}

/**
 * Hook: Create organization
 * Uses Edge Function for service-role operations
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke('create-organization', {
        body: {
          name: input.name,
          description: input.description || null,
          initialOwnerEmail: input.initialOwnerEmail,
          appSubscriptions: input.appSubscriptions,
        },
      })

      // Extract actual error message from Edge Function response
      // The Supabase Functions client returns different error types:
      // - FunctionsHttpError: Function executed but returned error status (4xx, 5xx)
      // - FunctionsRelayError: Network issue between client and Supabase
      // - FunctionsFetchError: Function couldn't be reached
      if (error) {
        let errorMessage = 'Failed to create organization'

        if (error instanceof FunctionsHttpError) {
          // Edge Function returned error response with body
          // Must extract error from error.context.json() - NOT from data!
          try {
            const errorBody = await error.context.json()
            errorMessage = errorBody.error || errorMessage
          } catch {
            // Failed to parse error body, use generic message
            errorMessage = 'Edge Function returned an error'
          }
        } else if (error instanceof FunctionsRelayError) {
          errorMessage = `Network error: ${error.message}`
        } else if (error instanceof FunctionsFetchError) {
          errorMessage = `Failed to reach Edge Function: ${error.message}`
        } else {
          errorMessage = error.message || errorMessage
        }

        throw new Error(errorMessage)
      }

      // Success case - check if Edge Function indicated success
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to create organization')
      }

      return data?.data
    },
    onSuccess: () => {
      // Invalidate organizations list to refetch
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
    },
  })
}

/**
 * Hook: Update organization
 * Uses admin RPC function to bypass RLS and avoid infinite recursion
 */
export function useUpdateOrganization(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateOrganizationInput) => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, avoids recursion)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_update_organization', {
          org_id: organizationId,
          org_name: input.name,
          org_description: input.description || '',
          org_is_active: input.is_active,
        })

      if (error) throw error

      // RPC returns array, we want single object
      return data?.[0] || null
    },
    onSuccess: () => {
      // Invalidate both list and detail caches
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(organizationId) })
    },
  })
}

/**
 * Hook: Assign subscription to organization
 * Uses admin RPC function to bypass RLS and avoid infinite recursion
 */
export function useAssignSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AssignSubscriptionInput) => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, avoids recursion)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_assign_subscription', {
          p_organization_id: input.organizationId,
          p_app_id: input.appId,
          p_tier_id: input.tierId,
          p_tier_name: input.tierName,
          p_notes: input.notes || null,
        })

      if (error) throw error

      // RPC returns array, we want single object
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate organization subscriptions cache
      queryClient.invalidateQueries({
        queryKey: orgKeys.subscriptions(variables.organizationId),
      })
    },
  })
}

/**
 * Hook: Assign member to organization
 * Uses admin RPC function to bypass RLS and avoid infinite recursion
 */
export function useAssignMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AssignMembershipInput) => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, avoids recursion)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_assign_member', {
          p_organization_id: input.organizationId,
          p_user_id: input.userId,
          p_role: input.role,
        })

      if (error) throw error

      // RPC returns array, we want single object
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate organization members cache and organization detail (for member count)
      queryClient.invalidateQueries({
        queryKey: orgKeys.members(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      })
    },
  })
}
