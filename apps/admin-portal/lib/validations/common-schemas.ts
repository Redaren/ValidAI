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

/**
 * Optional text field schema
 * Used for organization extended fields that are optional strings
 */
export const optionalTextSchema = z
  .string()
  .max(255, 'Text must be at most 255 characters')
  .trim()
  .optional()
  .nullable()

/**
 * Phone number schema
 * Validates phone numbers with reasonable length limit
 */
export const phoneSchema = z
  .string()
  .max(30, 'Phone number must be at most 30 characters')
  .trim()
  .optional()
  .nullable()

/**
 * Country code schema
 * ISO 3166-1 alpha-2 country code (2 uppercase letters)
 */
export const countryCodeSchema = z
  .string()
  .length(2, 'Country code must be 2 characters')
  .toUpperCase()
  .optional()
  .nullable()
