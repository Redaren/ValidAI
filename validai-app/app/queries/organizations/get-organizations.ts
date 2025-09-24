import { createClient } from '@/lib/supabase/server'
import type { Organization } from '@/stores'

export async function getUserOrganizations() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    // Get all organizations the user is a member of
    const { data: memberships, error: membershipError } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        role,
        joined_at,
        organizations!inner (
          id,
          name,
          slug,
          plan_type,
          created_at,
          updated_at,
          created_by
        )
      `)
      .eq('user_id', user.id)

    if (membershipError) {
      throw membershipError
    }

    // Transform the data to match our Organization type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizations: Organization[] = memberships?.map((membership: any) => ({
      id: membership.organizations.id,
      name: membership.organizations.name,
      slug: membership.organizations.slug,
      plan_type: membership.organizations.plan_type,
      created_at: membership.organizations.created_at,
      updated_at: membership.organizations.updated_at,
      created_by: membership.organizations.created_by,
    })) || []

    return {
      organizations,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memberships: memberships?.map((m: any) => ({
        organization_id: m.organization_id,
        user_id: user.id,
        role: m.role,
        joined_at: m.joined_at,
      })) || []
    }
  } catch (error) {
    console.error('Error fetching user organizations:', error)
    throw error
  }
}

export async function getCurrentOrganization() {
  const supabase = await createClient()

  try {
    // Get current user and their JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    // Get organization_id from app_metadata
    const organizationId = user.app_metadata?.organization_id

    if (!organizationId) {
      return null
    }

    // Fetch the organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single()

    if (orgError) {
      throw orgError
    }

    // Get user's role in this organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (membershipError) {
      throw membershipError
    }

    return {
      organization: organization as Organization,
      role: membership?.role || null
    }
  } catch (error) {
    console.error('Error fetching current organization:', error)
    throw error
  }
}

export async function getOrganizationMembers(organizationId: string) {
  const supabase = await createClient()

  try {
    const { data: members, error } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        user_id,
        role,
        joined_at,
        profiles!inner (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('organization_id', organizationId)

    if (error) {
      throw error
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return members?.map((member: any) => ({
      organization_id: member.organization_id,
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      profile: member.profiles
    })) || []
  } catch (error) {
    console.error('Error fetching organization members:', error)
    throw error
  }
}