/**
 * TanStack Query hooks for documents
 *
 * @module app/queries/documents
 * @description
 * Provides React Query hooks for fetching documents from the database.
 *
 * @since Phase 1.8
 */

'use client'

import { useQuery } from '@tanstack/react-query'
import { createTypedClient } from '@/lib/supabase/typed-clients'
import type { Database } from '@/lib/database.types'

type Document = Database['public']['Tables']['documents']['Row']

/**
 * Hook to fetch all documents for the current organization
 *
 * @returns Query hook with documents array
 *
 * @example
 * ```tsx
 * const { data: documents } = useDocuments()
 *
 * documents?.map(doc => (
 *   <div key={doc.id}>{doc.name}</div>
 * ))
 * ```
 */
export function useDocuments() {
  const supabase = createTypedClient()

  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Document[]
    },
  })
}
