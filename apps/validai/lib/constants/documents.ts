/**
 * Document Upload Configuration
 *
 * Centralized constants for document upload validation and configuration.
 * Used by upload components and validation logic.
 */

/**
 * Maximum file size for document uploads
 */
export const DOCUMENT_MAX_SIZE_MB = 10
export const DOCUMENT_MAX_SIZE_BYTES = DOCUMENT_MAX_SIZE_MB * 1024 * 1024

/**
 * Allowed MIME types for document uploads
 * Maps MIME type to file extensions and human-readable names
 *
 * MVP: Only PDF files are supported
 */
export const ALLOWED_DOCUMENT_TYPES = {
  'application/pdf': {
    extensions: ['.pdf'],
    name: 'PDF',
  },
} as const

/**
 * Get list of all allowed MIME types
 */
export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_DOCUMENT_TYPES)

/**
 * Get human-readable format names for display
 */
export const ALLOWED_FORMAT_NAMES = Array.from(
  new Set(Object.values(ALLOWED_DOCUMENT_TYPES).map((t) => t.name))
).join(', ')

/**
 * Get file extensions for accept attribute
 */
export const ALLOWED_EXTENSIONS = Array.from(
  new Set(
    Object.values(ALLOWED_DOCUMENT_TYPES).flatMap((t) => t.extensions)
  )
).join(',')

/**
 * Validation error types
 */
export type ValidationErrorType = 'fileSize' | 'invalidType'

/**
 * Validation result with error key for translation
 */
export interface ValidationResult {
  valid: boolean
  errorType?: ValidationErrorType
  errorParams?: Record<string, string | number>
}

/**
 * Validate if a file meets upload requirements
 * Returns error key for translation instead of hardcoded message
 */
export function validateDocumentFile(file: File): ValidationResult {
  // Check file size
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    return {
      valid: false,
      errorType: 'fileSize',
      errorParams: { size: DOCUMENT_MAX_SIZE_MB },
    }
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      errorType: 'invalidType',
      errorParams: { formats: ALLOWED_FORMAT_NAMES },
    }
  }

  return { valid: true }
}
