import { z } from 'zod'

/**
 * UUID validation schema
 * Used across all resources that reference database IDs
 */
export const uuidSchema = z.string().uuid('Invalid UUID format')

/**
 * Email validation schema
 * Automatically converts to lowercase for consistency
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .toLowerCase()
  .trim()

/**
 * Organization name validation schema
 * Used in organization creation and update forms
 */
export const organizationNameSchema = z
  .string()
  .min(2, 'Organization name must be at least 2 characters')
  .max(100, 'Organization name must be at most 100 characters')
  .trim()

/**
 * Organization description schema
 * Optional field for additional organization details
 */
export const organizationDescriptionSchema = z
  .string()
  .max(500, 'Description must be at most 500 characters')
  .trim()
  .optional()
  .nullable()
