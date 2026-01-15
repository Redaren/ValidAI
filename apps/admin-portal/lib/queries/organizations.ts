import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js'
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  AssignSubscriptionInput,
  AssignMembershipInput,
  InviteMemberInput,
  UpdateInvitationRoleInput,
  OrganizationSearchInput,
} from '@/lib/validations'

/**
 * Query keys factory for organizations
 * Hierarchical structure for efficient cache invalidation
 */
export const orgKeys = {
  all: ['admin', 'organizations'] as const,
  lists: () => [...orgKeys.all, 'list'] as const,
  list: (filters?: OrganizationSearchInput) => [...orgKeys.lists(), filters] as const,
  details: () => [...orgKeys.all, 'detail'] as const,
  detail: (id: string) => [...orgKeys.details(), id] as const,
  members: (id: string) => [...orgKeys.detail(id), 'members'] as const,
  membersAndInvitations: (id: string) => [...orgKeys.detail(id), 'members-invitations'] as const,
  subscriptions: (id: string) => [...orgKeys.detail(id), 'subscriptions'] as const,
  invitations: (id: string) => [...orgKeys.detail(id), 'invitations'] as const,
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
 * Organization list result with pagination metadata
 */
interface OrganizationWithCount {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  member_count: number
}

interface OrganizationsListResult {
  organizations: OrganizationWithCount[]
  totalCount: number
}

/**
 * Hook: List organizations with server-side search and pagination
 * Returns organizations with member count and total count for pagination
 * Uses admin RPC function to bypass RLS and access ALL organizations
 *
 * @param filters - Optional search and pagination filters
 * @returns Query result with organization list and total count
 */
export function useOrganizationsPaginated(filters?: OrganizationSearchInput) {
  return useQuery({
    queryKey: orgKeys.list(filters),
    queryFn: async (): Promise<OrganizationsListResult> => {
      const supabase = createBrowserClient()

      // Call admin function with server-side search and pagination
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_organizations_paginated', {
        p_search: filters?.search || null,
        p_limit: filters?.limit || 10,
        p_offset: filters?.offset || 0,
      })

      if (error) throw error

      // Extract totalCount from first row (all rows have same total_count)
      const totalCount = data?.[0]?.total_count ?? 0

      // Map to remove total_count from each row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
      const organizations = (data || []).map(({ total_count: _, ...org }: any) => org)

      return { organizations, totalCount }
    },
    // Keep previous data while fetching new page (prevents flicker)
    placeholderData: (previousData) => previousData,
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
          default_app_id: input.default_app_id || null,
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
 * Supports all extended organization fields
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
          // Extended fields
          org_org_number: input.org_number || null,
          org_vat_number: input.vat_number || null,
          org_street_address: input.street_address || null,
          org_postal_code: input.postal_code || null,
          org_city: input.city || null,
          org_country: input.country || null,
          org_contact_person: input.contact_person || null,
          org_contact_role: input.contact_role || null,
          org_contact_email: input.contact_email || null,
          org_contact_phone: input.contact_phone || null,
          org_referral: input.referral || null,
          org_lead_source: input.lead_source || null,
          org_kam: input.kam || null,
          // Default app for invitation redirects
          org_default_app_id: input.default_app_id || null,
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

// =====================================================
// INVITATION HOOKS
// =====================================================

/**
 * Type for combined member/invitation entry from unified query
 */
export interface MemberOrInvitation {
  id: string
  entry_type: 'member' | 'invitation'
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  status: string
  joined_at: string | null
  invited_at: string | null
  expires_at: string | null
  invited_by_name: string | null
  member_is_active: boolean | null  // Actual membership active status (null for invitations)
}

/**
 * Hook: Get combined members and invitations
 * Uses admin RPC function that returns unified list for display
 */
export function useOrganizationMembersAndInvitations(organizationId: string) {
  return useQuery({
    queryKey: orgKeys.membersAndInvitations(organizationId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin RPC function (bypasses RLS, returns unified list)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_get_members_and_invitations', { p_org_id: organizationId })

      if (error) throw error

      return (data || []) as MemberOrInvitation[]
    },
    enabled: !!organizationId,
  })
}

/**
 * Hook: Invite member to organization
 * Uses Edge Function to send magic link via Supabase Auth
 */
export function useInviteMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: InviteMemberInput) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke('invite-member', {
        body: {
          organizationId: input.organizationId,
          email: input.email,
          role: input.role,
        },
      })

      // Handle Edge Function errors
      if (error) {
        let errorMessage = 'Failed to invite member'

        if (error instanceof FunctionsHttpError) {
          try {
            const errorBody = await error.context.json()
            errorMessage = errorBody.error || errorMessage
          } catch {
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

      // Check for success in response
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to invite member')
      }

      return data?.data
    },
    onSuccess: (_, variables) => {
      // Invalidate members/invitations cache
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      })
    },
  })
}

