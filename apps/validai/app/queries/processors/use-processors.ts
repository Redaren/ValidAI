'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Database } from '@playze/shared-types'
import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import type { CreateProcessorInput } from '@/lib/validations'

type ProcessorStatus = Database['public']['Enums']['processor_status']
type ProcessorVisibility = Database['public']['Enums']['processor_visibility']

export interface Processor {
  processor_id: string
  processor_name: string
  processor_description: string | null
  document_type: string | null
  status: ProcessorStatus
  visibility: ProcessorVisibility
  tags: string[] | null
  created_by: string
  created_by_name: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  operation_count: number
  is_owner: boolean
}

export function useUserProcessors(includeArchived: boolean = false) {
  const supabase = createBrowserClient()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check if user is authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
      if (session) {
        console.log('User authenticated, organization_id:',
          session.user?.app_metadata?.organization_id)
      }
    })
  }, [supabase])

  return useQuery({
    queryKey: ['user-processors', includeArchived],
    queryFn: async () => {
      // First check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('Not authenticated')
      }

      // Log the current user context
      console.log('Fetching processors for user:', session.user.id)
      console.log('Organization ID:', session.user.app_metadata?.organization_id)

      const { data, error } = await supabase.rpc('get_user_processors', {
        p_include_archived: includeArchived
      })

      if (error) {
        console.error('Error fetching processors:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw new Error(error.message || 'Failed to fetch processors')
      }

      console.log('Processors fetched:', data?.length || 0)

      // The RPC function returns data in the correct format already
      return data as Processor[]
    },
    enabled: isAuthenticated, // Only run query when authenticated
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

      console.log('Creating processor with input:', input)
      console.log('User ID:', user.id)
      console.log('Organization ID:', organizationId)

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

      console.log('Insert data:', insertData)

      const { data, error } = await supabase
        .from('validai_processors')
        .insert(insertData)
        .select('id')
        .single()

      if (error) {
        console.error('Error creating processor:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        throw new Error(error.message || 'Failed to create processor')
      }

      console.log('Processor created successfully:', data)
      return data
    },
    onSuccess: (newProcessor) => {
      // Invalidate the processors list to show the new processor
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })

      // Navigate to the new processor detail page
      router.push(`/proc/${newProcessor.id}`)
    },
    onError: (error) => {
      console.error('Create processor mutation failed:', error)
    },
  })
}