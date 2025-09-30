'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/database.types'

type OperationType = Database['public']['Enums']['operation_type']
type ProcessorStatus = Database['public']['Enums']['processor_status']
type ProcessorVisibility = Database['public']['Enums']['processor_visibility']

export interface Operation {
  id: string
  name: string
  description: string | null
  operation_type: OperationType
  prompt: string
  output_schema: unknown | null
  validation_rules: unknown | null
  area: string
  position: number
  required: boolean
  configuration: unknown | null
  created_at: string
  updated_at: string
}

export interface ProcessorDetail {
  processor_id: string
  processor_name: string
  processor_description: string | null
  usage_description: string | null
  status: ProcessorStatus
  visibility: ProcessorVisibility
  system_prompt: string | null
  area_configuration: {
    areas?: Array<{
      name: string
      display_order: number
    }>
  } | null
  configuration: unknown | null
  tags: string[] | null
  created_by: string
  created_by_name: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  operations: Operation[]
}

export function useProcessorDetail(processorId: string, options?: { enabled?: boolean }) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['processor', processorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_processor_with_operations', {
        p_processor_id: processorId,
      })

      if (error) {
        console.error('Error fetching processor:', error)
        throw new Error(error.message || 'Failed to fetch processor')
      }

      if (!data || data.length === 0) {
        throw new Error('Processor not found')
      }

      // The RPC returns an array with single result
      const processor = data[0] as ProcessorDetail

      return processor
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: options?.enabled !== false && !!processorId,
  })
}

export function useUpdateOperationPosition() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      operationId,
      processorId,
      newArea,
      newPosition,
    }: {
      operationId: string
      processorId: string
      newArea: string
      newPosition: number
    }) => {
      const { error } = await supabase
        .from('operations')
        .update({
          area: newArea,
          position: newPosition,
          updated_at: new Date().toISOString(),
        })
        .eq('id', operationId)

      if (error) throw error
    },
    onMutate: async ({ processorId, operationId, newArea, newPosition }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['processor', processorId] })

      // Snapshot the previous value
      const previousProcessor = queryClient.getQueryData<ProcessorDetail>([
        'processor',
        processorId,
      ])

      // Optimistically update
      if (previousProcessor) {
        queryClient.setQueryData<ProcessorDetail>(['processor', processorId], {
          ...previousProcessor,
          operations: previousProcessor.operations.map((op) =>
            op.id === operationId
              ? { ...op, area: newArea, position: newPosition }
              : op
          ),
        })
      }

      return { previousProcessor }
    },
    onError: (err, { processorId }, context) => {
      // Rollback on error
      if (context?.previousProcessor) {
        queryClient.setQueryData(
          ['processor', processorId],
          context.previousProcessor
        )
      }
    },
    onSettled: (_, __, { processorId }) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['processor', processorId] })
    },
  })
}

export function useUpdateAreaConfiguration() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      areaConfiguration,
    }: {
      processorId: string
      areaConfiguration: {
        areas: Array<{
          name: string
          display_order: number
        }>
      }
    }) => {
      const { error } = await supabase
        .from('processors')
        .update({
          area_configuration: areaConfiguration,
          updated_at: new Date().toISOString(),
        })
        .eq('id', processorId)

      if (error) throw error
    },
    onSuccess: (_, { processorId }) => {
      queryClient.invalidateQueries({ queryKey: ['processor', processorId] })
    },
  })
}