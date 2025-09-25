# ValidAI: Backend API to PostgREST Migration Plan

## Executive Summary

This document outlines the migration strategy from custom Next.js API routes to direct Supabase PostgREST access for the ValidAI boilerplate. This migration establishes the correct architecture from the beginning, reducing codebase by ~70% and unlocking Supabase's full feature set for developers building upon this foundation.

## Current Architecture Problems

### What We Have
```
Client → Next.js API Routes → Server Supabase Client → PostgREST → Postgres
```

### What We Should Have
```
Client → PostgREST → Postgres (with RLS)
```

### The Issue
The current boilerplate uses Supabase as an expensive hosted Postgres database rather than leveraging it as a complete Backend-as-a-Service platform. This teaches developers the wrong architectural patterns from the start.

## Current State Analysis

### API Routes Inventory (9 total routes)

| Route | Purpose | Service Role Required | Complex Logic | Migration Strategy |
|-------|---------|---------------------|---------------|-------------------|
| `/api/organizations` | Get user organizations | ❌ | ❌ | → Direct PostgREST |
| `/api/organizations/current` | Get current organization | ❌ | ❌ | → Direct PostgREST |
| `/api/organizations/[id]/members` | Get organization members | ❌ | ❌ | → Direct PostgREST |
| `/api/organizations/create` | Create organization + membership | ❌ | ✅ Multi-table | → Database function |
| `/api/organizations/switch` | Switch organization | ✅ Update app_metadata | ✅ JWT refresh | → Edge Function |
| `/api/organizations/invite` | Send invitations | ✅ Admin operations | ✅ Email sending | → Edge Function |
| `/api/admin/migrate-users` | Migration tool | ✅ Bulk updates | ✅ Admin only | → Keep as-is |
| `/auth/confirm` | Email confirmation | ❌ | ❌ Auth flow | → Keep (Auth flow) |
| `/auth/accept-invite` | Accept invitation | ✅ Update metadata | ✅ Multi-step | → Edge Function |

### Files to be Modified/Deleted

#### Files to DELETE (7 files, ~800 lines of code)
```
❌ app/api/organizations/route.ts
❌ app/api/organizations/current/route.ts
❌ app/api/organizations/[id]/members/route.ts
❌ app/api/organizations/create/route.ts
❌ app/queries/organizations/get-organizations.ts (server functions)
```

#### Files to CONVERT to Edge Functions (3 files)
```
🔄 app/api/organizations/switch/route.ts → edge_functions/switch-organization.ts
🔄 app/api/organizations/invite/route.ts → edge_functions/invite-user.ts
🔄 app/auth/accept-invite/route.ts → edge_functions/accept-invite.ts
```

#### Files to KEEP (2 files)
```
✅ app/api/admin/migrate-users/route.ts (Admin tool)
✅ app/auth/confirm/route.ts (Standard auth flow)
```

#### Files to UPDATE (5+ files)
```
🔧 app/queries/organizations/use-organizations.ts → Use Supabase client
🔧 components/session-info-card.tsx → Direct Supabase queries
🔧 All components using fetch() → Use Supabase client
```

## Migration Phases

## Phase 1: Database Functions for Complex Operations

**Purpose**: Replace API routes that handle multi-table operations

```sql
-- FUNCTION: Create organization (atomic operation)
CREATE OR REPLACE FUNCTION create_organization(
  org_name TEXT,
  org_slug TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  final_slug TEXT;
  result json;
BEGIN
  -- Validate user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Generate unique slug using existing function
  IF org_slug IS NULL THEN
    final_slug := generate_unique_org_slug(org_name);
  ELSE
    -- Validate provided slug is unique
    IF EXISTS (SELECT 1 FROM organizations WHERE slug = org_slug) THEN
      final_slug := generate_unique_org_slug(org_slug);
    ELSE
      final_slug := org_slug;
    END IF;
  END IF;

  -- Create organization
  INSERT INTO organizations (name, slug, created_by)
  VALUES (org_name, final_slug, auth.uid())
  RETURNING id INTO new_org_id;

  -- Add creator as owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, auth.uid(), 'owner');

  -- Return the created organization
  SELECT row_to_json(o.*) INTO result
  FROM organizations o
  WHERE o.id = new_org_id;

  RETURN result;
END;
$$;

-- FUNCTION: Get current organization with user role
CREATE OR REPLACE FUNCTION get_current_organization()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_slug text,
  plan_type text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by uuid,
  user_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Get org_id from JWT metadata
  org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID;

  IF org_id IS NULL THEN
    RETURN;
  END IF;

  -- Get organization with user's role
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan_type,
    o.created_at,
    o.updated_at,
    o.created_by,
    om.role
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE o.id = org_id
  AND om.user_id = auth.uid();
END;
$$;

-- FUNCTION: Get user's organizations with roles
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_slug text,
  plan_type text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by uuid,
  user_role text,
  joined_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan_type,
    o.created_at,
    o.updated_at,
    o.created_by,
    om.role,
    om.joined_at
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid();
END;
$$;

-- FUNCTION: Get organization members with profiles
CREATE OR REPLACE FUNCTION get_organization_members(org_id UUID)
RETURNS TABLE(
  organization_id uuid,
  user_id uuid,
  role text,
  joined_at timestamp with time zone,
  full_name text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  RETURN QUERY
  SELECT
    om.organization_id,
    om.user_id,
    om.role,
    om.joined_at,
    p.full_name,
    p.avatar_url
  FROM organization_members om
  JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = org_id;
END;
$$;
```

