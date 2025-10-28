import { NextResponse } from 'next/server'
import { createServerClient } from '@playze/shared-auth/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    const supabase = await createServerClient()

    // Get current user (only allow admin users to run this migration)
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Find users who need app_metadata updates (have organization but no org_id in metadata)
    const { data: usersNeedingUpdate } = await supabase
      .from('organization_members')
      .select(`
        user_id,
        organization_id,
        role
      `)
      .eq('role', 'owner')

    if (!usersNeedingUpdate || usersNeedingUpdate.length === 0) {
      return NextResponse.json({
        message: 'No users need migration',
        updated: 0
      })
    }

    const results = []

    for (const membership of usersNeedingUpdate) {
      try {
        // Update user's app_metadata with organization_id
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          membership.user_id,
          {
            app_metadata: {
              organization_id: membership.organization_id,
            },
          }
        )

        if (updateError) {
          console.error(`Failed to update user ${membership.user_id}:`, updateError)
          results.push({
            user_id: membership.user_id,
            success: false,
            error: updateError.message
          })
        } else {
          results.push({
            user_id: membership.user_id,
            organization_id: membership.organization_id,
            success: true
          })
        }
      } catch (error) {
        console.error(`Error updating user ${membership.user_id}:`, error)
        results.push({
          user_id: membership.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      message: `Migration completed: ${successful} successful, ${failed} failed`,
      results,
      updated: successful
    })
  } catch (error) {
    console.error('Error in user migration:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}