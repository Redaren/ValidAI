import { getCorsHeaders } from './cors.ts'

/**
 * Standardized success response (200)
 * Includes CORS headers and JSON content type
 *
 * @param {any} data - Data to return in response
 * @param {string | null} origin - Request origin for CORS
 * @returns {Response} 200 response with success format
 */
export function successResponse(data: any, origin: string | null = null): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status: 200,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Standardized error response
 * Includes CORS headers and JSON content type
 *
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default 400)
 * @param {string | null} origin - Request origin for CORS
 * @param {Record<string, any>} extra - Additional data to include in response
 * @returns {Response} Error response with specified status
 */
export function errorResponse(message: string, status = 400, origin: string | null = null, extra?: Record<string, any>): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, ...extra }),
    {
      status,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Unauthorized response (401)
 * Used when authentication is missing or invalid
 *
 * @param {string} message - Error message (optional)
 * @param {string | null} origin - Request origin for CORS
 * @returns {Response} 401 response
 */
export function unauthorizedResponse(message = 'Unauthorized', origin: string | null = null): Response {
  return errorResponse(message, 401, origin)
}

/**
 * Forbidden response (403)
 * Used when user lacks permission for operation
 *
 * @param {string} message - Error message (optional)
 * @param {string | null} origin - Request origin for CORS
 * @returns {Response} 403 response
 */
export function forbiddenResponse(message = 'Forbidden', origin: string | null = null): Response {
  return errorResponse(message, 403, origin)
}

/**
 * Not found response (404)
 * Used when requested resource doesn't exist
 *
 * @param {string} message - Error message (optional)
 * @param {string | null} origin - Request origin for CORS
 * @returns {Response} 404 response
 */
export function notFoundResponse(message = 'Not found', origin: string | null = null): Response {
  return errorResponse(message, 404, origin)
}

/**
 * Conflict response (409)
 * Used when request conflicts with existing data (e.g., duplicate slug)
 *
 * @param {string} message - Error message
 * @param {string | null} origin - Request origin for CORS
 * @returns {Response} 409 response
 */
export function conflictResponse(message: string, origin: string | null = null): Response {
  return errorResponse(message, 409, origin)
}
