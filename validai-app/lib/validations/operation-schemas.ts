/**
 * Operation validation schemas
 *
 * This file defines Zod validation schemas for creating and managing operations.
 * Operations are the core analysis units within processors that perform specific
 * tasks like extraction, validation, rating, classification, or analysis.
 */

import { z } from 'zod'

/**
 * Operation name schema - validates operation names
 * - Required field
 * - 3-100 characters
 * - Trimmed whitespace
 */
export const operationNameSchema = z
  .string()
  .min(3, 'Operation name must be at least 3 characters')
  .max(100, 'Operation name must be less than 100 characters')
  .trim()

/**
 * Operation description schema - validates operation descriptions
 * - Optional field
 * - Max 500 characters
 * - Trimmed whitespace
 */
export const operationDescriptionSchema = z
  .string()
  .max(500, 'Description must be less than 500 characters')
  .trim()
  .optional()

/**
 * Operation prompt schema - validates AI prompts
 * - Required field
 * - 1-2000 characters
 * - Preserves formatting (no trim)
 */
export const operationPromptSchema = z
  .string()
  .min(1, 'Prompt is required')
  .max(2000, 'Prompt must be less than 2000 characters')

/**
 * Generic operation creation schema
 *
 * Used for creating Generic type operations which are flexible
 * operations used during development to test LLM behavior.
 *
 * Fields:
 * - name: The operation identifier (required)
 * - description: What the operation does (optional)
 * - operation_type: Fixed as 'generic'
 * - prompt: Instructions for the AI (required)
 *
 * Note: area, position, processor_id are NOT included here
 * as they're determined from context (which area button was clicked)
 */
export const createGenericOperationSchema = z.object({
  name: operationNameSchema,
  description: operationDescriptionSchema,
  operation_type: z.literal('generic'),
  prompt: operationPromptSchema,
})

/**
 * Generic operation update schema
 *
 * Used for updating existing Generic type operations.
 * Note: operation_type cannot be changed after creation.
 *
 * Fields:
 * - name: The operation identifier (required)
 * - description: What the operation does (optional)
 * - prompt: Instructions for the AI (required)
 */
export const updateGenericOperationSchema = z.object({
  name: operationNameSchema,
  description: operationDescriptionSchema,
  prompt: operationPromptSchema,
  // operation_type is not editable after creation
})

/**
 * Main operation creation schema
 *
 * This will eventually support multiple operation types via discriminated union.
 * Currently only supports 'generic' type but structured for easy extension.
 *
 * Future types to add:
 * - extraction: Structured data extraction with schema
 * - validation: Boolean checks with pass/fail criteria
 * - rating: Numerical scores with thresholds
 * - classification: Categorization with predefined options
 * - analysis: Free-form analysis with optional structure
 */
export const createOperationSchema = z.discriminatedUnion('operation_type', [
  createGenericOperationSchema,
  // Future: createExtractionOperationSchema,
  // Future: createValidationOperationSchema,
  // Future: createRatingOperationSchema,
  // Future: createClassificationOperationSchema,
  // Future: createAnalysisOperationSchema,
])

/**
 * Main operation update schema
 *
 * This will eventually support multiple operation types via discriminated union.
 * Currently only supports 'generic' type updates.
 */
export const updateOperationSchema = updateGenericOperationSchema

/**
 * TypeScript types inferred from schemas
 */
export type CreateGenericOperationInput = z.infer<typeof createGenericOperationSchema>
export type CreateOperationInput = z.infer<typeof createOperationSchema>
export type UpdateGenericOperationInput = z.infer<typeof updateGenericOperationSchema>
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>

/**
 * Database payload type
 *
 * This represents the full payload sent to the database,
 * including fields that are auto-set by the application.
 */
export interface CreateOperationPayload extends CreateOperationInput {
  processor_id: string
  area: string
  position: number
  required?: boolean
  configuration?: any
  output_schema?: any
  validation_rules?: any
}