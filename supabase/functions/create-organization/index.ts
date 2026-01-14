import { createAdminClient } from '../_shared/supabaseAdmin.ts'
import { handleCors } from '../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, conflictResponse } from '../_shared/response.ts'
import { getUserFromRequest, isPlayzeAdmin } from '../_shared/auth.ts'
import { validateRequired } from '../_shared/validation.ts'

/**
 * Edge Function: create-organization
 *
 * Purpose: Create organization (Playze admin only)
 *
 * Method: POST
 * Auth: Requires Playze admin user
 *
 * Input:
 * {
 *   "name": "Acme Corp",
 *   "description": "Optional description",      // Optional
 *   "appSubscriptions": [                       // Optional
 *     { "appId": "roadcloud", "tierName": "pro" }
 *   ],
 *   // Extended fields (all optional):
 *   "org_number": "556123-4567",
 *   "vat_number": "SE556123456701",
 *   "street_address": "Storgatan 1",
 *   "postal_code": "111 22",
 *   "city": "Stockholm",
 *   "country": "SE",
 *   "contact_person": "Johan Svensson",
 *   "contact_role": "CTO",
 *   "contact_email": "johan@acme.com",
 *   "contact_phone": "+46701234567",
 *   "referral": "Partner X",
 *   "lead_source": "Conference",
 *   "kam": "Anna Karlsson"
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": {
 *     "organization": { ... },
 *     "subscriptions": [ ... ]    // If appSubscriptions provided
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('create-organization', {
 *   body: {
 *     name: 'Acme Corp',
 *     description: 'Optional description',
 *     appSubscriptions: [
 *       { appId: 'roadcloud', tierName: 'pro' }
 *     ]
 *   }
 * })
 */

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req)
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const supabase = createAdminClient()

    // Get authenticated user
    const user = await getUserFromRequest(req, supabase)
    if (!user) {
      return unauthorizedResponse('Invalid or missing authentication token')
    }

    // Verify user is Playze admin
    console.log('=== ADMIN CHECK DEBUG ===')
    console.log('User object:', JSON.stringify(user, null, 2))
    console.log('User email:', user.email)
    console.log('User email type:', typeof user.email)
    console.log('User email lowercase:', user.email?.toLowerCase())

    const isAdmin = await isPlayzeAdmin(user.email, supabase)

    console.log('isAdmin result:', isAdmin)
    console.log('=== END DEBUG ===')

    if (!isAdmin) {
      return forbiddenResponse('Only Playze administrators can create organizations')
    }

    // Parse and validate request body
    const {
      name,
      description,
      default_app_id,
      appSubscriptions,
      // Extended fields
      org_number,
      vat_number,
      street_address,
      postal_code,
      city,
      country,
      contact_person,
      contact_role,
      contact_email,
      contact_phone,
      referral,
      lead_source,
      kam
    } = await req.json()

    const validationError = validateRequired({ name }, ['name'])
    if (validationError) {
      return errorResponse(validationError)
    }

    console.log(`Admin ${user.email} creating organization: ${name}`)

    // Step 1: Create organization with all fields
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        description: description || null,
        default_app_id: default_app_id || null,
        is_active: true,
        // Extended fields
        org_number: org_number || null,
        vat_number: vat_number || null,
        street_address: street_address || null,
        postal_code: postal_code || null,
        city: city || null,
        country: country || null,
        contact_person: contact_person || null,
        contact_role: contact_role || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        referral: referral || null,
        lead_source: lead_source || null,
        kam: kam || null,
        // Auto-set created_by to the current admin user
        created_by: user.id
      })
      .select()
      .single()

    if (orgError) {
      console.error('Error creating organization:', orgError)

      // Handle unique constraint violation (duplicate name)
      if (orgError.code === '23505') {
        return conflictResponse(`Organization name '${name}' already exists. Please choose a different name.`)
      }

      return errorResponse('Failed to create organization', 500)
    }

    console.log(`Organization created: ${organization.id}`)

    const result: any = {
      organization
    }

    // Assign app subscriptions if provided
    if (appSubscriptions && appSubscriptions.length > 0) {
      try {
        console.log(`Assigning ${appSubscriptions.length} app subscription(s)`)

        // Get tier IDs for requested apps/tiers
        const subscriptionsToCreate = []

        for (const { appId, tierName } of appSubscriptions) {
          const { data: tier, error: tierError } = await supabase
            .from('app_tiers')
            .select('id')
            .eq('app_id', appId)
            .eq('tier_name', tierName)
            .single()

          if (!tierError && tier) {
            subscriptionsToCreate.push({
              organization_id: organization.id,
              app_id: appId,
              tier_id: tier.id,
              tier_name: tierName,
              status: 'active',
              assigned_by: user.id,
              notes: 'Assigned during organization creation'
            })
          } else {
            console.error(`Tier not found: ${appId}/${tierName}`)
          }
        }

        if (subscriptionsToCreate.length > 0) {
          const { data: subscriptions, error: subsError } = await supabase
            .from('organization_app_subscriptions')
            .insert(subscriptionsToCreate)
            .select()

          if (subsError) {
            console.error('Error creating subscriptions:', subsError)
            result.subscriptions = {
              status: 'failed',
              message: 'Organization created but subscription assignment failed'
            }
          } else {
            console.log(`Created ${subscriptions.length} subscription(s)`)
            result.subscriptions = subscriptions
          }
        } else {
          result.subscriptions = {
            status: 'error',
            message: 'No valid app/tier combinations found'
          }
        }
      } catch (subsException) {
        console.error('Exception during subscription creation:', subsException)
        result.subscriptions = {
          status: 'error',
          message: 'Organization created but subscription process encountered an error'
        }
      }
    }

    console.log(`Organization creation complete: ${organization.id}`)

    return successResponse(result)

  } catch (error) {
    console.error('Unexpected error in create-organization:', error)
    return errorResponse('Internal server error', 500)
  }
})
