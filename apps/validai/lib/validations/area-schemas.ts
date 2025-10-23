import { z } from 'zod'

/**
 * Area name validation
 * Used for: creating and renaming areas within processors
 *
 * Rules:
 * - Cannot be empty (trimmed)
 * - Must be between 1-50 characters
 * - Must be unique within a processor
 */
export const areaNameSchema = z
  .string()
  .trim()
  .min(1, 'Area name cannot be empty')
  .max(50, 'Area name must be less than 50 characters')

/**
 * Create area validation with uniqueness check
 * Used in: CreateAreaDialog
 *
 * @param existingNames - Array of existing area names to check against
 * @returns Zod schema with uniqueness validation
 */
export const createAreaSchema = (existingNames: string[]) =>
  areaNameSchema.refine(
    (name) => !existingNames.includes(name),
    'An area with this name already exists'
  )

/**
 * Rename area validation with uniqueness check
 * Used in: RenameAreaDialog
 *
 * @param existingNames - Array of existing area names (excluding current name)
 * @param currentName - Current area name to allow unchanged submissions
 * @returns Zod schema with uniqueness validation
 */
export const renameAreaSchema = (existingNames: string[], currentName: string) =>
  areaNameSchema.refine(
    (name) => name === currentName || !existingNames.includes(name),
    'An area with this name already exists'
  )
