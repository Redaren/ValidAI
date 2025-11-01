/**
 * Bulk Operations Import/Export Utilities
 *
 * Utilities for converting operations to/from TSV format for bulk editing in Excel.
 * Used by the bulk import/export dialog.
 *
 * @module lib/utils/bulk-operations-utils
 */

import {
  bulkOperationRowSchema,
  normalizeOperationType,
  type BulkOperationRow,
  type RowValidationResult,
  type BulkValidationResult,
} from '@/lib/validations'
import type { Operation } from '@/app/queries/processors/use-processor-detail'

/**
 * TSV column headers for export/import
 */
const TSV_HEADERS = ['area', 'name', 'operation_type', 'prompt', 'description'] as const

/**
 * Export operations to TSV format for clipboard
 *
 * Converts operations array to tab-separated values format suitable for
 * pasting into Excel or Google Sheets. Operations are ordered by area
 * display order and position within area.
 *
 * @param operations - Array of operations to export
 * @param areaDisplayOrder - Array of area names in display order
 * @returns TSV string with header row and data rows
 *
 * @example
 * ```ts
 * const tsv = exportOperationsToTSV(operations, ['Extraction', 'Validation'])
 * await navigator.clipboard.writeText(tsv)
 * ```
 */
export function exportOperationsToTSV(
  operations: Operation[],
  areaDisplayOrder: string[]
): string {
  // Add helper comment line with valid operation types
  const commentLine =
    '# Valid operation types: extraction, validation, rating, classification, analysis, generic, traffic_light'

  // Create header row
  const headerRow = TSV_HEADERS.join('\t')

  // Group operations by area
  const operationsByArea = new Map<string, Operation[]>()
  operations.forEach(op => {
    const existing = operationsByArea.get(op.area) || []
    existing.push(op)
    operationsByArea.set(op.area, existing)
  })

  // Sort operations within each area by position
  operationsByArea.forEach(ops => {
    ops.sort((a, b) => Number(a.position) - Number(b.position))
  })

  // Build data rows in area display order
  const dataRows: string[] = []
  areaDisplayOrder.forEach(areaName => {
    const areaOps = operationsByArea.get(areaName) || []
    areaOps.forEach(op => {
      const row = [
        escapeTSV(op.area),
        escapeTSV(op.name),
        escapeTSV(op.operation_type),
        escapeTSV(op.prompt),
        escapeTSV(op.description || ''),
      ].join('\t')
      dataRows.push(row)
    })
  })

  return [commentLine, headerRow, ...dataRows].join('\n')
}

/**
 * Escape special characters in TSV cell
 *
 * Handles tabs, newlines, and quotes in cell values.
 *
 * @param value - Cell value to escape
 * @returns Escaped value safe for TSV format
 */
function escapeTSV(value: string): string {
  // Replace tabs with spaces
  let escaped = value.replace(/\t/g, ' ')
  // Replace newlines with spaces
  escaped = escaped.replace(/\n/g, ' ')
  // Trim whitespace
  escaped = escaped.trim()
  return escaped
}

/**
 * Parse TSV string to operation rows
 *
 * Parses tab-separated values string and validates each row against schema.
 * Skips comment lines (starting with #) and empty lines.
 *
 * @param tsvContent - TSV string from clipboard
 * @returns Validation result with parsed operations and errors
 *
 * @example
 * ```ts
 * const result = parseTSVToOperations(pastedContent)
 * if (result.allValid) {
 *   // Proceed with import
 * } else {
 *   // Show errors
 * }
 * ```
 */
