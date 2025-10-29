# Playze Core - Elevated Access Architecture

## Overview

Playze Core uses **two separate patterns** for database access depending on privilege level:

1. **Regular User Access** - Uses PostgREST with RLS policies
2. **Admin Access** - Uses SECURITY DEFINER functions that bypass RLS

## Regular User Access (Standard Pattern)

**When to use:** All regular user operations in platform apps (RoadCloud, ProjectX, etc.)

**How it works:**
```typescript
// Frontend: Direct PostgREST queries
const { data } = await supabase
  .from('organizations')
  .select('*')
```

**Security:** Row Level Security (RLS) policies enforce data isolation
- Policies check `auth.uid()` and `organization_members` table
- Users only see data for their organizations
- PostgreSQL enforces policies automatically

## Admin Access (Elevated Pattern)

**When to use:** Admin Portal operations that need to bypass RLS

**Why needed:** RLS policies can cause infinite recursion when:
- Admin needs to access ALL organizations (not just their own)
- Policies query `organization_members` which has its own RLS policy
- This creates circular dependency: `organizations` → `organization_members` → `organization_members` (infinite loop)

**How it works:**
```typescript
// Frontend: Call database function via RPC
const { data } = await supabase.rpc('admin_list_organizations')
```

```sql
-- Backend: SECURITY DEFINER function
CREATE FUNCTION admin_list_organizations()
RETURNS TABLE (...)
SECURITY DEFINER  -- ← Runs with elevated privileges, bypasses RLS
SET search_path = public
AS $$
BEGIN
  -- 1. Check authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all organizations';
  END IF;

  -- 2. Query data without RLS restrictions
  RETURN QUERY
  SELECT * FROM organizations;  -- No RLS evaluation
END;
$$;
```

**Key components:**
- `SECURITY DEFINER` - Function runs with database owner privileges (bypasses RLS)
- `is_playze_admin()` - Helper function that checks if user email is in admin whitelist
- `SET search_path = public` - Security best practice to prevent schema hijacking

## Admin Function Checklist

When creating admin operations, always:

1. ✅ **Create SECURITY DEFINER function** (not Edge Function, not direct PostgREST)
2. ✅ **Check `is_playze_admin()` first** - Authorization before data access
3. ✅ **Use `SET search_path = public`** - Security requirement for DEFINER functions
4. ✅ **Grant EXECUTE to authenticated** - Let function handle authorization internally
5. ✅ **Frontend uses `supabase.rpc()`** - Never use `.from()` for admin operations

## Example: Complete Admin Operation

### 1. Database Function (Migration)
```sql
-- supabase/migrations/YYYYMMDD_admin_operation.sql
CREATE FUNCTION admin_update_organization(
  p_org_id uuid,
  p_name text,
  p_description text
)
RETURNS TABLE (id uuid, name text, description text)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization check
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can update organizations';
  END IF;

  -- Data operation (bypasses RLS)
  RETURN QUERY
  UPDATE organizations
  SET name = p_name, description = p_description
  WHERE id = p_org_id
  RETURNING id, name, description;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_organization(uuid, text, text) TO authenticated;
```

### 2. Frontend Hook
```typescript
// apps/admin-portal/lib/queries/organizations.ts
export function useUpdateOrganization(orgId: string) {
  return useMutation({
    mutationFn: async (input) => {
      const supabase = createBrowserClient()

      // Call admin RPC function (not PostgREST)
      const { data, error } = await supabase.rpc('admin_update_organization', {
        p_org_id: orgId,
        p_name: input.name,
        p_description: input.description,
      })

      if (error) throw error
      return data?.[0]  // RPC returns array
    }
  })
}
```

## Current Admin Functions (Reference)

All admin operations follow this pattern:

| Operation | Function Name | Purpose |
|-----------|--------------|---------|
| **SELECT** | `admin_list_organizations` | List all organizations with member counts |
| **SELECT** | `admin_get_organization` | Get single organization details |
| **SELECT** | `admin_list_organization_members` | List members with profile data |
| **SELECT** | `admin_list_organization_subscriptions` | List subscriptions with app/tier details |
| **UPDATE** | `admin_update_organization` | Update organization details |
| **INSERT** | `admin_assign_subscription` | Assign app subscription to org |

## Common Mistakes to Avoid

❌ **DON'T: Use PostgREST for admin operations**
```typescript
// This will cause infinite recursion or permission errors
await supabase.from('organizations').update(...)
```

❌ **DON'T: Add `is_playze_admin()` to RLS policies**
```sql
-- This causes infinite recursion
CREATE POLICY "policy" ON organizations
USING (
  is_playze_admin() OR  -- ← BAD: Queries organization_members
  EXISTS (SELECT FROM organization_members ...)  -- ← Queries organization_members again
);
```

❌ **DON'T: Use Edge Functions for simple admin CRUD**
- Edge Functions are for external APIs, webhooks, or service-role-only operations
- Database functions are simpler and faster for admin CRUD

✅ **DO: Use SECURITY DEFINER functions**
```typescript
// Correct approach
await supabase.rpc('admin_update_organization', {...})
```

✅ **DO: Keep RLS policies simple (no admin checks)**
```sql
-- RLS policies are for regular users only
CREATE POLICY "policy" ON organizations
USING (
  EXISTS (SELECT FROM organization_members ...)  -- ← GOOD: Simple, no admin logic
);
```

## Why This Architecture?

**Separation of Concerns:**
- **RLS policies** = Regular user authorization (organization-scoped)
- **SECURITY DEFINER functions** = Admin authorization (platform-wide)

**Benefits:**
- ✅ Avoids infinite recursion in RLS policies
- ✅ Clear separation between user and admin code paths
- ✅ Simple RLS policies (easier to maintain)
- ✅ Explicit admin authorization checks
- ✅ Better performance (no RLS evaluation overhead)

**Security:**
- Admin functions still require authentication (JWT required)
- `is_playze_admin()` validates email against whitelist
- `SECURITY DEFINER` is safe when combined with authorization checks
- All admin operations are auditable (logged in PostgREST logs)

## Quick Decision Tree

```
Need to perform database operation?
├─ For regular user in platform app?
│  └─ ✅ Use PostgREST with RLS policies
│
├─ For admin in Admin Portal?
│  └─ ✅ Create SECURITY DEFINER function
│
└─ For external API/webhook/service-role?
   └─ ✅ Create Edge Function
```

## Related Documentation

- [Playze Core Architecture](./playze-core-architecture.md) - Complete platform overview
- [Admin Portal Phase 5](./playze-core-architecture.md#admin-portal-appsadmin-portal--phase-5---not-yet-implemented) - Admin Portal features
- [Supabase SECURITY DEFINER Functions](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)

## Admin Whitelist

Admins are defined in `supabase/functions/_shared/auth.ts`:
```typescript
export const PLAYZE_ADMIN_EMAILS = [
  'johan.mardfelt@olivab.se',
  // Add new admin emails here
]
```

For database access, the `is_playze_admin()` helper checks this whitelist via JWT metadata.