### Grant Appropriate Permissions

```sql
-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_organization(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_members(UUID) TO authenticated;
```

## Phase 2: Edge Functions for Service-Role Operations

### 2.1 Organization Switching Edge Function

**File**: `supabase/functions/switch-organization/index.ts`

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { organizationId } = await req.json()

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create regular client to verify user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
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
      )
    }

    // Verify user has access to organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({ error: 'No access to this organization' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    // Update user app_metadata with new organization_id
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          organization_id: organizationId,
        },
      }
    )

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to switch organization' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        organizationId,
        role: membership.role,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type'
        }
      }
    )
  } catch (error) {
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
    )
  }
})
```

### 2.2 User Invitation Edge Function

**File**: `supabase/functions/invite-user/index.ts`

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { email, organizationId, role } = await req.json()

    // Validate input
    const validRoles = ['admin', 'member', 'viewer']
    if (!email || !organizationId || !validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid input' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    // Create clients
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify current user can invite
    const { data: { user }, error: userError } = await supabase.auth.getUser()
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
      )
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    // Get organization details
    const { data: organization } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', organizationId)
      .single()

    if (!organization) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    // Send invitation
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${Deno.env.get('SITE_URL')}/auth/accept-invite`,
        data: {
          invited_to_org: organizationId,
          invited_role: role,
          organization_name: organization.name,
          invited_by: user.email,
        },
      }
    )

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: 'Failed to send invitation' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitation: {
          email,
          organizationId,
          role,
          organizationName: organization.name,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type'
        }
      }
    )
  } catch (error) {
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
    )
  }
})
```

## Phase 3: Client-Side Migration

### 3.1 Update TanStack Query Hooks

**File**: `app/queries/organizations/use-organizations.ts`

**Before (API Routes):**
```typescript
export function useUserOrganizations() {
  return useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      const response = await fetch('/api/organizations')
      if (!response.ok) {
        throw new Error('Failed to fetch user organizations')
      }
      return response.json()
    }
  })
}
```

**After (PostgREST):**
```typescript
export function useUserOrganizations() {
  const supabase = createClient()
  const { setUserOrganizations, setIsLoading } = useOrganizationStore()

  return useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      setIsLoading(true)
      try {
        // Call database function for complex query
        const { data, error } = await supabase.rpc('get_user_organizations')

        if (error) throw error

        setUserOrganizations(data.organizations)
        return data
      } finally {
        setIsLoading(false)
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCurrentOrganization() {
  const supabase = createClient()
  const { setCurrentOrganization, setCurrentUserRole, setIsLoading } = useOrganizationStore()

  return useQuery({
    queryKey: ['current-organization'],
    queryFn: async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_current_organization')

        if (error) throw error

        if (data) {
          setCurrentOrganization(data.organization)
          setCurrentUserRole(data.role)
        } else {
          setCurrentOrganization(null)
          setCurrentUserRole(null)
        }
        return data
      } finally {
        setIsLoading(false)
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useOrganizationMembers(organizationId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return []

      const { data, error } = await supabase.rpc(
        'get_organization_members',
        { org_id: organizationId }
      )

      if (error) throw error
      return data
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const { data: result, error } = await supabase.rpc(
        'create_organization',
        {
          org_name: data.name,
          org_slug: data.slug
        }
      )

      if (error) throw error
      return result
    },
    onSuccess: () => {
      // Refresh organization queries
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
    },
  })
}

export function useSwitchOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { setIsSwitching } = useOrganizationStore()

  return useMutation({
    mutationFn: async (organizationId: string) => {
      setIsSwitching(true)

      // Call Edge Function for org switching
      const { data, error } = await supabase.functions.invoke('switch-organization', {
        body: { organizationId },
      })

      if (error) throw error

      // Refresh session to get new JWT
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError

      return data
    },
    onSuccess: () => {
      // Invalidate and refetch organization queries
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })

      setIsSwitching(false)

      // Reload page to ensure all components get new context
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    },
    onError: () => {
      setIsSwitching(false)
    },
  })
}

