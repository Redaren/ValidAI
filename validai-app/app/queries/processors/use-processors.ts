'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/database.types'
import { useEffect, useState } from 'react'

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
  const supabase = createClient()
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