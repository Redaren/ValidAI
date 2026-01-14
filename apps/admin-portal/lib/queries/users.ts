import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import type {
  UserSearchInput,
  UpdateUserProfileInput,
  UpdateUserPreferencesInput,
  UpdateUserMembershipRoleInput,
  RemoveUserMembershipInput,
  AssignUserToOrganizationInput,
  ToggleUserMembershipActiveInput,
  CreateUserInput,
} from '@/lib/validations'

/**
 * Query keys factory for users
 * Provides hierarchical query key structure for TanStack Query caching
 */
export const userKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters?: UserSearchInput) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  memberships: (id: string) => [...userKeys.detail(id), 'memberships'] as const,
  preferences: (id: string) => [...userKeys.detail(id), 'preferences'] as const,
}

/**
 * User list result with pagination metadata
 */
interface UserWithCount {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
  organization_count: number
}

interface UsersListResult {
  users: UserWithCount[]
  totalCount: number
}

/**
 * Hook: List users with server-side search and pagination
 * Returns profiles with organization count and total count for pagination
 * Uses admin RPC function to bypass RLS and access ALL users
 *
 * @param filters - Optional search and pagination filters
 * @returns Query result with user list and total count
 */
export function useUsers(filters?: UserSearchInput) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: async (): Promise<UsersListResult> => {
      const supabase = createBrowserClient()

      // Call admin function with server-side search and pagination
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_users_paginated', {
        p_search: filters?.search || null,
        p_limit: filters?.limit || 10,
        p_offset: filters?.offset || 0,
      })

      if (error) throw error

      // Extract totalCount from first row (all rows have same total_count)
      const totalCount = data?.[0]?.total_count ?? 0

      // Map to remove total_count from each row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
      const users = (data || []).map(({ total_count: _, ...user }: any) => user)

      return { users, totalCount }
    },
    // Keep previous data while fetching new page (prevents flicker)
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook: Get user details
 * Returns profile with metadata
 * Uses admin RPC function to bypass RLS and access ANY user
 *
 * @param id - User ID
 * @returns Query result with user details
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, can access ANY user)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_get_user', {
        p_user_id: id
      })

      if (error) throw error

      // RPC returns array, get first result
      return data?.[0] || null
    },
    enabled: !!id,
  })
}

/**
 * Hook: Get user's organization memberships
 * Returns list of organizations with roles
 * Uses admin RPC function to bypass RLS and view ALL memberships for ANY user
 *
 * @param userId - User ID
 * @returns Query result with organization memberships
 */
export function useUserMemberships(userId: string) {
  return useQuery({
    queryKey: userKeys.memberships(userId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, can see memberships for ANY user)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_user_memberships', {
        p_user_id: userId
      })

      if (error) throw error

      // Admin function returns flattened structure directly
      return data || []
    },
    enabled: !!userId,
  })
}

/**
 * Hook: Get user preferences
 * Returns shared preferences (theme, language, etc.)
 * Uses admin RPC function to bypass RLS (user_id = auth.uid() check) and view ANY user's preferences
 *
 * @param userId - User ID
 * @returns Query result with user preferences
 */
export function useUserPreferences(userId: string) {
  return useQuery({
    queryKey: userKeys.preferences(userId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses user_id = auth.uid() RLS restriction)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_get_user_preferences', {
        p_user_id: userId
      })

      if (error) throw error

      // RPC returns array, get first result (or null if no preferences)
      return data?.[0] || null
    },
    enabled: !!userId,
  })
}

/**
 * Hook: Update user profile
 * Updates full_name and/or avatar_url
 * Uses admin RPC function to bypass RLS
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateUserProfileInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_update_user_profile', {
        p_user_id: input.userId,
        p_full_name: input.fullName,
        p_avatar_url: input.avatarUrl,
      })

      if (error) {
        console.error('admin_update_user_profile error:', JSON.stringify(error, null, 2))
        throw new Error(error.message || error.details || error.hint || 'Failed to update profile')
      }
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate user detail and list queries
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) })
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
  })
}

/**
 * Hook: Update user preferences
 * Updates theme, language, and/or email_notifications
 * Uses admin RPC function to bypass RLS
 */
