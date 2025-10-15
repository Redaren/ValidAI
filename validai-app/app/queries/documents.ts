/**
 * TanStack Query hooks for documents
 *
 * @module app/queries/documents
 * @description
 * Provides React Query hooks for fetching and uploading documents.
 *
 * @since Phase 1.8
 */

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTypedBrowserClient } from '@/lib/supabase/typed-clients'
import type { Database } from '@/lib/database.types'
import { validateDocumentFile } from '@/lib/constants/documents'

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
  const supabase = createTypedBrowserClient()

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

/**
 * Hook to upload a document to Supabase Storage and create database record
 *
 * @returns Mutation hook with document upload functionality
 *
 * @example
 * ```tsx
 * const uploadDocument = useUploadDocument()
 *
 * const handleFile = async (file: File) => {
 *   const document = await uploadDocument.mutateAsync(file)
 *   console.log('Uploaded:', document.id)
 * }
 * ```
 */
export function useUploadDocument() {
  const supabase = createTypedBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      // 1. Validate file client-side
      const validation = validateDocumentFile(file)
      if (!validation.valid) {
        throw new Error(validation.error)
      }

      // 2. Get current user and organization from session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) throw sessionError
      if (!session?.user) throw new Error('Not authenticated')

      const organizationId =
        session.user.app_metadata?.organization_id as string
      if (!organizationId) throw new Error('No organization found')

      // 3. Generate unique file path: {org_id}/{uuid}-{filename}
      const fileId = crypto.randomUUID()
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const storagePath = `${organizationId}/${fileId}-${sanitizedFilename}`

      // 4. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false, // Don't overwrite existing files
        })

      if (uploadError) throw uploadError

      // 5. Create document record in database
      const { data: document, error: insertError } = await supabase
        .from('documents')
        .insert({
          organization_id: organizationId,
          name: file.name,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          storage_path: storagePath,
          uploaded_by: session.user.id,
        })
        .select()
        .single()

      if (insertError) {
        // Cleanup: Delete uploaded file if database insert fails
        await supabase.storage.from('documents').remove([storagePath])
        throw insertError
      }

      return document as Document
    },
    onSuccess: () => {
      // Invalidate documents query to refresh list
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}
