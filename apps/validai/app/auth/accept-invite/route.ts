import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@playze/shared-auth/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const token_hash = requestUrl.searchParams.get('token_hash')
    const type = requestUrl.searchParams.get('type')

    if (!token_hash || type !== 'invite') {
      return NextResponse.redirect(new URL('/auth/error', request.url))
    }

    const supabase = await createServerClient()

    // Verify the invitation token
    const { data: { user }, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: 'invite',
    })

    if (error || !user) {
      console.error('Error verifying invitation:', error)
      return NextResponse.redirect(new URL('/auth/error', request.url))
    }

    // Get invitation details from user_metadata
    const orgId = user.user_metadata?.invited_to_org
    const role = user.user_metadata?.invited_role
    const organizationName = user.user_metadata?.organization_name

    if (!orgId || !role) {
      console.error('Invalid invitation data in user metadata')
      return NextResponse.redirect(new URL('/auth/error', request.url))
    }

    // Verify the organization exists
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single()

    if (orgError || !organization) {
      console.error('Organization not found:', orgError)
      return NextResponse.redirect(new URL('/auth/error', request.url))
    }

    // Add user as member of the organization
    const { error: membershipError } = await supabase
      .from('organization_members')
      .upsert({
        organization_id: orgId,
        user_id: user.id,
        role: role,
      })

    if (membershipError) {
      console.error('Error creating organization membership:', membershipError)
      return NextResponse.redirect(new URL('/auth/error', request.url))
    }

    // Update user's app_metadata with the organization_id using admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          organization_id: orgId,
        },
        user_metadata: {
          // Clear invitation data from user_metadata
          ...user.user_metadata,
          invited_to_org: undefined,
          invited_role: undefined,
          organization_name: undefined,
          invited_by: undefined,
        },
      }
    )

    if (updateError) {
      console.error('Error updating user metadata:', updateError)
      // Continue anyway as the membership was created
    }

    // Redirect to dashboard with success message
    const dashboardUrl = new URL('/dashboard', request.url)
    dashboardUrl.searchParams.set('invited', 'true')
    dashboardUrl.searchParams.set('org', organizationName || organization.name)

    return NextResponse.redirect(dashboardUrl)
  } catch (error) {
    console.error('Error in accept invitation route:', error)
    return NextResponse.redirect(new URL('/auth/error', request.url))
  }
}