export function useUpdateUserPreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateUserPreferencesInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_update_user_preferences', {
        p_user_id: input.userId,
        p_theme: input.theme,
        p_language: input.language,
        p_email_notifications: input.emailNotifications,
      })

      if (error) {
        console.error('admin_update_user_preferences error:', JSON.stringify(error, null, 2))
        throw new Error(error.message || error.details || error.hint || 'Failed to update preferences')
      }
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate preferences query
      queryClient.invalidateQueries({ queryKey: userKeys.preferences(variables.userId) })
    },
  })
}

/**
 * Hook: Update user membership role
 * Changes a user's role in an organization
 * Uses admin RPC function to bypass RLS
 */
export function useUpdateUserMembershipRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateUserMembershipRoleInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_update_user_membership_role', {
        p_user_id: input.userId,
        p_organization_id: input.organizationId,
        p_role: input.role,
      })

      if (error) throw error
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate user memberships query
      queryClient.invalidateQueries({ queryKey: userKeys.memberships(variables.userId) })
    },
  })
}

/**
 * Hook: Remove user from organization
 * Removes a user's membership from an organization
 * Uses admin RPC function to bypass RLS
 */
export function useRemoveUserMembership() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RemoveUserMembershipInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_remove_user_membership', {
        p_user_id: input.userId,
        p_organization_id: input.organizationId,
      })

      if (error) throw error
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate user memberships and detail queries
      queryClient.invalidateQueries({ queryKey: userKeys.memberships(variables.userId) })
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) })
    },
  })
}

/**
 * Hook: Assign user to organization
 * Adds a user to an organization with a specified role
 * Reuses the existing admin_assign_member function
 */
export function useAssignUserToOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AssignUserToOrganizationInput) => {
      const supabase = createBrowserClient()

      // Reuse existing admin_assign_member function (org-centric)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_assign_member', {
        p_organization_id: input.organizationId,
        p_user_id: input.userId,
        p_role: input.role,
      })

      if (error) throw error
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate user memberships and detail queries
      queryClient.invalidateQueries({ queryKey: userKeys.memberships(variables.userId) })
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) })
    },
  })
}

/**
 * Hook: Toggle user membership active status
 * Activates or deactivates a user's membership in an organization
 * Uses admin RPC function to bypass RLS
 */
export function useToggleUserMembershipActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ToggleUserMembershipActiveInput) => {
      const supabase = createBrowserClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_toggle_user_membership_active', {
        p_user_id: input.userId,
        p_organization_id: input.organizationId,
        p_is_active: input.isActive,
      })

      if (error) {
        console.error('admin_toggle_user_membership_active error:', JSON.stringify(error, null, 2))
        throw new Error(error.message || error.details || error.hint || 'Failed to toggle membership status')
      }
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate user memberships query to refresh the list
      queryClient.invalidateQueries({ queryKey: userKeys.memberships(variables.userId) })
    },
  })
}

/**
 * Hook: Delete user permanently
 * Hard deletes a user from the platform via Edge Function
 * Uses Supabase Admin API to delete from auth.users (cascades to profiles, memberships, etc.)
 *
 * Safety: Blocks deletion if user is sole owner of any organization
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      })

      if (error) {
        // For FunctionsHttpError (4xx/5xx), the response body is in error.context
        // Try to extract the JSON error message from the response
        let errorMessage = 'Failed to delete user'
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorBody = await (error as any).context?.json()
          if (errorBody?.error) {
            errorMessage = errorBody.error
          }
        } catch {
          // If we can't parse the error body, use the default message
          if (error.message) {
            errorMessage = error.message
          }
        }
        throw new Error(errorMessage)
      }

      // Edge function returns { success: boolean, data?: {...}, error?: string }
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete user')
      }

      return data.data
    },
    onSuccess: () => {
      // Invalidate all user queries since we've deleted a user
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

/**
 * Hook: Create user
 * Creates a new user via Edge Function (create-user)
 * Uses Supabase Admin API to create user in auth.users
 *
 * Two modes:
 * - With password: Direct creation, user can login immediately
 * - Without password: Sends invitation email, user sets own password
 */
export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: input
      })

      if (error) {
        let errorMessage = 'Failed to create user'
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorBody = await (error as any).context?.json()
          if (errorBody?.error) {
            errorMessage = errorBody.error
          }
        } catch {
          if (error.message) {
            errorMessage = error.message
          }
        }
        throw new Error(errorMessage)
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to create user')
      }

      return data.data
    },
    onSuccess: () => {
      // Invalidate user list to show newly created user
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}
