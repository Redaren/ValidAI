/**
 * SUPABASE ARCHITECTURE DECISION TREE
 *
 * Use this guide to determine the correct approach for any data operation in Playze Core.
 *
 * ┌─ Need to fetch/modify data?
 * │
 * ├─ Simple CRUD on single table?
 * │  └─ ✅ Use PostgREST directly: supabase.from('table').select/insert/update/delete()
 * │     Example: supabase.from('organizations').select('*')
 * │     Why: PostgREST provides automatic REST API with RLS enforcement
 * │
 * ├─ Complex query with joins/aggregations/multi-step logic?
 * │  └─ ✅ Create database function: supabase.rpc('function_name', params)
 * │     Example: supabase.rpc('get_organization_apps', { org_id: '...' })
 * │     Why: Database functions are faster, type-safe, and keep logic near data
 * │     IMPORTANT: Database function must use RETURNS TABLE(...), NOT JSON
 * │
 * ├─ Need service-role permissions (JWT updates, bypassing RLS)?
 * │  └─ ✅ Create Edge Function: supabase.functions.invoke('function-name', { body })
 * │     Example: supabase.functions.invoke('auth/switch-organization', { body: { organizationId } })
 * │     Only for: JWT metadata updates, email sending, PDF generation, admin operations
 * │     Why: Service-role key required, external service integrations
 * │
 * ├─ Need real-time updates?
 * │  └─ ✅ Use subscriptions: supabase.channel().on('postgres_changes', callback)
 * │     Example: supabase.channel('roads').on('postgres_changes', { event: '*', schema: 'public', table: 'roadcloud_roads' }, callback)
 * │     Why: Built-in WebSocket support for live data
 * │
 * └─ Need external API integration (email, payment, PDF)?
 *    └─ ✅ Create Edge Function with external service call
 *       Example: Resend email, Stripe webhook, PDF generation
 *       Why: Deno runtime with external fetch capabilities
 *
 * ❌ NEVER create Next.js API routes for database operations
 * ❌ NEVER use Edge Functions for simple CRUD or queries
 * ❌ NEVER return JSON from database functions (use RETURNS TABLE)
 *
 * ---
 *
 * EXAMPLES:
 *
 * ✅ CORRECT: Simple CRUD with PostgREST
 * const { data: orgs } = await supabase
 *   .from('organizations')
 *   .select('*')
 *   .eq('id', orgId)
 *
 * ✅ CORRECT: Complex query with database function
 * const { data: apps } = await supabase
 *   .rpc('get_organization_apps', { org_id: orgId })
 *
 * ✅ CORRECT: Edge Function for service-role operation
 * const { data } = await supabase.functions.invoke('auth/switch-organization', {
 *   body: { organizationId: newOrgId }
 * })
 *
 * ❌ WRONG: Don't create API routes
 * // File: app/api/organizations/route.ts  <- DELETE THIS
 * export async function GET(request: Request) {
 *   const { data } = await supabase.from('organizations').select('*')
 *   return Response.json(data)
 * }
 */

// This file is for documentation purposes only
export const DECISION_TREE = 'See comments above'
