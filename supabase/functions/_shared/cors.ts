/**
 * CORS configuration for Edge Functions
 * Restricts access to allowed origins only
 */

/**
 * List of allowed origins for CORS
 * Production domains and localhost for development
 */
const allowedOrigins = [
  'https://app.sanitycheck.se',
  'https://admin.sanitycheck.se',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
]

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  return allowedOrigins.includes(origin)
}

/**
 * Get CORS headers for a specific origin
 * Returns headers with the origin if allowed, otherwise returns headers without Access-Control-Allow-Origin
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  }

  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

/**
 * Handle CORS preflight requests
 * Returns 200 with CORS headers for OPTIONS requests from allowed origins
 *
 * @param {Request} req - The incoming request
 * @returns {Response} 200 response with CORS headers for OPTIONS, or 403 for disallowed origins
 */
export function handleCors(req: Request): Response {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    if (isOriginAllowed(origin)) {
      return new Response('ok', {
        status: 200,
        headers: getCorsHeaders(origin)
      })
    } else {
      // Disallowed origin - return 403 without CORS headers
      return new Response('Forbidden', { status: 403 })
    }
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: getCorsHeaders(origin)
  })
}

// All functions have been migrated to use getCorsHeaders(origin)
// The old corsHeaders constant with wildcard '*' origin has been removed