export function useInviteUser() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: {
      email: string
      organizationId: string
      role: 'admin' | 'member' | 'viewer'
    }) => {
      const { data: result, error } = await supabase.functions.invoke('invite-user', {
        body: data,
      })

      if (error) throw error
      return result
    },
    onSuccess: (_, variables) => {
      // Refresh organization members query
      queryClient.invalidateQueries({
        queryKey: ['organization-members', variables.organizationId]
      })
    },
  })
}
```

### 3.2 Update Components to Use Supabase Client

**File**: `components/session-info-card.tsx`

**Before (Mixed approach):**
```typescript
// Fetching organizations via API endpoint
const orgResponse = await fetch('/api/organizations')
if (orgResponse.ok) {
  const orgData = await orgResponse.json()
  organizations = orgData.organizations || []
}
```

**After (Direct Supabase):**
```typescript
// Direct Supabase query
const { data: orgData } = await supabase.rpc('get_user_organizations')
organizations = orgData?.organizations || []
```

### 3.3 Enable Real-time Subscriptions

**New capability**: Listen to organization changes in real-time

```typescript
export function useOrganizationSubscription() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('organizations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organizations',
        },
        () => {
          // Invalidate queries when data changes
          queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
          queryClient.invalidateQueries({ queryKey: ['current-organization'] })
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [queryClient, supabase])
}
```

## Architecture Setup Timeline

### Phase 1: Database Functions
- [ ] Create database functions for complex operations
- [ ] Grant appropriate permissions
- [ ] Test functions work correctly

### Phase 2: Edge Functions
- [ ] Create switch-organization Edge Function
- [ ] Create invite-user Edge Function
- [ ] Create accept-invite Edge Function
- [ ] Deploy Edge Functions

### Phase 3: Client Migration
- [ ] Update organization queries to use PostgREST
- [ ] Update mutations to use database functions
- [ ] Update service-role operations to use Edge Functions
- [ ] Remove obsolete API routes

## Expected Benefits

### Performance Improvements
- **Response time**: ~200ms → ~100ms (2x improvement)
- **Bundle size**: Smaller (no server-side API logic)
- **Caching**: Built-in Supabase caching vs manual TanStack Query

### Code Reduction
- **API routes**: 9 → 2-3 (-70% reduction)
- **Total backend code**: ~1500 lines → ~500 lines (-66% reduction)
- **Maintenance overhead**: Significantly reduced

### New Capabilities
- ✅ Real-time subscriptions
- ✅ Automatic caching and invalidation
- ✅ Built-in optimizations (query batching, etc.)
- ✅ GraphQL support (future)

### Developer Experience
- Simpler architecture
- Less context switching between frontend/backend
- Leveraging Supabase's full feature set
- Better TypeScript integration

## Boilerplate Benefits

### For Developers Using This Template
- **Correct architecture from day 1** - No need to refactor later
- **Best practices built-in** - Follows Supabase recommended patterns
- **Reduced learning curve** - See how PostgREST should be used
- **Performance by default** - 2x faster than API-heavy patterns
- **Real-time ready** - Architecture supports subscriptions out of the box

### For Development Teams
- **Less backend code to maintain** - 70% reduction in server logic
- **Faster feature development** - Direct database operations
- **Better TypeScript integration** - Generated types work seamlessly
- **Simplified deployment** - Fewer moving parts

## Conclusion

This migration establishes the ValidAI boilerplate with the correct Supabase architecture from the beginning. Rather than teaching developers to build unnecessary API layers, the boilerplate will demonstrate the proper use of PostgREST, database functions, and Edge Functions.

Developers using this template will start with:
- **Direct PostgREST access** for all database operations
- **Database functions** for complex business logic
- **Edge Functions** for service-role operations
- **Real-time capabilities** built-in

This creates a foundation that scales properly and follows Supabase best practices from day one.