/**
 * Standard CORS headers for Edge Functions
 * Allows requests from any origin (can be restricted later for production)
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

/**
 * Handle CORS preflight requests
 * Returns 200 with CORS headers for OPTIONS requests
 *
 * @param {Request} req - The incoming request
 * @returns {Response} 200 response with CORS headers for OPTIONS, 405 for other methods
 */
export function handleCors(req: Request): Response {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }
  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
}
