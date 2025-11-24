import { z } from 'zod'
import { nameSchema, descriptionSchema, tagsSchema, uuidSchema } from './common-schemas'

/**
 * Lucide icon name validation
 * Icon names are lowercase with hyphens (e.g., "briefcase", "users", "file-text")
 * Used for: gallery icons, area icons
 */
export const iconSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+$/, 'Icon name must be lowercase with hyphens only')
  .max(50, 'Icon name must be less than 50 characters')
  .optional()

/**
 * Gallery name validation (1-255 characters)
 * More lenient than standard nameSchema to allow single-word gallery names
 */
export const galleryNameSchema = z
  .string()
  .trim()
  .min(1, 'Gallery name is required')
  .max(255, 'Gallery name must be less than 255 characters')

/**
 * Area name validation (1-100 characters)
 * Used for gallery area names
 */
export const areaNameSchema = z
  .string()
  .trim()
  .min(1, 'Area name is required')
  .max(100, 'Area name must be less than 100 characters')

/**
 * Schema for creating a new gallery
 * Used in: CreateGallerySheet form component
 */
export const createGallerySchema = z.object({
  // Required fields
  name: galleryNameSchema,
  visibility: z.enum(['personal', 'organization']),

  // Optional fields
  description: descriptionSchema,
  icon: iconSchema,
  status: z.enum(['draft', 'published']).default('draft').optional(),
  tags: tagsSchema,
})

/**
 * Infer TypeScript type from schema
 * Use this type in components and hooks for type safety
 */
export type CreateGalleryInput = z.infer<typeof createGallerySchema>

/**
 * Schema for updating an existing gallery
 * All fields optional (partial update)
 * Used in: EditGallerySheet form component
 */
export const updateGallerySchema = z.object({
  name: galleryNameSchema.optional(),
  description: descriptionSchema,
  icon: iconSchema,
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['personal', 'organization']).optional(),
  tags: tagsSchema,
})

export type UpdateGalleryInput = z.infer<typeof updateGallerySchema>

/**
 * Schema for creating a new gallery area
 * Used in: CreateAreaDialog form component
 */
export const createGalleryAreaSchema = z.object({
  // Required fields
  gallery_id: uuidSchema,
  name: areaNameSchema,

  // Optional fields
  description: descriptionSchema,
  icon: iconSchema,
  display_order: z.number().positive().optional(),
})

export type CreateGalleryAreaInput = z.infer<typeof createGalleryAreaSchema>

/**
 * Schema for updating an existing gallery area
 * Used in: EditAreaDialog form component
 */
export const updateGalleryAreaSchema = z.object({
  name: areaNameSchema.optional(),
  description: descriptionSchema,
  icon: iconSchema,
  display_order: z.number().positive().optional(),
})

export type UpdateGalleryAreaInput = z.infer<typeof updateGalleryAreaSchema>

/**
 * Schema for adding processors to a gallery area
 * Used in: AddProcessorsDialog form component
 */
export const addProcessorsToAreaSchema = z.object({
  gallery_area_id: uuidSchema,
  processor_ids: z
    .array(uuidSchema)
    .min(1, 'Select at least one processor')
    .max(50, 'Maximum 50 processors can be added at once'),
})

export type AddProcessorsToAreaInput = z.infer<typeof addProcessorsToAreaSchema>

/**
 * Schema for reordering areas
 * Used in: drag-and-drop area reordering
 */
export const reorderAreasSchema = z.object({
  gallery_id: uuidSchema,
  area_orders: z.array(
    z.object({
      area_id: uuidSchema,
      display_order: z.number().positive(),
    })
  ),
})

export type ReorderAreasInput = z.infer<typeof reorderAreasSchema>

/**
 * Schema for reordering processors within an area
 * Used in: drag-and-drop processor reordering
 */
export const reorderProcessorsSchema = z.object({
  gallery_area_id: uuidSchema,
  processor_positions: z.array(
    z.object({
      processor_id: uuidSchema,
      position: z.number().positive(),
    })
  ),
})

export type ReorderProcessorsInput = z.infer<typeof reorderProcessorsSchema>

/**
 * Schema for deleting a gallery (soft delete)
 * Used in: DeleteGalleryDialog confirmation
 */
export const deleteGallerySchema = z.object({
  gallery_id: uuidSchema,
})

export type DeleteGalleryInput = z.infer<typeof deleteGallerySchema>

/**
 * Schema for deleting a gallery area
 * Used in: DeleteAreaDialog confirmation
 */
export const deleteGalleryAreaSchema = z.object({
  area_id: uuidSchema,
})

export type DeleteGalleryAreaInput = z.infer<typeof deleteGalleryAreaSchema>

/**
 * Schema for removing a processor from a gallery area
 * Used in: processor card remove button
 */
export const removeProcessorFromAreaSchema = z.object({
  gallery_area_id: uuidSchema,
  processor_id: uuidSchema,
})

export type RemoveProcessorFromAreaInput = z.infer<typeof removeProcessorFromAreaSchema>
