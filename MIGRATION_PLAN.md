# ValidAI: Backend API to PostgREST Migration Plan

## Executive Summary

This document outlines the complete migration strategy from custom Next.js API routes to direct Supabase PostgREST access. The migration will reduce our codebase by ~70%, improve performance by ~2x, and unlock Supabase's full feature set including real-time subscriptions, automatic caching, and built-in optimizations.

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
We're using Supabase as an expensive hosted Postgres database rather than leveraging it as a complete Backend-as-a-Service platform. We've essentially rebuilt what Supabase already provides through PostgREST.

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

## Phase 1: Database Layer Preparation

### 1.1 Fix RLS Policies

**Current Issue**: `organization_members` has overly permissive policy
**Solution**: Replace with granular, role-based policies

```sql
-- Drop generic policy
DROP POLICY IF EXISTS "Users can manage their own membership" ON organization_members;

-- CREATE GRANULAR POLICIES

-- SELECT: Users can view members of organizations they belong to
CREATE POLICY "View organization members" ON organization_members
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);

-- INSERT: Only owners/admins can add members
CREATE POLICY "Admins can add members" ON organization_members
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members existing
    WHERE existing.organization_id = organization_members.organization_id
    AND existing.user_id = auth.uid()
    AND existing.role IN ('owner', 'admin')
  )
);

-- UPDATE: Only owners/admins can update member roles
CREATE POLICY "Admins can update members" ON organization_members
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM organization_members existing
    WHERE existing.organization_id = organization_members.organization_id
    AND existing.user_id = auth.uid()
    AND existing.role IN ('owner', 'admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members existing
    WHERE existing.organization_id = organization_members.organization_id
    AND existing.user_id = auth.uid()
    AND existing.role IN ('owner', 'admin')
  )
);

-- DELETE: Only owners can remove members
CREATE POLICY "Owners can remove members" ON organization_members
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM organization_members existing
    WHERE existing.organization_id = organization_members.organization_id
    AND existing.user_id = auth.uid()
    AND existing.role = 'owner'
  )
);
```

### 1.2 Create Database Functions for Complex Operations

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

  -- Generate slug if not provided
  IF org_slug IS NULL THEN
    final_slug := lower(regexp_replace(org_name, '[^a-z0-9]+', '-', 'g'));
    final_slug := trim(both '-' from final_slug);
  ELSE
    final_slug := org_slug;
  END IF;

  -- Ensure unique slug
  DECLARE
    counter INTEGER := 0;
    base_slug TEXT := final_slug;
  BEGIN
    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
  END;

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
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
  result json;
BEGIN
  -- Get org_id from JWT metadata
  org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID;

  IF org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get organization with user's role
  SELECT json_build_object(
    'organization', row_to_json(o.*),
    'role', om.role
  ) INTO result
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE o.id = org_id
  AND om.user_id = auth.uid();

  RETURN result;
END;
$$;

-- FUNCTION: Get user's organizations with roles
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'organizations', COALESCE(json_agg(
      json_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'plan_type', o.plan_type,
        'created_at', o.created_at,
        'updated_at', o.updated_at,
        'created_by', o.created_by,
        'role', om.role,
        'joined_at', om.joined_at
      )
    ), '[]'::json)
  ) INTO result
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid();

  RETURN result;
END;
$$;

-- FUNCTION: Get organization members with profiles
CREATE OR REPLACE FUNCTION get_organization_members(org_id UUID)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'organization_id', om.organization_id,
      'user_id', om.user_id,
      'role', om.role,
      'joined_at', om.joined_at,
      'profile', json_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url
      )
    )
  ), '[]'::json) INTO result
  FROM organization_members om
  JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = org_id;

  RETURN result;
END;
$$;
```

### 1.3 Grant Appropriate Permissions

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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
        { status: 401, headers: { 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { 'Content-Type': 'application/json' } }
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
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        organizationId,
        role: membership.role,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

### 2.2 User Invitation Edge Function

**File**: `supabase/functions/invite-user/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { email, organizationId, role } = await req.json()

    // Validate input
    const validRoles = ['admin', 'member', 'viewer']
    if (!email || !organizationId || !validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid input' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { 'Content-Type': 'application/json' } }
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
        { status: 404, headers: { 'Content-Type': 'application/json' } }
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
        { status: 500, headers: { 'Content-Type': 'application/json' } }
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
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
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

## Phase 4: Testing Strategy

### 4.1 Unit Tests
- Mock Supabase client instead of fetch
- Test RLS policies with different user roles
- Validate database functions

### 4.2 Integration Tests
- Test complete user flows with new architecture
- Verify Edge Functions work correctly
- Test real-time subscriptions

### 4.3 Migration Testing
- Run both old and new approaches in parallel
- Compare results for consistency
- Performance benchmarking

## Phase 5: Deployment Strategy

### 5.1 Feature Flags
Use environment variables to gradually roll out new architecture:

```typescript
const USE_POSTGREST = process.env.NEXT_PUBLIC_USE_POSTGREST === 'true'

export function useUserOrganizations() {
  if (USE_POSTGREST) {
    return useUserOrganizationsPostgREST()
  } else {
    return useUserOrganizationsAPI()
  }
}
```

### 5.2 Rollback Plan
- Keep API routes until migration is complete and tested
- Use feature flags to quickly switch back if issues arise
- Monitor error rates and performance metrics

## Implementation Timeline

### Week 1: Database Foundation
- [ ] Deploy new RLS policies
- [ ] Create and test database functions
- [ ] Validate policies with different user scenarios

### Week 2: Edge Functions
- [ ] Create switch-organization Edge Function
- [ ] Create invite-user Edge Function
- [ ] Create accept-invite Edge Function
- [ ] Test Edge Functions thoroughly

### Week 3: Client Migration (Read Operations)
- [ ] Update organization listing
- [ ] Update current organization fetching
- [ ] Update member listing
- [ ] Enable feature flags for gradual rollout

### Week 4: Client Migration (Write Operations)
- [ ] Update organization creation
- [ ] Update organization switching
- [ ] Update user invitations
- [ ] Test complete user workflows

### Week 5: Testing & Cleanup
- [ ] Comprehensive testing of all flows
- [ ] Performance benchmarking
- [ ] Remove old API routes
- [ ] Update documentation

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

## Risk Mitigation

### Security Considerations
- ✅ Comprehensive RLS policies prevent unauthorized access
- ✅ Edge Functions handle service-role operations securely
- ✅ No direct service key exposure to frontend

### Data Integrity
- ✅ Database functions ensure atomic operations
- ✅ RLS policies prevent data corruption
- ✅ Transactions handle multi-table operations

### Backwards Compatibility
- ✅ Feature flags allow gradual rollout
- ✅ API routes remain until migration complete
- ✅ Rollback plan if issues arise

## Success Metrics

### Technical Metrics
- [ ] Response time improvement: Target 2x faster
- [ ] Code reduction: Target 70% less backend code
- [ ] Bundle size: Target 20% reduction
- [ ] Error rate: Maintain < 0.1%

### User Experience
- [ ] Real-time updates working
- [ ] No regression in functionality
- [ ] Improved perceived performance
- [ ] Successful migration of all user workflows

## Conclusion

This migration will transform ValidAI from a traditional backend-heavy architecture to a modern, Supabase-native application that fully leverages PostgREST, RLS, and real-time capabilities. The result will be a more maintainable, performant, and scalable application that truly utilizes Supabase as intended.

The phased approach ensures minimal risk while delivering significant benefits in terms of performance, maintainability, and developer experience.