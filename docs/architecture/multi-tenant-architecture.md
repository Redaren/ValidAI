# Multi-Tenant Architecture

ValidAI implements a multi-tenant architecture using organization-based data isolation. This document explains how the multi-tenancy is structured and operates.

## Overview

The application uses a **shared database, shared schema** multi-tenancy model where:
- All tenants share the same database and tables
- Data isolation is achieved through Row Level Security (RLS) policies
- Organization context is maintained in user JWT metadata
- Each user can belong to multiple organizations with different roles

## Database Schema

### Core Tables

#### `organizations`
```sql
- id (uuid, primary key)
- name (text, not null)
- slug (text, unique, not null)
- plan_type (text, default 'free') -- 'free', 'pro', 'enterprise'
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())
- created_by (uuid, references auth.users.id)
```

#### `organization_members`
```sql
- organization_id (uuid, references organizations.id) -- composite PK
- user_id (uuid, references auth.users.id) -- composite PK
- role (text, not null) -- 'owner', 'admin', 'member', 'viewer'
- joined_at (timestamptz, default now())
```

#### `profiles`
```sql
- id (uuid, references auth.users.id, primary key)
- full_name (text, nullable)
- avatar_url (text, nullable)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())
```

### Relationships
```
auth.users (1) ←→ (1) profiles
auth.users (1) ←→ (*) organization_members
organizations (1) ←→ (*) organization_members
```

## Security Model

### Row Level Security (RLS) Policies

All tables have RLS enabled with the following policies:

#### Organizations Table
- **SELECT**: Users can view organizations they belong to
- **INSERT**: Authenticated users can create organizations (as owner)
- **UPDATE**: Organization owners/admins can update their organizations
- **DELETE**: Only organization owners can delete organizations

#### Organization Members Table
- **SELECT**: Users can view their own memberships
- **INSERT/UPDATE/DELETE**: Users can manage their own membership records

#### Profiles Table
- **SELECT**: Authenticated users can view all profiles
- **INSERT/UPDATE**: Users can manage their own profile
- **DELETE**: Users can delete their own profile

### Current User Context

The active organization is tracked via:
```typescript
user.app_metadata.organization_id: string
```

This is stored in the user's JWT and updated when switching organizations.

## Authentication Flow

### New User Registration

1. **User Signs Up** → Triggers `handle_new_user()` function
2. **Profile Creation** → Creates user profile record
3. **Personal Organization** → Creates default organization for user
4. **Membership Assignment** → Adds user as 'owner' of their organization
5. **JWT Update** → Sets `app_metadata.organization_id` to new org

```sql
-- Simplified handle_new_user function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER -- Bypasses RLS during user creation
AS $$
BEGIN
  -- Create profile
  INSERT INTO profiles (id, full_name) VALUES (NEW.id, ...);

  -- Create personal organization
  INSERT INTO organizations (name, created_by) VALUES (..., NEW.id);

  -- Add as owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;
```

## PostgREST Database Functions

ValidAI uses database functions for complex operations involving multiple tables:

### Organization Query Functions

```sql
-- Get current organization with user role
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
-- Function implementation...

-- Get user's organizations with roles
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_slug text,
  plan_type text,
  user_role text,
  joined_at timestamp with time zone
)
-- Function implementation...

-- Create organization (atomic operation)
CREATE OR REPLACE FUNCTION create_organization(
  org_name TEXT,
  org_slug TEXT DEFAULT NULL
)
RETURNS json
-- Function implementation...
```

### Edge Functions for Service-Role Operations

**Switch Organization**: Updates JWT metadata (requires service-role key)

```typescript
// supabase/functions/switch-organization/index.ts
const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
  user.id,
  {
    app_metadata: {
      ...user.app_metadata,
      organization_id: organizationId,
    },
  }
)
```

**Invite User**: Sends email invitations with organization context

