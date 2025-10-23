/**
 * Validate required fields exist in data object
 * Returns error message if validation fails, null if valid
 *
 * @param {Record<string, any>} data - Object to validate
 * @param {string[]} fields - Array of required field names
 * @returns {string | null} Error message or null if valid
 */
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): string | null {
  const missing = fields.filter(field => {
    const value = data[field]
    return value === undefined || value === null || value === ''
  })

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`
  }

  return null
}

/**
 * Validate UUID format
 * Accepts standard UUID v4 format
 *
 * @param {string} value - String to validate as UUID
 * @returns {boolean} True if valid UUID format
 */
export function validateUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * Validate email format
 * Basic email validation - checks for @domain.tld pattern
 *
 * @param {string} email - String to validate as email
 * @returns {boolean} True if valid email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate slug format
 * Slug must be lowercase, alphanumeric with hyphens, no spaces
 *
 * @param {string} slug - String to validate as slug
 * @returns {boolean} True if valid slug format
 */
export function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  return slugRegex.test(slug)
}
