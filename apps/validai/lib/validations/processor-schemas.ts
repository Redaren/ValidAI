import { z } from 'zod'
import { nameSchema, descriptionSchema, tagsSchema } from './common-schemas'

/**
 * Schema for creating a new processor
 * Used in: CreateProcessorSheet form component
 */
export const createProcessorSchema = z.object({
  // Required fields
  name: nameSchema,
  visibility: z.enum(['personal', 'organization']),

  // Optional fields
  description: descriptionSchema,
  usage_description: descriptionSchema,
  system_prompt: z
    .string()
    .trim()
    .max(2000, 'System prompt must be less than 2000 characters')
    .optional(),
  tags: tagsSchema,
})

/**
 * Infer TypeScript type from schema
 * Use this type in components and hooks for type safety
 */
export type CreateProcessorInput = z.infer<typeof createProcessorSchema>

/**
 * Schema for updating an existing processor
 * All fields optional (partial update)
 * Used in: EditProcessorSheet form component
 */
export const updateProcessorSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema,
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['personal', 'organization']).optional(),
  usage_description: descriptionSchema,
  system_prompt: z.string().trim().max(2000).optional(),
  tags: tagsSchema,
  default_run_view: z.enum(['technical', 'compliance', 'search', 'contract-comments']).optional(),
})

export type UpdateProcessorInput = z.infer<typeof updateProcessorSchema>

/**
 * Schema for updating processor settings
 * Used in: ProcessorSettingsSheet form component
 */
export const updateProcessorSettingsSchema = z.object({
  system_prompt: z
    .string()
    .trim()
    .max(2000, 'System prompt must be less than 2000 characters')
    .optional(),
})

export type UpdateProcessorSettingsInput = z.infer<typeof updateProcessorSettingsSchema>

/**
 * Schema for validating processor name (useful for rename operations)
 */
export const processorNameSchema = nameSchema
