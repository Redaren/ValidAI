'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import type {
  CreateGalleryAreaInput,
  UpdateGalleryAreaInput,
  AddProcessorsToAreaInput,
  RemoveProcessorFromAreaInput,
} from '@/lib/validations'

/**
 * Hook to create a new gallery area
 */
export function useCreateGalleryArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async (input: CreateGalleryAreaInput) => {
      // Get the current highest display_order for this gallery
      const { data: existingAreas, error: fetchError } = await supabase
        .from('validai_gallery_areas')
        .select('display_order')
        .eq('gallery_id', input.gallery_id)
        .order('display_order', { ascending: false })
        .limit(1)

      if (fetchError) {
        logger.error('Error fetching existing areas:', extractErrorDetails(fetchError))
        throw new Error('Failed to fetch existing areas')
      }

      // Calculate new display_order
      const maxOrder = existingAreas && existingAreas.length > 0 ? existingAreas[0].display_order : 0
      const newDisplayOrder = input.display_order ?? maxOrder + 1000

      const insertData = {
        gallery_id: input.gallery_id,
        name: input.name,
        description: input.description || null,
        icon: input.icon || null,
        display_order: newDisplayOrder,
      }

      const { data, error } = await supabase
        .from('validai_gallery_areas')
        .insert(insertData)
        .select('id')
        .single()

      if (error) {
        logger.error('Error creating gallery area:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to create gallery area')
      }

      return data
    },
    onSuccess: (_, { gallery_id }) => {
      // Invalidate gallery detail to refetch with new area
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery_id] })
    },
    onError: (error) => {
      logger.error('Create gallery area mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to update a gallery area
 */
export function useUpdateGalleryArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      areaId,
      galleryId,
      updates,
    }: {
      areaId: string
      galleryId: string
      updates: UpdateGalleryAreaInput
    }) => {
      const { error } = await supabase
        .from('validai_gallery_areas')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', areaId)

      if (error) {
        logger.error('Error updating gallery area:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to update gallery area')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Update gallery area mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to delete a gallery area (cascades to processors)
 */
export function useDeleteGalleryArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({ areaId, galleryId }: { areaId: string; galleryId: string }) => {
      const { error } = await supabase.from('validai_gallery_areas').delete().eq('id', areaId)

      if (error) {
        logger.error('Error deleting gallery area:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to delete gallery area')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Delete gallery area mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to add processors to a gallery area
 */
export function useAddProcessorsToArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({ input, galleryId }: { input: AddProcessorsToAreaInput; galleryId: string }) => {
      // Get the current highest position in this area
      const { data: existingProcessors, error: fetchError } = await supabase
        .from('validai_gallery_area_processors')
        .select('position')
        .eq('gallery_area_id', input.gallery_area_id)
        .order('position', { ascending: false })
        .limit(1)

      if (fetchError) {
        logger.error('Error fetching existing processors:', extractErrorDetails(fetchError))
        throw new Error('Failed to fetch existing processors')
      }

      // Calculate starting position
      const maxPosition = existingProcessors && existingProcessors.length > 0 ? existingProcessors[0].position : 0
      let nextPosition = maxPosition + 1000

      // Create insert records with incremental positions
      const insertData = input.processor_ids.map((processorId) => {
        const record = {
          gallery_area_id: input.gallery_area_id,
          processor_id: processorId,
          position: nextPosition,
        }
        nextPosition += 1000
        return record
      })

      const { error } = await supabase.from('validai_gallery_area_processors').insert(insertData)

      if (error) {
        logger.error('Error adding processors to area:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to add processors to area')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Add processors to area mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to remove a processor from a gallery area
 */
export function useRemoveProcessorFromArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      input,
      galleryId,
    }: {
      input: RemoveProcessorFromAreaInput
      galleryId: string
    }) => {
      const { error } = await supabase
        .from('validai_gallery_area_processors')
        .delete()
        .eq('gallery_area_id', input.gallery_area_id)
        .eq('processor_id', input.processor_id)

      if (error) {
        logger.error('Error removing processor from area:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to remove processor from area')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Remove processor from area mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to reorder areas in a gallery
 */
export function useReorderGalleryAreas() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      galleryId,
      areaOrders,
    }: {
      galleryId: string
      areaOrders: Array<{ area_id: string; display_order: number }>
    }) => {
      // Update each area's display_order
      const updates = areaOrders.map(({ area_id, display_order }) =>
        supabase
          .from('validai_gallery_areas')
          .update({ display_order, updated_at: new Date().toISOString() })
          .eq('id', area_id)
      )

      const results = await Promise.all(updates)

      // Check for errors
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        logger.error('Error reordering areas:', extractErrorDetails(errors[0].error))
        throw new Error('Failed to reorder areas')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Reorder gallery areas mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to reorder processors within a gallery area
 */
export function useReorderGalleryProcessors() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      galleryId,
      processorPositions,
    }: {
      galleryId: string
      processorPositions: Array<{ processor_id: string; gallery_area_id: string; position: number }>
    }) => {
      // Update each processor's position (and potentially area if moved cross-area)
      const updates = processorPositions.map(({ processor_id, gallery_area_id, position }) =>
        supabase
          .from('validai_gallery_area_processors')
          .update({ position, updated_at: new Date().toISOString() })
          .eq('processor_id', processor_id)
          .eq('gallery_area_id', gallery_area_id)
      )

      const results = await Promise.all(updates)

      // Check for errors
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        logger.error('Error reordering processors:', extractErrorDetails(errors[0].error))
        throw new Error('Failed to reorder processors')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Reorder gallery processors mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to move a processor to a different area
 */
export function useMoveProcessorToArea() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      processorId,
      fromAreaId,
      toAreaId,
      galleryId,
      position,
    }: {
      processorId: string
      fromAreaId: string
      toAreaId: string
      galleryId: string
      position: number
    }) => {
      // First, delete from old area
      const { error: deleteError } = await supabase
        .from('validai_gallery_area_processors')
        .delete()
        .eq('processor_id', processorId)
        .eq('gallery_area_id', fromAreaId)

      if (deleteError) {
        logger.error('Error removing processor from old area:', extractErrorDetails(deleteError))
        throw new Error('Failed to move processor')
      }

      // Then, insert into new area
      const { error: insertError } = await supabase.from('validai_gallery_area_processors').insert({
        processor_id: processorId,
        gallery_area_id: toAreaId,
        position,
      })

      if (insertError) {
        logger.error('Error adding processor to new area:', extractErrorDetails(insertError))
        throw new Error('Failed to move processor')
      }
    },
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
    },
    onError: (error) => {
      logger.error('Move processor to area mutation failed:', extractErrorDetails(error))
    },
  })
}