export function parseTSVToOperations(tsvContent: string): BulkValidationResult {
  const lines = tsvContent.split('\n')
  const rows: RowValidationResult[] = []
  let headerSkipped = false
  let dataRowNumber = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines
    if (!line) continue

    // Skip comment lines
    if (line.startsWith('#')) continue

    // Skip header row (first non-comment line)
    if (!headerSkipped) {
      headerSkipped = true
      continue
    }

    // Parse data row
    dataRowNumber++
    const rowResult = parseAndValidateRow(line, dataRowNumber)
    rows.push(rowResult)
  }

  const validRows = rows.filter(r => r.valid).length
  const invalidRows = rows.filter(r => !r.valid).length

  return {
    allValid: invalidRows === 0 && validRows > 0,
    totalRows: rows.length,
    validRows,
    invalidRows,
    rows,
  }
}

/**
 * Parse and validate a single TSV row
 *
 * @param line - TSV line to parse
 * @param rowNumber - Row number (1-indexed) for error reporting
 * @returns Validation result for the row
 */
function parseAndValidateRow(line: string, rowNumber: number): RowValidationResult {
  const cells = line.split('\t')

  // Check minimum column count
  if (cells.length < 4) {
    return {
      rowNumber,
      valid: false,
      errors: [
        `Row has only ${cells.length} columns, expected at least 4 (area, name, operation_type, prompt)`,
      ],
    }
  }

  // Extract and trim cell values
  const [area, name, operationType, prompt, description = ''] = cells.map(c => c.trim())

  // Normalize operation type to lowercase
  const normalizedType = normalizeOperationType(operationType)

  // Build operation object
  const operation = {
    area,
    name,
    operation_type: normalizedType,
    prompt,
    description: description || null,
  }

  // Validate with Zod schema
  const result = bulkOperationRowSchema.safeParse(operation)

  if (result.success) {
    return {
      rowNumber,
      valid: true,
      operation: result.data,
    }
  } else {
    // Extract error messages from Zod
    const errors = result.error.issues.map(issue => {
      const field = issue.path.join('.')
      return `${field}: ${issue.message}`
    })

    return {
      rowNumber,
      valid: false,
      errors,
    }
  }
}

/**
 * Detect changes between imported operations and existing operations
 *
 * Compares imported operations with existing operations to determine
 * which are new, which are updates, and provides summary.
 *
 * @param importedOperations - Operations from import
 * @param existingOperations - Current operations in processor
 * @returns Change detection result
 */
export interface ChangeDetectionResult {
  /** Operations that will be created (new names) */
  newOperations: BulkOperationRow[]
  /** Operations that will update existing (matching names) */
  updatedOperations: Array<{
    imported: BulkOperationRow
    existing: Operation
  }>
  /** Areas that will be created (new area names) */
  newAreas: string[]
  /** Existing areas in import */
  existingAreas: string[]
}

export function detectChanges(
  importedOperations: BulkOperationRow[],
  existingOperations: Operation[],
  existingAreaNames: string[]
): ChangeDetectionResult {
  // Build lookup map of existing operations by name
  const existingByName = new Map<string, Operation>()
  existingOperations.forEach(op => {
    existingByName.set(op.name, op)
  })

  // Build set of existing area names
  const existingAreasSet = new Set(existingAreaNames)

  // Detect new vs updated operations
  const newOperations: BulkOperationRow[] = []
  const updatedOperations: Array<{ imported: BulkOperationRow; existing: Operation }> = []

  importedOperations.forEach(imported => {
    const existing = existingByName.get(imported.name)
    if (existing) {
      updatedOperations.push({ imported, existing })
    } else {
      newOperations.push(imported)
    }
  })

  // Detect new areas
  const importedAreas = Array.from(new Set(importedOperations.map(op => op.area)))
  const newAreas = importedAreas.filter(area => !existingAreasSet.has(area))
  const existingAreas = importedAreas.filter(area => existingAreasSet.has(area))

  return {
    newOperations,
    updatedOperations,
    newAreas,
    existingAreas,
  }
}

/**
 * Copy text to clipboard
 *
 * Uses modern Clipboard API with fallback.
 *
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
  } else {
    // Fallback for older browsers or non-HTTPS
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}
