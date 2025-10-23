import { z } from 'zod'

/**
 * Common reusable validation primitives for the ValidAI application.
 * These schemas are used across multiple features to ensure consistency.
 */

/**
 * Standard name validation (3-100 characters)
 * Used for: processor names, operation names, area names, etc.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(3, 'Must be at least 3 characters')
  .max(100, 'Must be less than 100 characters')

/**
 * Description validation (max 500 characters, optional)
 * Used for: processor descriptions, operation descriptions, etc.
 */
export const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'Must be less than 500 characters')
  .optional()

/**
 * Tags validation (array of strings, max 10 tags, 50 chars each)
 * Used for: processor tags, operation tags, etc.
 */
export const tagsSchema = z
  .array(
    z.string().trim().min(1, 'Tag cannot be empty').max(50, 'Tag must be less than 50 characters')
  )
  .max(10, 'Maximum 10 tags allowed')
  .optional()

/**
 * UUID validation
 * Used for: all ID fields
 */
export const uuidSchema = z.string().uuid('Invalid ID format')

/**
 * Helper function to transform comma-separated string to array
 * Useful for tag inputs where users type "tag1, tag2, tag3"
 */
export const commaSeparatedToArray = (value: string): string[] => {
  if (!value || value.trim() === '') return []
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}
