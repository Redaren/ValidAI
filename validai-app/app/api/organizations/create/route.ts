import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { name, slug } = await request.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Organization name is required' },
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

    // Generate unique slug if not provided
    let organizationSlug = slug
    if (!organizationSlug) {
      // Create slug from name
      organizationSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      // Ensure unique slug
      let counter = 0
      const baseSlug = organizationSlug

      while (true) {
        const { data: existing } = await supabase
          .from('organizations')
          .select('id')
          .eq('slug', organizationSlug)
          .single()

        if (!existing) break

        counter++
        organizationSlug = `${baseSlug}-${counter}`
      }
    }

    // Create the organization
    const { data: organization, error: createError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        slug: organizationSlug,
        created_by: user.id,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating organization:', createError)
      return NextResponse.json(
        { error: 'Failed to create organization' },
        { status: 500 }
      )
    }

    // Add user as owner of the organization
    const { error: membershipError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner',
      })

    if (membershipError) {
      console.error('Error creating organization membership:', membershipError)
      // Try to clean up the organization if membership creation failed
      await supabase
        .from('organizations')
        .delete()
        .eq('id', organization.id)

      return NextResponse.json(
        { error: 'Failed to create organization membership' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      organization,
    })
  } catch (error) {
    console.error('Error in create organization API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}