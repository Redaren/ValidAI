import { createAdminClient } from '../../_shared/supabaseAdmin.ts'
import { handleCors } from '../../_shared/cors.ts'
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, conflictResponse } from '../../_shared/response.ts'
import { getUserFromRequest, isPlayzeAdmin } from '../../_shared/auth.ts'
import { validateRequired, validateEmail, validateSlug } from '../../_shared/validation.ts'

/**
 * Edge Function: admin/create-organization
 *
 * Purpose: Create organization with optional initial owner invitation (Playze admin only)
 *
 * Method: POST
 * Auth: Requires Playze admin user
 *
 * Input:
 * {
 *   "name": "Acme Corp",
 *   "description": "Optional description",      // Optional
 *   "initialOwnerEmail": "owner@acme.com",     // Optional
 *   "appSubscriptions": [                       // Optional
 *     { "appId": "roadcloud", "tierName": "pro" }
 *   ]
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "data": {
 *     "organization": { ... },
 *     "invitation": { ... },      // If initialOwnerEmail provided
 *     "subscriptions": [ ... ]    // If appSubscriptions provided
 *   }
 * }
 *
 * Usage:
 * const { data, error } = await supabase.functions.invoke('create-organization', {
 *   body: {
 *     name: 'Acme Corp',
 *     description: 'Optional description',
 *     initialOwnerEmail: 'owner@acme.com',  // Optional
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
      initialOwnerEmail,
      appSubscriptions
    } = await req.json()

    const validationError = validateRequired({ name }, ['name'])
    if (validationError) {
      return errorResponse(validationError)
    }

    // Validate initial owner email if provided
    if (initialOwnerEmail && !validateEmail(initialOwnerEmail)) {
      return errorResponse('Invalid email format for initial owner')
    }

    console.log(`Admin ${user.email} creating organization: ${name}`)

    // Step 1: Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        description: description || null,
        is_active: true
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

    // Step 2: Invite initial owner if email provided
    if (initialOwnerEmail) {
      try {
        console.log(`Inviting initial owner: ${initialOwnerEmail}`)

        // Create invitation record first
        const { error: inviteRecordError } = await supabase
          .from('organization_invitations')
          .insert({
            organization_id: organization.id,
            email: initialOwnerEmail,
            role: 'owner',
            status: 'pending',
            invited_by: user.id
          })

        if (inviteRecordError) {
          console.error('Error creating invitation record:', inviteRecordError)
          // Continue - org created successfully, just log the error
        }

        // Send invitation email via Supabase Auth
        // Supabase will automatically send the email
        const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
          initialOwnerEmail,
          {
            data: {
              organization_id: organization.id,
              organization_name: organization.name,
              role: 'owner'
            },
            redirectTo: `${Deno.env.get('SITE_URL')}/auth/accept-invite`
          }
        )

        if (inviteError) {
          console.error('Error sending invitation email:', inviteError)
          result.invitation = {
            email: initialOwnerEmail,
            status: 'failed',
            message: 'Organization created but invitation email failed to send. You can retry invitation later.'
          }
        } else {
          console.log(`Invitation email sent to ${initialOwnerEmail}`)
          result.invitation = {
            email: initialOwnerEmail,
            status: 'sent',
            message: 'Invitation email sent successfully'
          }
        }
      } catch (inviteException) {
        console.error('Exception during invitation:', inviteException)
        result.invitation = {
          email: initialOwnerEmail,
          status: 'error',
          message: 'Organization created but invitation process encountered an error'
        }
      }
    }

    // Step 3: Assign app subscriptions if provided
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
