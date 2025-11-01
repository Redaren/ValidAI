/**
 * Bulk Operation Validation Schemas
 *
 * Zod schemas for validating bulk import/export of operations.
 * Used by the bulk import wizard to validate TSV data before import.
 *
 * @module lib/validations/bulk-operation-schemas
 */

import { z } from 'zod'

/**
 * Valid operation types from the database enum.
 * Must match the validai_operation_type enum in the database.
 */
export const operationTypeEnum = z.enum([
  'extraction',
  'validation',
  'rating',
  'classification',
  'analysis',
  'generic',
  'traffic_light',
])

/**
 * Schema for a single operation row in bulk import.
 * Validates all required fields and formats for bulk operations.
 */
export const bulkOperationRowSchema = z.object({
  /** Area name where the operation belongs */
  area: z
    .string()
    .min(1, 'Area name is required')
    .max(50, 'Area name must be 50 characters or less')
    .trim(),

  /** Operation name (unique within processor) */
  name: z
    .string()
    .min(3, 'Operation name must be at least 3 characters')
    .max(100, 'Operation name must be 100 characters or less')
    .trim(),

  /** Type of operation from the enum */
  operation_type: operationTypeEnum,

  /** AI prompt for the operation */
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(2000, 'Prompt must be 2000 characters or less')
    .trim(),

  /** Optional description of what the operation does */
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .trim()
    .nullable()
    .optional()
    .transform(val => val === '' ? null : val),
})

/**
 * Inferred TypeScript type for a bulk operation row
 */
export type BulkOperationRow = z.infer<typeof bulkOperationRowSchema>

/**
 * Schema for the complete bulk import payload.
 * Contains an array of operation rows.
 */
export const bulkImportSchema = z.object({
  operations: z.array(bulkOperationRowSchema).min(1, 'At least one operation is required'),
})

/**
 * Inferred TypeScript type for bulk import payload
 */
export type BulkImportPayload = z.infer<typeof bulkImportSchema>

/**
 * Normalize operation type to lowercase for case-insensitive matching.
 * Handles common user errors when editing in Excel.
 *
 * @param operationType - The operation type string to normalize
 * @returns Lowercase operation type
 */
export function normalizeOperationType(operationType: string): string {
  return operationType.toLowerCase().trim()
}

/**
 * Validation result for a single row in bulk import.
 * Contains either the parsed operation or error information.
 */
export interface RowValidationResult {
  /** Row number (1-indexed) */
  rowNumber: number
  /** Whether the row is valid */
  valid: boolean
  /** Parsed operation data (if valid) */
  operation?: BulkOperationRow
  /** Error messages (if invalid) */
  errors?: string[]
}

/**
 * Complete validation result for bulk import.
 * Contains summary and per-row results.
 */
export interface BulkValidationResult {
  /** Whether all rows are valid */
  allValid: boolean
  /** Total number of rows parsed */
  totalRows: number
  /** Number of valid rows */
  validRows: number
  /** Number of invalid rows */
  invalidRows: number
  /** Per-row validation results */
  rows: RowValidationResult[]
}
