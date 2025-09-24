import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin client for sending invitations
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { email, organizationId, role } = await request.json()

    // Validate input
    if (!email || !organizationId || !role) {
      return NextResponse.json(
        { error: 'Email, organization ID, and role are required' },
        { status: 400 }
      )
    }

    const validRoles = ['admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Verify user can manage this organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'Organization not found or no access' },
        { status: 403 }
      )
    }

    const canInvite = membership.role === 'owner' || membership.role === 'admin'
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Insufficient permissions to invite users' },
        { status: 403 }
      )
    }

    // Get organization details for the invitation
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', organizationId)
      .single()

    if (orgError || !organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Check if user with this email exists and is already a member
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
    const userWithEmail = existingUser.users.find(u => u.email === email)

    if (userWithEmail) {
      const { data: existingMembership } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId)
        .eq('user_id', userWithEmail.id)
        .single()

      if (existingMembership) {
        return NextResponse.json(
          { error: 'User is already a member of this organization' },
          { status: 409 }
        )
      }
    }


    // Send invitation using Supabase admin client
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/accept-invite`,
        data: {
          invited_to_org: organizationId,
          invited_role: role,
          organization_name: organization.name,
          invited_by: user.email,
        },
      }
    )

    if (inviteError) {
      console.error('Error sending invitation:', inviteError)
      return NextResponse.json(
        { error: 'Failed to send invitation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      invitation: {
        email,
        organizationId,
        role,
        organizationName: organization.name,
      },
    })
  } catch (error) {
    console.error('Error in invite user API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}