/**
 * Hook: Cancel pending invitation
 * Uses Edge Function to cancel invitation AND clean up orphaned user records
 *
 * When inviteUserByEmail() is called, Supabase creates a user record even before
 * the user clicks the magic link. If the invitation is cancelled, this Edge Function
 * cleans up the orphaned user record to allow proper re-invitation.
 */
export function useCancelInvitation() {
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
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(variables.organizationId),
      })
    },
  })
}

/**
 * Hook: Update invitation role
 * Uses admin RPC function to change role before acceptance
 */
export function useUpdateInvitationRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateInvitationRoleInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('admin_update_invitation_role', {
          p_invitation_id: input.invitationId,
          p_new_role: input.role,
        })

      if (error) throw error

      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(variables.organizationId),
      })
    },
  })
}

/**
 * Custom error class for resend invitation failures that includes invitation URL
 * This allows the UI to offer a "copy link" fallback when email sending fails
 */
export class ResendInvitationError extends Error {
  invitationUrl?: string

  constructor(message: string, invitationUrl?: string) {
    super(message)
    this.name = 'ResendInvitationError'
    this.invitationUrl = invitationUrl
  }
}

/**
 * Hook: Resend invitation
 * Uses Edge Function to reset expiry and send new magic link
 *
 * When email sending fails (e.g., user already exists with confirmed email),
 * the error will include an invitationUrl that can be copied for manual sharing.
 */
export function useResendInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    // organizationId is used in onSuccess for cache invalidation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mutationFn: async ({ invitationId, organizationId }: { invitationId: string; organizationId: string }) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke('resend-invitation', {
        body: { invitationId },
      })

      // Handle Edge Function errors (network errors, function crashes, etc.)
      if (error) {
        let errorMessage = 'Failed to resend invitation'
        let invitationUrl: string | undefined

        if (error instanceof FunctionsHttpError) {
          try {
            const errorBody = await error.context.json()
            errorMessage = errorBody.error || errorMessage
            // Extract invitationUrl from error response for manual sharing fallback
            invitationUrl = errorBody.invitationUrl
          } catch {
            errorMessage = 'Edge Function returned an error'
          }
        } else {
          errorMessage = error.message || errorMessage
        }

        throw new ResendInvitationError(errorMessage, invitationUrl)
      }

      // Handle success=false in response body (Edge Function returned 200 but with error)
      if (data && !data.success) {
        throw new ResendInvitationError(
          data.error || 'Failed to resend invitation',
          data.invitationUrl
        )
      }

      return data?.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(variables.organizationId),
      })
    },
  })
}

// =====================================================
// MEMBER MANAGEMENT HOOKS
// =====================================================

/**
 * Hook: Toggle member active status
 * Activates or deactivates a member's membership in an organization
 * Reuses existing admin_toggle_user_membership_active function
 */
export function useToggleMemberActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      organizationId,
      userId,
      isActive,
    }: {
      organizationId: string
      userId: string
      isActive: boolean
    }) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_toggle_user_membership_active', {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_is_active: isActive,
      })

      if (error) {
        console.error('admin_toggle_user_membership_active error:', JSON.stringify(error, null, 2))
        throw new Error(error.message || error.details || error.hint || 'Failed to toggle membership status')
      }
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      })
    },
  })
}

/**
 * Hook: Update member role
 * Changes a member's role in an organization
 * Reuses existing admin_update_user_membership_role function
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      organizationId,
      userId,
      role,
    }: {
      organizationId: string
      userId: string
      role: 'owner' | 'admin' | 'member' | 'viewer'
    }) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_update_user_membership_role', {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_role: role,
      })

      if (error) throw error
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      })
    },
  })
}

/**
 * Hook: Remove member from organization
 * Removes a member's membership from an organization
 * Reuses existing admin_remove_user_membership function
 */
export function useRemoveMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      organizationId,
      userId,
    }: {
      organizationId: string
      userId: string
    }) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_remove_user_membership', {
        p_user_id: userId,
        p_organization_id: organizationId,
      })

      if (error) throw error
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.membersAndInvitations(variables.organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      })
    },
  })
}
