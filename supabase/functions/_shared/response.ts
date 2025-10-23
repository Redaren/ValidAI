import { corsHeaders } from './cors.ts'

/**
 * Standardized success response (200)
 * Includes CORS headers and JSON content type
 *
 * @param {any} data - Data to return in response
 * @returns {Response} 200 response with success format
 */
export function successResponse(data: any): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Standardized error response
 * Includes CORS headers and JSON content type
 *
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default 400)
 * @returns {Response} Error response with specified status
 */
export function errorResponse(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Unauthorized response (401)
 * Used when authentication is missing or invalid
 *
 * @param {string} message - Error message (optional)
 * @returns {Response} 401 response
 */
export function unauthorizedResponse(message = 'Unauthorized'): Response {
  return errorResponse(message, 401)
}

/**
 * Forbidden response (403)
 * Used when user lacks permission for operation
 *
 * @param {string} message - Error message (optional)
 * @returns {Response} 403 response
 */
export function forbiddenResponse(message = 'Forbidden'): Response {
  return errorResponse(message, 403)
}

/**
 * Not found response (404)
 * Used when requested resource doesn't exist
 *
 * @param {string} message - Error message (optional)
 * @returns {Response} 404 response
 */
export function notFoundResponse(message = 'Not found'): Response {
  return errorResponse(message, 404)
}

/**
 * Conflict response (409)
 * Used when request conflicts with existing data (e.g., duplicate slug)
 *
 * @param {string} message - Error message
 * @returns {Response} 409 response
 */
export function conflictResponse(message: string): Response {
  return errorResponse(message, 409)
}
