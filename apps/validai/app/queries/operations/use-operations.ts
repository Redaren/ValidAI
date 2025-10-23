/**
 * Operation hooks for CRUD operations
 *
 * This file provides React Query hooks for managing operations within processors.
 * Following the ValidAI pattern of direct PostgREST access without API routes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CreateOperationPayload } from '@/lib/validations'

/**
 * Hook for creating a new operation
 *
 * This mutation:
 * 1. Calculates the next position in the target area
 * 2. Inserts the operation via PostgREST
 * 3. Invalidates the processor cache to refresh UI
 *
 * @example
 * ```tsx
 * const createOperation = useCreateOperation()
 *
 * const handleCreate = (data: CreateOperationInput) => {
 *   createOperation.mutate({
 *     ...data,
 *     processor_id: processorId,
 *     area: areaName,
 *   })
 * }
 * ```
 */
export function useCreateOperation() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (payload: Omit<CreateOperationPayload, 'position'>) => {
      // First, get the max position in the target area
      const { data: existingOps, error: fetchError } = await supabase
        .from('validai_operations')
        .select('position')
        .eq('processor_id', payload.processor_id)
        .eq('area', payload.area)
        .order('position', { ascending: false })
        .limit(1)

      if (fetchError) throw fetchError

      // Calculate new position (max + 1, or 1 if no operations)
      const maxPosition = existingOps?.[0]?.position || 0
      const newPosition = Number(maxPosition) + 1

      // Insert the new operation
      const { data, error } = await supabase
        .from('validai_operations')
        .insert({
          ...payload,
          position: newPosition,
          required: payload.required ?? false,
          configuration: payload.configuration ?? null,
          output_schema: payload.output_schema ?? null,
          validation_rules: payload.validation_rules ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // Invalidate processor detail to refresh operations list
      queryClient.invalidateQueries({
        queryKey: ['processor', data.processor_id],
      })
      console.log('Operation created successfully:', data)
    },
    onError: (error) => {
      console.error('Failed to create operation:', error)
    },
  })
}

/**
 * Hook for updating an operation
 *
 * @example
 * ```tsx
 * const updateOperation = useUpdateOperation()
 *
 * updateOperation.mutate({
 *   id: operationId,
 *   updates: { name: 'New Name', prompt: 'New prompt' }
 * })
 * ```
 */
export function useUpdateOperation() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates
    }: {
      id: string
      updates: Partial<Omit<CreateOperationPayload, 'processor_id'>>
    }) => {
      const { data, error } = await supabase
        .from('validai_operations')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // Invalidate processor detail to refresh operations list
      queryClient.invalidateQueries({
        queryKey: ['processor', data.processor_id],
      })
      console.log('Operation updated successfully:', data)
    },
    onError: (error) => {
      console.error('Failed to update operation:', error)
    },
  })
}

/**
 * Hook for updating operation prompt and type from workbench
 *
 * Specialized mutation for the workbench edit mode that updates
 * only the prompt and operation_type fields of an operation.
 *
 * @example
 * ```tsx
 * const updateOperationFromWorkbench = useUpdateOperationFromWorkbench()
 *
 * updateOperationFromWorkbench.mutate({
 *   id: operationId,
 *   processorId: processorId,
 *   prompt: 'New prompt text',
 *   operation_type: 'validation'
 * })
 * ```
 */
export function useUpdateOperationFromWorkbench() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      id,
      processorId,
      prompt,
      operation_type
    }: {
      id: string
      processorId: string
      prompt: string
      operation_type: string
    }) => {
      const { data, error } = await supabase
        .from('validai_operations')
        .update({
          prompt,
          operation_type
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { data, processorId }
    },
    onSuccess: ({ processorId }) => {
      // Invalidate processor detail to refresh operations list
      queryClient.invalidateQueries({
        queryKey: ['processor', processorId],
      })
      console.log('Operation updated from workbench successfully')
    },
    onError: (error) => {
      console.error('Failed to update operation from workbench:', error)
    },
  })
}

/**
 * Hook for deleting an operation
 *
 * @example
 * ```tsx
 * const deleteOperation = useDeleteOperation()
 *
 * deleteOperation.mutate({
 *   id: operationId,
 *   processorId: processorId
 * })
 * ```
 */
export function useDeleteOperation() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      id,
      processorId
    }: {
      id: string
      processorId: string
    }) => {
      const { error } = await supabase
        .from('validai_operations')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { id, processorId }
    },
    onSuccess: ({ processorId }) => {
      // Invalidate processor detail to refresh operations list
      queryClient.invalidateQueries({
        queryKey: ['processor', processorId],
      })
      console.log('Operation deleted successfully')
    },
    onError: (error) => {
      console.error('Failed to delete operation:', error)
    },
  })
}