```typescript
// supabase/functions/invite-user/index.ts
const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
  email,
  {
    redirectTo: `${Deno.env.get('SITE_URL')}/auth/accept-invite`,
    data: {
      invited_to_org: organizationId,
      invited_role: role,
    },
  }
)
```

## Frontend Implementation

### State Management

```typescript
// Organization store (Zustand)
interface OrganizationState {
  currentOrganization: Organization | null
  userOrganizations: Organization[]
  currentUserRole: string | null
  // ... actions
}
```

### Data Fetching with PostgREST

```typescript
// TanStack Query hooks using PostgREST
export function useCurrentOrganization() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['current-organization'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_organization')
      if (error) throw error
      return data
    },
  })
}

export function useUserOrganizations() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_organizations')
      if (error) throw error
      return data
    },
  })
}

// Edge Function for organization switching
export function useSwitchOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (organizationId: string) => {
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
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
    },
  })
}
```

### UI Components

- `OrganizationSwitcher` - Dropdown for switching between organizations
- Role-based conditional rendering using `currentUserRole`
- Permission checks via `canManageOrganization()` helper

## Common Operations

### Adding a User to Organization

1. **Invite Flow**: Admin creates invitation
2. **User Acceptance**: User joins organization
3. **Membership Creation**: Record added to `organization_members`
4. **Permission Grant**: User gains access to organization data

### Role Hierarchy

- **Owner**: Full control, can delete organization
- **Admin**: Can manage members and settings
- **Member**: Standard access to organization resources
- **Viewer**: Read-only access

### Organization Switching Process

1. User selects organization from switcher
2. Edge Function verifies user has access via PostgREST query
3. Edge Function updates JWT `app_metadata.organization_id` using service-role client
4. Client refreshes session to get updated JWT
5. Client invalidates and refetches queries with new organization context
6. RLS policies automatically filter data for new organization

**Complete Flow**:
```typescript
// 1. Client calls Edge Function
const { data } = await supabase.functions.invoke('switch-organization', {
  body: { organizationId }
})

// 2. Edge Function validates and updates JWT metadata
// 3. Client refreshes session
const { error } = await supabase.auth.refreshSession()

// 4. All subsequent PostgREST calls use new organization context
```

## Security Considerations

### Current Issues Resolved

1. **Infinite Recursion** ✅
   - Fixed by removing complex cross-table RLS policies
   - Simplified to user-scoped policies only

2. **Function Security** ✅
   - All functions use `SECURITY DEFINER` or `SECURITY INVOKER` appropriately
   - Fixed search_path vulnerabilities

3. **Data Exposure** ✅
   - All tables have RLS enabled
   - Proper policies prevent unauthorized access

### Best Practices

- **Minimal Privileges**: RLS policies grant minimum necessary access
- **Context Isolation**: Organization data is properly isolated
- **Audit Trail**: Track membership changes and role assignments
- **Input Validation**: All organization operations validate user permissions

### Known Limitations

- **Cross-Organization Queries**: Users cannot access data across organizations simultaneously
- **JWT Size**: Organization context stored in JWT (size limitations for many organizations)
- **Edge Function Latency**: Organization switching has slight latency due to JWT refresh requirement
- **Service-Role Security**: Edge Functions require careful input validation to prevent privilege escalation

## Troubleshooting

### Common Issues

1. **User sees no organizations**: Check `organization_members` table
2. **Permission denied**: Verify RLS policies and user role
3. **Switch fails**: Ensure user has membership in target organization
4. **Data not visible**: Confirm `app_metadata.organization_id` is set correctly

### Debugging Queries

```sql
-- Check user's organization memberships
SELECT om.*, o.name
FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
WHERE om.user_id = 'user-uuid';

-- Verify RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Check current user context
SELECT auth.uid(), auth.jwt() -> 'app_metadata' ->> 'organization_id';
```

This architecture provides secure, scalable multi-tenancy while maintaining data isolation and flexible organization management.