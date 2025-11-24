'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Database } from '@playze/shared-types'
import {
  transformGalleryData,
  type GalleryDetail,
  type GalleryArea,
  type GalleryProcessor,
} from './transform-gallery-data'

// Re-export types for backward compatibility
export type { GalleryDetail, GalleryArea, GalleryProcessor }

type GalleryStatus = Database['public']['Enums']['gallery_status']
type GalleryVisibility = Database['public']['Enums']['gallery_visibility']

/**
 * Hook to fetch gallery detail with all areas and processors
 *
 * @param galleryId - Gallery ID to fetch
 * @param options - Query options
 * @returns Query result with gallery detail
 *
 * @example
 * ```tsx
 * const { data: gallery, isLoading, error } = useGalleryDetail(galleryId)
 *
 * // Access nested structure
 * gallery?.areas.forEach(area => {
 *   console.log(area.area_name, area.processors.length)
 * })
 * ```
 */
export function useGalleryDetail(galleryId: string, options?: { enabled?: boolean }) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['gallery', galleryId],
    queryFn: async () => {
      console.log('[useGalleryDetail] 🔄 Fetching gallery:', galleryId, new Date().toISOString())

      const { data, error } = await supabase.rpc('get_gallery_detail', {
        p_gallery_id: galleryId,
      })

      console.log('[useGalleryDetail] 📦 RPC returned:', {
        galleryId,
        rowCount: data?.length || 0,
        hasError: !!error,
        timestamp: new Date().toISOString()
      })

      if (error) {
        console.error('[useGalleryDetail] ❌ Error:', error)
        logger.error('Error fetching gallery:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to fetch gallery')
      }

      if (!data || data.length === 0) {
        console.error('[useGalleryDetail] ❌ No data returned')
        throw new Error('Gallery not found')
      }

      // Transform flat rows to nested structure
      const transformed = transformGalleryData(data as any)
      console.log('[useGalleryDetail] ✅ Transformed gallery:', {
        galleryId: transformed.gallery_id,
        galleryName: transformed.gallery_name,
        areasCount: transformed.areas.length,
        areas: transformed.areas.map(a => ({
          areaId: a.area_id,
          areaName: a.area_name,
          processorsCount: a.processors.length
        })),
        timestamp: new Date().toISOString()
      })

      return transformed
    },
    staleTime: 60 * 1000, // 60 seconds (matches server prefetch)
    enabled: options?.enabled !== false && !!galleryId,
  })
}

/**
 * Hook to update gallery basic information
 */
export function useUpdateGallery() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async ({
      galleryId,
      updates,
    }: {
      galleryId: string
      updates: {
        name?: string
        description?: string | null
        icon?: string | null
        status?: GalleryStatus
        visibility?: GalleryVisibility
        tags?: string[] | null
      }
    }) => {
      const { error } = await supabase
        .from('validai_galleries')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', galleryId)

      if (error) {
        logger.error('Error updating gallery:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to update gallery')
      }
    },
    onSuccess: (_, { galleryId }) => {
      // Invalidate gallery detail and list
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] })
      queryClient.invalidateQueries({ queryKey: ['user-galleries'] })
    },
    onError: (error) => {
      logger.error('Update gallery mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to soft delete a gallery
 */
export function useDeleteGallery() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async (galleryId: string) => {
      const { error } = await supabase
        .from('validai_galleries')
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq('id', galleryId)

      if (error) {
        logger.error('Error deleting gallery:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to delete gallery')
      }
    },
    onSuccess: () => {
      // Invalidate galleries list
      queryClient.invalidateQueries({ queryKey: ['user-galleries'] })
    },
    onError: (error) => {
      logger.error('Delete gallery mutation failed:', extractErrorDetails(error))
    },
  })
}
