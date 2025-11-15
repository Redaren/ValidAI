import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create regular client to verify user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization')
          }
        }
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      );
    }

    // Check if JWT already has enriched organization data
    const hasEnrichedData = user.app_metadata?.organization_name && user.app_metadata?.organization_role;

    if (hasEnrichedData) {
      // JWT is already enriched
      return new Response(
        JSON.stringify({
          success: true,
          already_enriched: true,
          organization_id: user.app_metadata.organization_id
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      );
    }

    // Get user's primary organization (the one set in JWT or their first organization)
    const organizationId = user.app_metadata?.organization_id;

    if (!organizationId) {
      // User has no organization_id set, find their first organization
      // Use admin client to bypass RLS (user can't query their own memberships without org context in JWT)
      const { data: firstOrg, error: firstOrgError } = await supabaseAdmin
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name
          )
        `)
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (firstOrgError || !firstOrg || !firstOrg.organizations) {
        console.error('Error fetching first organization:', firstOrgError);
        return new Response(
          JSON.stringify({
            success: true,
            no_organization: true,
            message: 'User has no organizations'
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'authorization, content-type'
            }
          }
        );
      }

      // Enrich JWT with first organization and app subscriptions
      const organization = firstOrg.organizations;

      // Fetch organization's active app subscriptions
      const { data: subscriptions } = await supabaseAdmin
        .from('organization_app_subscriptions')
        .select('app_id')
        .eq('organization_id', organization.id)
        .eq('status', 'active');

      const appSubscriptions = subscriptions?.map(sub => sub.app_id) || [];
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...user.app_metadata,
          organization_id: organization.id,
          organization_name: organization.name,
          organization_role: firstOrg.role,
          app_subscriptions: appSubscriptions,
        }
      });

      if (updateError) {
        console.error('Error enriching JWT:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to enrich JWT' }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'authorization, content-type'
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          enriched: true,
          organization: {
            id: organization.id,
            name: organization.name
          },
          role: firstOrg.role
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      );
    }

    // User has organization_id, get full organization details
    // Use admin client to bypass RLS (user can't query without org context in JWT)
    const { data: orgWithRole, error: orgError } = await supabaseAdmin
      .from('organization_members')
      .select(`
        role,
        organizations (
          id,
          name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (orgError || !orgWithRole || !orgWithRole.organizations) {
      console.error('Error fetching organization:', orgError);
      return new Response(
        JSON.stringify({ error: 'Organization not found or access denied' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      );
    }

    const organization = orgWithRole.organizations;

    // Fetch organization's active app subscriptions
    const { data: subscriptions } = await supabaseAdmin
      .from('organization_app_subscriptions')
      .select('app_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    const appSubscriptions = subscriptions?.map(sub => sub.app_id) || [];

    // Enrich JWT with organization details and app subscriptions
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        organization_id: organizationId,
        organization_name: organization.name,
        organization_role: orgWithRole.role,
        app_subscriptions: appSubscriptions,
      }
    });

    if (updateError) {
      console.error('Error enriching JWT:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to enrich JWT' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        enriched: true,
        organization: {
          id: organization.id,
          name: organization.name
        },
        role: orgWithRole.role
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type'
        }
      }
    );
  } catch (error) {
    console.error('Internal server error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type'
        }
      }
    );
  }
});
