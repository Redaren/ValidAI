import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import type { UserSearchInput } from '@/lib/validations'

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
 * Hook: List all users
 * Returns profiles with organization count
 * Uses admin RPC function to bypass RLS and access ALL users
 *
 * @param filters - Optional search and pagination filters
 * @returns Query result with user list
 */
export function useUsers(filters?: UserSearchInput) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, returns ALL users)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_list_all_users')

      if (error) throw error

      // Apply client-side filtering
      let filtered = data || []

      if (filters?.search) {
        const search = filters.search.toLowerCase()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((user: any) =>
          user.full_name?.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search)
        )
      }

      // Apply pagination
      if (filters?.limit) {
        const offset = filters.offset || 0
        filtered = filtered.slice(offset, offset + filters.limit)
      }

      return filtered
    },
    enabled: true,
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
        user_id: id
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
        user_id: userId
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
        user_id: userId
      })

      if (error) throw error

      // RPC returns array, get first result (or null if no preferences)
      return data?.[0] || null
    },
    enabled: !!userId,
  })
}
