'use client'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Database } from '@playze/shared-types'
import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import type { CreateProcessorInput } from '@/lib/validations'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

type ProcessorStatus = Database['public']['Enums']['processor_status']
type ProcessorVisibility = Database['public']['Enums']['processor_visibility']

export interface Processor {
  id: string
  name: string
  description: string | null
  usage_description: string | null
  status: ProcessorStatus
  visibility: ProcessorVisibility
  tags: string[] | null
  created_by: string
  creator_name: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  operation_count: number
  is_owner: boolean
  total_count: number // Total count for pagination (same in all rows)
}

/**
 * Hook to fetch user's processors with hybrid client/server-side pagination and search
 *
 * @param includeArchived - Whether to include archived processors
 * @param options - Pagination and search options
 * @param options.loadAll - Load all data for client-side filtering (for small datasets)
 * @returns Query result with processors, total count, and page count
 *
 * @example
 * ```tsx
 * // Server-side mode (large datasets)
 * const { data } = useUserProcessors(false, {
 *   pageSize: 10,
 *   pageIndex: 0,
 *   search: 'contract'
 * })
 *
 * // Client-side mode (small datasets)
 * const { data } = useUserProcessors(false, {
 *   loadAll: true  // Loads all data, enables client-side filtering
 * })
 *
 * // Access data
 * data?.processors // Array of processors (page or all data)
 * data?.totalCount  // Total matching processors
 * data?.pageCount   // Total number of pages
 * ```
 */
export function useUserProcessors(
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
    })
  }, [supabase])

  return useQuery({
    // Different query keys for loadAll vs paginated modes to prevent cache conflicts
    queryKey: loadAll
      ? ['user-processors', includeArchived, 'all']
      : ['user-processors', includeArchived, pageSize, pageIndex, search],
    queryFn: async () => {
      // First check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      if (loadAll) {
        // Client-side mode: Load ALL data (up to reasonable limit)
        const { data, error } = await supabase.rpc('get_user_processors', {
          p_include_archived: includeArchived,
          p_limit: 1000, // Large limit for client-side filtering
          p_offset: 0,
          p_search: undefined, // No server-side search in loadAll mode
        })

        if (error) {
          logger.error('Error fetching all processors:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          })
          throw new Error(error.message || 'Failed to fetch processors')
        }

        const processors = (data as Processor[]) || []
        const totalCount = processors.length > 0 ? Number(processors[0].total_count) : 0

        return {
          processors,
          totalCount,
          pageCount: 1, // Single page contains all data
        }
      } else {
        // Server-side mode: Load paginated data (current behavior)
        const offset = pageIndex * pageSize

        const { data, error } = await supabase.rpc('get_user_processors', {
          p_include_archived: includeArchived,
          p_limit: pageSize,
          p_offset: offset,
          p_search: search,
        })

        if (error) {
          logger.error('Error fetching processors:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          })
          throw new Error(error.message || 'Failed to fetch processors')
        }

        // Extract total count from first row (same value in all rows via window function)
        const processors = (data as Processor[]) || []
        const totalCount = processors.length > 0 ? Number(processors[0].total_count) : 0
        const pageCount = Math.ceil(totalCount / pageSize)

        return {
          processors,
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
 * Mutation hook for creating a new processor
 *
 * Uses direct PostgREST insert (no API route needed).
 * RLS policies automatically set organization_id and created_by from JWT.
 *
 * On success:
 * - Invalidates the processors list cache
 * - Navigates to the new processor detail page
 *
 * @example
 * const createProcessor = useCreateProcessor()
 *
 * const handleCreate = async (data: CreateProcessorInput) => {
 *   await createProcessor.mutateAsync(data)
 * }
 */
export function useCreateProcessor() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (input: CreateProcessorInput) => {
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
        status: 'draft' as const,
        visibility: input.visibility,
        usage_description: input.usage_description || null,
        system_prompt: input.system_prompt || null,
        tags: input.tags && input.tags.length > 0 ? input.tags : null,
        area_configuration: { areas: [] },
        organization_id: organizationId, // Required by RLS policy
        created_by: user.id, // Required by RLS policy
      }


      const { data, error } = await supabase
        .from('validai_processors')
        .insert(insertData)
        .select('id')
        .single()

      if (error) {
        logger.error('Error creating processor:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        throw new Error(error.message || 'Failed to create processor')
      }

      return data
    },
    onSuccess: (newProcessor) => {
      // Invalidate the processors list to show the new processor
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })

      // Navigate to the new processor detail page
      router.push(`/proc/${newProcessor.id}`)
    },
    onError: (error) => {
      logger.error('Create processor mutation failed:', extractErrorDetails(error))
    },
  })
}
