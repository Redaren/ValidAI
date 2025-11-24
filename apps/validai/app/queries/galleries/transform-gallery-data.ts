/**
 * Gallery data transformation utilities
 *
 * This file is intentionally WITHOUT 'use client' directive so the transform
 * function can be used on both server (prefetch) and client (runtime).
 */

import type { Database } from '@playze/shared-types'

type GalleryStatus = Database['public']['Enums']['gallery_status']
type GalleryVisibility = Database['public']['Enums']['gallery_visibility']
type ProcessorStatus = Database['public']['Enums']['processor_status']

export interface GalleryProcessor {
  processor_id: string
  processor_name: string
  processor_description: string | null
  processor_usage_description: string | null
  processor_status: ProcessorStatus
  position: number
}

export interface GalleryArea {
  area_id: string
  area_name: string
  area_description: string | null
  area_icon: string | null
  display_order: number
  processors: GalleryProcessor[]
}

export interface GalleryDetail {
  gallery_id: string
  gallery_name: string
  gallery_description: string | null
  gallery_icon: string | null
  gallery_status: GalleryStatus
  gallery_visibility: GalleryVisibility
  gallery_tags: string[] | null
  gallery_created_by: string
  gallery_creator_name: string | null
  gallery_created_at: string
  gallery_updated_at: string
  gallery_is_owner: boolean
  areas: GalleryArea[]
}

/**
 * Transform flat rows from RPC into nested gallery structure
 *
 * @param rows - Flat rows returned from get_gallery_detail RPC
 * @returns Nested gallery structure with areas and processors
 *
 * This function is used by both:
 * - Server Components (prefetch in page.tsx)
 * - Client Components (useGalleryDetail hook)
 */
export function transformGalleryData(rows: any[]): GalleryDetail {
  if (!rows || rows.length === 0) {
    throw new Error('Gallery not found')
  }

  const firstRow = rows[0]

  // Extract gallery-level fields from first row
  const gallery: GalleryDetail = {
    gallery_id: firstRow.gallery_id,
    gallery_name: firstRow.gallery_name,
    gallery_description: firstRow.gallery_description,
    gallery_icon: firstRow.gallery_icon,
    gallery_status: firstRow.gallery_status,
    gallery_visibility: firstRow.gallery_visibility,
    gallery_tags: firstRow.gallery_tags,
    gallery_created_by: firstRow.gallery_created_by,
    gallery_creator_name: firstRow.gallery_creator_name,
    gallery_created_at: firstRow.gallery_created_at,
    gallery_updated_at: firstRow.gallery_updated_at,
    gallery_is_owner: firstRow.gallery_is_owner,
    areas: [],
  }

  // Group rows by area
  const areasMap = new Map<string, GalleryArea>()

  for (const row of rows) {
    // Skip rows without area (gallery has no areas yet)
    if (!row.area_id) {
      continue
    }

    // Get or create area
    let area = areasMap.get(row.area_id)
    if (!area) {
      area = {
        area_id: row.area_id,
        area_name: row.area_name,
        area_description: row.area_description,
        area_icon: row.area_icon,
        display_order: row.area_display_order,
        processors: [],
      }
      areasMap.set(row.area_id, area)
    }

    // Add processor to area if present
    if (row.processor_id) {
      area.processors.push({
        processor_id: row.processor_id,
        processor_name: row.processor_name,
        processor_description: row.processor_description,
        processor_usage_description: row.processor_usage_description,
        processor_status: row.processor_status,
        position: row.processor_position,
      })
    }
  }

  // Convert map to array and sort by display_order
  gallery.areas = Array.from(areasMap.values()).sort((a, b) => a.display_order - b.display_order)

  // Sort processors within each area by position
  gallery.areas.forEach((area) => {
    area.processors.sort((a, b) => a.position - b.position)
  })

  return gallery
}
