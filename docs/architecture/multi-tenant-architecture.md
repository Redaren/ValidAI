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

## API Endpoints

### Organization Management

```typescript
// Get current organization context
GET /api/organizations/current
// Returns: { organization, role }

// Get user's organizations
GET /api/organizations
// Returns: { organizations, memberships }

// Switch organization context
POST /api/organizations/switch
Body: { organizationId: string }
// Updates user's JWT app_metadata

// Create new organization
POST /api/organizations/create
Body: { name: string }

// Get organization members
GET /api/organizations/[id]/members
```

### Organization Switching Process

```typescript
// 1. Verify user has access to target organization
const membership = await supabase
  .from('organization_members')
  .select('role')
  .eq('organization_id', organizationId)
  .eq('user_id', user.id)
  .single()

// 2. Update JWT metadata using admin client
await supabaseAdmin.auth.admin.updateUserById(user.id, {
  app_metadata: {
    ...user.app_metadata,
    organization_id: organizationId,
  },
})
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

### Data Fetching

```typescript
// TanStack Query hooks
useCurrentOrganization() // Fetches current org from JWT context
useUserOrganizations()   // Fetches all user's organizations
useSwitchOrganization()  // Mutation for switching context
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

### Organization Switching

1. User selects organization from switcher
2. API verifies user has access
3. JWT `app_metadata.organization_id` updated
4. Client refetches data with new context
5. RLS policies filter data for new organization

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

- **Admin Management**: Organization admins cannot directly manage members (application-level only)
- **Cross-Organization Queries**: Users cannot access data across organizations simultaneously
- **JWT Size**: Organization context stored in JWT (size limitations for many orgs)

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