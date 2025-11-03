'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Database, Json } from '@playze/shared-types'
import { transformProcessorData } from '@/lib/transform-processor-data'

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
  const supabase = createBrowserClient()

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

      // Transform flat rows to nested structure using shared utility
      return transformProcessorData(data as any)
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: options?.enabled !== false && !!processorId,
  })
}

export function useUpdateOperationPosition() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

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
        .from('validai_operations')
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
  const supabase = createBrowserClient()

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
        .from('validai_processors')
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

export function useRenameArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      oldName,
      newName,
    }: {
      processorId: string
      oldName: string
      newName: string
    }) => {
      // Use a database function to atomically rename the area in both
      // area_configuration and all related operations
      const { error } = await supabase.rpc('rename_processor_area', {
        p_processor_id: processorId,
        p_old_name: oldName,
        p_new_name: newName,
      })

      if (error) throw error
    },
    onSuccess: (_, { processorId }) => {
      queryClient.invalidateQueries({ queryKey: ['processor', processorId] })
    },
  })
}

export function useCreateArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      areaName,
    }: {
      processorId: string
      areaName: string
    }) => {
      // Get current processor to access area_configuration
      const { data: processor, error: fetchError } = await supabase
        .from('validai_processors')
        .select('area_configuration')
        .eq('id', processorId)
        .single()

      if (fetchError) throw fetchError

      const areaConfig = processor?.area_configuration as ProcessorDetail['area_configuration']
      const currentAreas = areaConfig?.areas || []

      // Check if area already exists
      if (currentAreas.some((area: { name: string }) => area.name === areaName)) {
        throw new Error(`Area "${areaName}" already exists`)
      }

      // Calculate next display_order
      const maxOrder = currentAreas.reduce(
        (max: number, area: { display_order: number }) =>
          Math.max(max, area.display_order),
        0
      )

      // Add new area
      const updatedAreas = [
        ...currentAreas,
        {
          name: areaName,
          display_order: maxOrder + 1,
        },
      ]

      // Update processor
      const { error: updateError } = await supabase
        .from('validai_processors')
        .update({
          area_configuration: { areas: updatedAreas },
          updated_at: new Date().toISOString(),
        })
        .eq('id', processorId)

      if (updateError) throw updateError
    },
    onSuccess: (_, { processorId }) => {
      queryClient.invalidateQueries({ queryKey: ['processor', processorId] })
    },
  })
}

export function useDeleteArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      areaName,
      targetArea,
    }: {
      processorId: string
      areaName: string
      targetArea?: string
    }) => {
      // Use database function for atomic delete with optional move
      const { error } = await supabase.rpc('delete_processor_area', {
        p_processor_id: processorId,
        p_area_name: areaName,
        p_target_area: targetArea || undefined,
      })

      if (error) throw error
    },
    onSuccess: (_, { processorId }) => {
      queryClient.invalidateQueries({ queryKey: ['processor', processorId] })
    },
  })
}

export function useUpdateProcessorSettings() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      systemPrompt,
    }: {
      processorId: string
      systemPrompt?: string
    }) => {
      const { error } = await supabase
        .from('validai_processors')
        .update({
          system_prompt: systemPrompt || null,
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

export function useUpdateProcessor() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      name,
      description,
      usage_description,
      visibility,
      system_prompt,
      tags,
      default_run_view,
    }: {
      processorId: string
      name?: string
      description?: string | null
      usage_description?: string | null
      visibility?: 'personal' | 'organization'
      system_prompt?: string | null
      tags?: string[] | null
      default_run_view?: 'technical' | 'compliance' | 'contract-comments'
    }) => {
      // Only fetch and update configuration if default_run_view is provided
      let updatedConfig: Json | undefined = undefined
      if (default_run_view !== undefined) {
        const { data: current } = await supabase
          .from('validai_processors')
          .select('configuration')
          .eq('id', processorId)
          .single()

        if (!current) throw new Error('Processor not found')

        // Properly merge: preserve ALL existing fields, only update default_run_view
        updatedConfig = {
          ...(current.configuration as Record<string, unknown> || {}),
          default_run_view,
        } as Json
      }

      // Build update object with only provided fields
      const updates: {
        name?: string
        description?: string | null
        usage_description?: string | null
        visibility?: 'personal' | 'organization'
        system_prompt?: string | null
        tags?: string[] | null
        configuration?: Json
        updated_at: string
      } = {
        updated_at: new Date().toISOString(),
      }

      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description
      if (usage_description !== undefined) updates.usage_description = usage_description
      if (visibility !== undefined) updates.visibility = visibility
      if (system_prompt !== undefined) updates.system_prompt = system_prompt
      if (tags !== undefined) updates.tags = tags
      // Only update configuration if it was explicitly modified
      if (updatedConfig !== undefined) updates.configuration = updatedConfig

      const { error } = await supabase
        .from('validai_processors')
        .update(updates)
        .eq('id', processorId)

      if (error) throw error
    },
    onMutate: async ({ processorId, name, description, visibility, default_run_view }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['processor', processorId] })

      // Snapshot previous value
      const previousProcessor = queryClient.getQueryData<ProcessorDetail>([
        'processor',
        processorId,
      ])

      // Optimistically update
      if (previousProcessor) {
        queryClient.setQueryData<ProcessorDetail>(['processor', processorId], {
          ...previousProcessor,
          ...(name !== undefined ? { processor_name: name } : {}),
          ...(description !== undefined ? { processor_description: description } : {}),
          ...(visibility !== undefined ? { visibility } : {}),
          ...(default_run_view !== undefined
            ? {
                configuration: {
                  ...(previousProcessor.configuration || {}),
                  default_run_view,
                },
              }
            : {}),
        })
      }

      return { previousProcessor }
    },
    onError: (err, { processorId }, context) => {
      // Rollback on error
      if (context?.previousProcessor) {
        queryClient.setQueryData(['processor', processorId], context.previousProcessor)
      }
    },
    onSuccess: (_, { processorId }) => {
      queryClient.invalidateQueries({ queryKey: ['processor', processorId] })
      queryClient.invalidateQueries({ queryKey: ['processors'] }) // Refresh list
    },
  })
}