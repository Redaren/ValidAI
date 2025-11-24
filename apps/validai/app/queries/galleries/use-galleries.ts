'use client'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Database } from '@playze/shared-types'
import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import type { CreateGalleryInput } from '@/lib/validations'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import type { Session } from '@supabase/supabase-js'

type GalleryStatus = Database['public']['Enums']['gallery_status']
type GalleryVisibility = Database['public']['Enums']['gallery_visibility']

export interface Gallery {
  id: string
  name: string
  description: string | null
  icon: string | null
  status: GalleryStatus
  visibility: GalleryVisibility
  tags: string[] | null
  created_by: string
  creator_name: string | null
  created_at: string
  updated_at: string
  area_count: number
  processor_count: number
  is_owner: boolean
}

/**
 * Hook to fetch user's galleries with pagination and search
 *
 * @param includeArchived - Whether to include archived galleries
 * @param options - Pagination and search options
 * @param options.loadAll - Load all data for client-side filtering (for small datasets)
 * @returns Query result with galleries, total count, and page count
 *
 * @example
 * ```tsx
 * // Server-side mode (large datasets)
 * const { data } = useUserGalleries(false, {
 *   pageSize: 10,
 *   pageIndex: 0,
 *   search: 'compliance'
 * })
 *
 * // Client-side mode (small datasets)
 * const { data } = useUserGalleries(false, {
 *   loadAll: true  // Loads all data, enables client-side filtering
 * })
 *
 * // Access data
 * data?.galleries // Array of galleries (page or all data)
 * data?.totalCount  // Total matching galleries
 * data?.pageCount   // Total number of pages
 * ```
 */
export function useUserGalleries(
  includeArchived: boolean = false,
  options?: {
    pageSize?: number
    pageIndex?: number
    search?: string
    loadAll?: boolean
  }
) {
  const supabase = createBrowserClient()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const pageSize = options?.pageSize ?? 10
  const pageIndex = options?.pageIndex ?? 0
  const search = options?.search
  const loadAll = options?.loadAll ?? false

  useEffect(() => {
    // Check if user is authenticated
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setIsAuthenticated(!!session)
    })
  }, [supabase])

  return useQuery({
    // Different query keys for loadAll vs paginated modes to prevent cache conflicts
    queryKey: loadAll
      ? ['user-galleries', includeArchived, 'all']
      : ['user-galleries', includeArchived, pageSize, pageIndex, search],
    queryFn: async () => {
      // First check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      if (loadAll) {
        // Client-side mode: Load ALL data (up to reasonable limit)
        const { data, error } = await supabase.rpc('get_user_galleries', {
          p_include_archived: includeArchived,
          p_limit: 1000, // Large limit for client-side filtering
          p_offset: 0,
          p_search: undefined, // No server-side search in loadAll mode
        })

        if (error) {
          logger.error('Error fetching all galleries:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          })
          throw new Error(error.message || 'Failed to fetch galleries')
        }

        const galleries = (data as Gallery[]) || []

        // Get total count via separate RPC call
        const { data: countData, error: countError } = await supabase.rpc('get_user_galleries_count', {
          p_include_archived: includeArchived,
          p_search: undefined,
        })

        if (countError) {
          logger.error('Error fetching galleries count:', {
            message: countError.message,
            details: countError.details,
          })
        }

        const totalCount = typeof countData === 'number' ? countData : galleries.length

        return {
          galleries,
          totalCount,
          pageCount: 1, // Single page contains all data
        }
      } else {
        // Server-side mode: Load paginated data
        const offset = pageIndex * pageSize

        const { data, error } = await supabase.rpc('get_user_galleries', {
          p_include_archived: includeArchived,
          p_limit: pageSize,
          p_offset: offset,
          p_search: search,
        })

        if (error) {
          logger.error('Error fetching galleries:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          })
          throw new Error(error.message || 'Failed to fetch galleries')
        }

        const galleries = (data as Gallery[]) || []

        // Get total count via separate RPC call
        const { data: countData, error: countError } = await supabase.rpc('get_user_galleries_count', {
          p_include_archived: includeArchived,
          p_search: search,
        })

        if (countError) {
          logger.error('Error fetching galleries count:', {
            message: countError.message,
            details: countError.details,
          })
        }

        const totalCount = typeof countData === 'number' ? countData : 0
        const pageCount = Math.ceil(totalCount / pageSize)

        return {
          galleries,
          totalCount,
          pageCount,
        }
      }
    },
    enabled: isAuthenticated, // Only run query when authenticated
    placeholderData: keepPreviousData, // Keep previous data while fetching new data (prevents isLoading on refetch)
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  })
}

/**
 * Mutation hook for creating a new gallery
 *
 * Uses direct PostgREST insert (no API route needed).
 * RLS policies automatically set organization_id and created_by from JWT.
 *
 * On success:
 * - Invalidates the galleries list cache
 * - Navigates to the new gallery detail page
 *
 * @example
 * const createGallery = useCreateGallery()
 *
 * const handleCreate = async (data: CreateGalleryInput) => {
 *   await createGallery.mutateAsync(data)
 * }
 */
export function useCreateGallery() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (input: CreateGalleryInput) => {
      // Get current user and organization from session
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('Not authenticated')
      }

      const organizationId = user.app_metadata?.organization_id
      if (!organizationId) {
        throw new Error('No organization found for user')
      }

      const insertData = {
        name: input.name,
        description: input.description || null,
        icon: input.icon || null,
        status: input.status || ('draft' as const),
        visibility: input.visibility,
        tags: input.tags && input.tags.length > 0 ? input.tags : null,
        organization_id: organizationId, // Required by RLS policy
        created_by: user.id, // Required by RLS policy
      }

      const { data, error } = await supabase
        .from('validai_galleries')
        .insert(insertData)
        .select('id')
        .single()

      if (error) {
        logger.error('Error creating gallery:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        throw new Error(error.message || 'Failed to create gallery')
      }

      return data
    },
    onSuccess: (newGallery) => {
      // Invalidate the galleries list to show the new gallery
      queryClient.invalidateQueries({ queryKey: ['user-galleries'] })

      // Navigate to the new gallery detail page
      router.push(`/gallery/${newGallery.id}`)
    },
    onError: (error) => {
      logger.error('Create gallery mutation failed:', extractErrorDetails(error))
    },
  })
}
