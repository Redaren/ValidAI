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
 */
export const ALLOWED_DOCUMENT_TYPES = {
  'application/pdf': {
    extensions: ['.pdf'],
    name: 'PDF',
  },
  'application/msword': {
    extensions: ['.doc'],
    name: 'Word Document',
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extensions: ['.docx'],
    name: 'Word Document',
  },
  'text/plain': {
    extensions: ['.txt'],
    name: 'Text File',
  },
  'text/html': {
    extensions: ['.html', '.htm'],
    name: 'HTML',
  },
  'text/markdown': {
    extensions: ['.md', '.markdown'],
    name: 'Markdown',
  },
  'application/vnd.ms-excel': {
    extensions: ['.xls'],
    name: 'Excel Spreadsheet',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extensions: ['.xlsx'],
    name: 'Excel Spreadsheet',
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
 * Validate if a file meets upload requirements
 */
export function validateDocumentFile(file: File): {
  valid: boolean
  error?: string
} {
  // Check file size
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${DOCUMENT_MAX_SIZE_MB} MB limit`,
    }
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type not supported. Accepted formats: ${ALLOWED_FORMAT_NAMES}`,
    }
  }

  return { valid: true }
}
