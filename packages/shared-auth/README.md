# @playze/shared-auth

Authentication utilities, Supabase client creators, and authorization hooks for Playze Core.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Core Concepts](#core-concepts)
4. [Installation & Setup](#installation--setup)
5. [Client Types Reference](#client-types-reference)
6. [Hooks Reference](#hooks-reference)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)
9. [Performance & Caching](#performance--caching)
10. [Related Documentation](#related-documentation)

---

## Overview

### What is Playze Core?

**Playze Core** is a multi-tenant B2B SaaS platform that provides centralized authentication, authorization, billing, and organization management for multiple applications. Applications built on Playze Core share:

- ✅ **Single Sign-On (SSO)** - One login across all apps
- ✅ **Organization Management** - B2B multi-tenancy with invite-only access
- ✅ **Subscription Management** - Per-app subscriptions with tier-based features
- ✅ **Authorization System** - Dual model (tier features + role permissions)
- ✅ **Shared UI Components** - Design system and platform components

### Role of @playze/shared-auth

This package is the **authentication and authorization foundation** for all Playze Core applications. It provides:

- **Supabase Client Creators** - Configured clients for server, browser, and middleware contexts
- **Authorization Hooks** - React hooks for organization context, features, and permissions
- **Unified Authorization System** - Complete auth context in ONE database query
- **Session Management** - Cookie-based authentication with automatic refresh

**Key Design Principle:** Apps use PostgREST for data access with Row Level Security (RLS) policies automatically filtering data to the user's current organization.

---

## Architecture Patterns

Playze Core uses **two distinct patterns** for data access, depending on privilege level:

### 1. Regular User Access Pattern (What Most Apps Use)

**Used by:** All user-facing applications (RoadCloud, ProjectX, TestApp, etc.)

**Characteristics:**
- Direct PostgREST queries via `supabase.from('table').select()`
- RLS policies automatically filter data to user's organization
- Authorization via organization membership and app subscriptions
- Scope: User's organization only

**Example:**
```typescript
// Query automatically filtered to user's organization via RLS
const { data: items } = await supabase
  .from('roadcloud_roads')
  .select('*')

// RLS policy checks:
// - organization_id = current user's organization (from JWT)
// - User's org has active roadcloud subscription
```

**When to Use:**
- ✅ Building user-facing applications
- ✅ Organization-scoped data operations
- ✅ Feature-gated content based on subscription
- ✅ Role-based permissions within organization

### 2. Admin Access Pattern (Admin Portal Only)

**Used by:** Admin Portal exclusively

**Characteristics:**
- Database RPC functions via `supabase.rpc('admin_function')`
- SECURITY DEFINER bypasses RLS policies
- Email whitelist authorization (`admin_users` table)
- Scope: All organizations' data

**Example:**
```typescript
// Admin function sees ALL organizations
const { data: orgs } = await supabase.rpc('admin_list_organizations')

// Function checks is_playze_admin() internally
// Returns data from ALL organizations (bypasses RLS)
```

**When to Use:**
- ✅ Admin Portal only
- ✅ Platform-wide operations (create orgs, manage subscriptions)
- ✅ Cross-organization reporting
- ✅ System administration tasks

### Decision Tree

```
Need to perform database operation?
│
├─ Building regular user-facing app?
│  └─ ✅ Use Pattern 1: PostgREST + RLS
│     const { data } = await supabase.from('table').select()
│
├─ Building Admin Portal?
│  └─ ✅ Use Pattern 2: Admin RPC functions
│     const { data } = await supabase.rpc('admin_function')
│
└─ Need service-role operations (JWT updates, invitations)?
   └─ ✅ Use Edge Functions
      await supabase.functions.invoke('function-name')
```

---

## Core Concepts

### Multi-Tenancy (Organization-Based)

**Organizations are the tenant unit** in Playze Core, not individual users.

- Users belong to one or more organizations
- Each organization has its own data (isolated via RLS)
- Users can switch between organizations
- Current organization stored in JWT `app_metadata.organization_id`

```typescript
// JWT structure
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "app_metadata": {
    "organization_id": "current-org-uuid",  // Active organization
    "organizations": [                       // All user's orgs
      { "id": "org-1", "role": "owner" },
      { "id": "org-2", "role": "member" }
    ]
  }
}
```

### Unified Authorization System

**Performance Breakthrough:** Authorization checks require **ONE database query** instead of N queries.

The system combines:
- **Tier Features** - Features from organization's subscription (Free, Pro, Enterprise)
- **Role Permissions** - Permissions from user's role (Owner, Admin, Member, Viewer)
- **Current Role** - User's role in current organization
- **Usage Data** - Current usage vs tier limits

```typescript
// ONE query returns complete authorization context
const { data: auth } = useAuthorization('appId')

// Result contains:
{
  user_role: 'admin',                    // User's role in org
  tier_features: {                       // From subscription tier
    professional_demo: true,
    advanced_analytics: false
  },
  role_permissions: {                    // From user's role
    can_edit: true,
    can_delete: true,
    can_export: true
  },
  tier_limits: { items: 500 },          // Usage limits
  current_usage: { items: 125 },        // Current usage
  tier_display_name: 'Professional',
  subscription_status: 'active'
}

// All other hooks use this SAME cached data - no additional queries!
```

### Row Level Security (RLS)

All app-specific tables use RLS policies to automatically filter data:

```sql
-- Example RLS policy
CREATE POLICY "Users access data in their org with app access"
  ON roadcloud_roads FOR ALL
  USING (
    organization_id = public.user_organization_id()  -- From JWT
    AND public.has_app_access('roadcloud')           -- Subscription check
  );
```

**Key Point:** You never manually filter by `organization_id` - RLS does it automatically and securely at the database level.

---

## Installation & Setup

### 1. Install Package

```json
{
  "dependencies": {
    "@playze/shared-auth": "workspace:*"
  }
}
```

### 2. Environment Variables

```env
# .env.local (in your app directory)
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### 3. Setup Providers

```typescript
// app/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,  // 5-minute cache for auth data
          refetchOnWindowFocus: false,
        },
      },
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

### 4. Setup Middleware

```typescript
// middleware.ts
import { updateSession } from '@playze/shared-auth/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## Client Types Reference

### createBrowserClient() - Client Components

**Use for:** Client components, browser-only operations

```typescript
import { createBrowserClient } from '@playze/shared-auth/client'

export default function ClientComponent() {
  const supabase = createBrowserClient()

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email: 'user@example.com',
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }
}
```

### createServerClient() - Server Components & Route Handlers

**Use for:** Server components, API routes, server actions

```typescript
import { createServerClient } from '@playze/shared-auth/server'

export default async function ServerComponent() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Query data (RLS applies automatically)
  const { data: items } = await supabase
    .from('app_items')
    .select('*')

  return <div>Welcome {user?.email}</div>
}
```

### updateSession() - Middleware

**Use for:** Session refresh and authentication checks in middleware

```typescript
import { updateSession } from '@playze/shared-auth/middleware'

export async function middleware(request: NextRequest) {
  // Refreshes session and sets cookies
  return await updateSession(request)
}
```

---

## Hooks Reference

All hooks use TanStack Query for caching and state management. They're designed to work together efficiently.

### Organization Context Hooks

#### useCurrentOrganization()

Returns the user's **active organization** from JWT metadata.

```typescript
import { useCurrentOrganization } from '@playze/shared-auth'

const { data: org, isLoading, error } = useCurrentOrganization()

// Returns: Organization | null
// - id: uuid
// - name: string
// - slug: string
// - is_active: boolean
```

#### useUserOrganizations()

Returns **all organizations** the user belongs to with their roles.

```typescript
import { useUserOrganizations } from '@playze/shared-auth'

const { data: orgs, isLoading } = useUserOrganizations()

// Returns: UserOrganization[]
// - organization_id: uuid
// - organization_name: string
// - user_role: 'owner' | 'admin' | 'member' | 'viewer'
// - joined_at: timestamp
```

#### useOrganizationApps()

Returns all **app subscriptions** for the current organization.

```typescript
import { useOrganizationApps } from '@playze/shared-auth'

const { data: apps } = useOrganizationApps()

// Returns: OrganizationApp[]
// - app_id: string
// - app_name: string
// - tier_name: string ('free', 'pro', 'enterprise')
// - tier_display_name: string
// - status: 'active' | 'past_due' | 'canceled'
// - features: jsonb (tier features)
// - limits: jsonb (usage limits)
// - current_usage: jsonb (current period usage)
```

### Authorization Hooks

#### useAuthorization() - PRIMARY HOOK ⚡

**The performance hero** - Returns complete authorization context in ONE database query.

```typescript
import { useAuthorization } from '@playze/shared-auth'

const { data: auth, isLoading } = useAuthorization('appId')

// Returns: UserAuthorization
// {
//   organization_id: uuid,
//   organization_name: string,
//   user_role: 'owner' | 'admin' | 'member' | 'viewer',
//   app_id: string,
//   tier_name: string,
//   tier_display_name: string,
//   tier_features: jsonb,        // Features from subscription
//   tier_limits: jsonb,           // Usage limits from tier
//   role_permissions: jsonb,      // Permissions from role
//   current_usage: jsonb,         // Current usage this period
//   subscription_status: string
// }
```

**Performance:** All authorization hooks share this query's cached result. If you use `useAuthorization()`, `useFeatureAccess()`, and `usePermission()` on the same page, it's still **ONE database query** total.

#### useFeatureAccess() - Tier-Based Feature Check

Checks if organization's subscription tier includes a feature.

```typescript
import { useFeatureAccess } from '@playze/shared-auth'

const { data: canExport } = useFeatureAccess('roadcloud', 'export_reports')

// Returns: boolean | undefined
// true = organization's tier has this feature
// false = feature not in tier (show upgrade prompt)
```

#### usePermission() - Role-Based Permission Check

Checks if user's role has a specific permission.

```typescript
import { usePermission } from '@playze/shared-auth'

const { data: canEdit } = usePermission('roadcloud', 'can_edit')

// Returns: boolean | undefined
// true = user's role has this permission
// false = role doesn't have permission (show access denied)
```

#### useHasRole() - Role Check

Checks if user has one of the specified roles.

```typescript
import { useHasRole } from '@playze/shared-auth'

const { data: isAdmin } = useHasRole('roadcloud', ['owner', 'admin'])

// Returns: boolean | undefined
// true = user has one of the specified roles
// false = user doesn't have any of these roles
```

### Organization Switching Hook

#### useSwitchOrganization()

Mutation hook to switch user's active organization.

```typescript
import { useSwitchOrganization } from '@playze/shared-auth'

const switchOrg = useSwitchOrganization()

const handleSwitch = async (orgId: string) => {
  await switchOrg.mutateAsync(orgId)
  // Session refreshed automatically
  // All queries refetch with new organization context
  router.refresh()
}
```

### User Authentication Hook

#### useAuth()

Returns the current authenticated user.

```typescript
import { useAuth } from '@playze/shared-auth'

const { data: user, isLoading } = useAuth()

// Returns: User | null
// - id: uuid
// - email: string
// - app_metadata: object
// - user_metadata: object
```

---

## Usage Examples

### Example 1: Magic Link Authentication

```typescript
// app/login/login-form.tsx
'use client'

import { createBrowserClient } from '@playze/shared-auth/client'
import { useState } from 'react'
import { Button, Input } from '@playze/shared-ui'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error
      setEmailSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return <div>Check your email for the magic link!</div>
  }

  return (
    <form onSubmit={handleLogin}>
      {error && <div className="error">{error}</div>}

      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
      />

      <Button type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send Magic Link'}
      </Button>
    </form>
  )
}
```

### Example 2: Organization Context Display

```typescript
// app/dashboard/org-context.tsx
'use client'

import {
  useCurrentOrganization,
  useUserOrganizations,
  useOrganizationApps
} from '@playze/shared-auth'
import { Card } from '@playze/shared-ui'

export default function OrganizationContext() {
  const { data: currentOrg } = useCurrentOrganization()
  const { data: userOrgs } = useUserOrganizations()
  const { data: orgApps } = useOrganizationApps()

  // Find user's role in current organization
  const userRole = userOrgs?.find(
    org => org.organization_id === currentOrg?.id
  )?.user_role

  // Find app subscription
  const appSubscription = orgApps?.find(
    app => app.app_id === 'myapp'
  )

  return (
    <Card>
      <h2>Organization Context</h2>
      <dl>
        <dt>Organization</dt>
        <dd>{currentOrg?.name}</dd>

        <dt>Your Role</dt>
        <dd className="capitalize">{userRole}</dd>

        <dt>Subscription Tier</dt>
        <dd>{appSubscription?.tier_display_name}</dd>

        <dt>Total Organizations</dt>
        <dd>{userOrgs?.length}</dd>
      </dl>
    </Card>
  )
}
```

### Example 3: Authorization Patterns

#### Pattern 1: Tier-Based Feature Gate

```typescript
import { AuthGate } from '@playze/shared-ui'

// Declarative approach (recommended)
<AuthGate appId="roadcloud" feature="export_reports">
  <ExportButton />
</AuthGate>

// Manual check approach
const { data: auth } = useAuthorization('roadcloud')
const canExport = auth?.tier_features?.export_reports

if (!canExport) {
  return <UpgradeToPro />
}
return <ExportButton />
```

#### Pattern 2: Role-Based Permission Gate

```typescript
import { AuthGate } from '@playze/shared-ui'

// Declarative approach (recommended)
<AuthGate appId="roadcloud" permission="can_edit">
  <EditButton />
</AuthGate>

// Manual check approach
const { data: auth } = useAuthorization('roadcloud')
const canEdit = auth?.role_permissions?.can_edit

if (!canEdit) {
  return <div>You don't have permission to edit</div>
}
return <EditButton />
```

#### Pattern 3: Combined Authorization (Tier + Role)

```typescript
import { AuthGate } from '@playze/shared-ui'

// Requires BOTH conditions
<AuthGate
  appId="roadcloud"
  feature="advanced_mapping"
  permission="can_export"
  requireAll
>
  <AdvancedExportFeature />
</AuthGate>

// Manual check approach
const { data: auth } = useAuthorization('roadcloud')
const hasFeature = auth?.tier_features?.advanced_mapping
const hasPermission = auth?.role_permissions?.can_export

if (!hasFeature || !hasPermission) {
  return <AccessDenied />
}
return <AdvancedExportFeature />
```

### Example 4: Complete Auth Context

```typescript
'use client'

import { useAuthorization } from '@playze/shared-auth'

export default function Dashboard() {
  const { data: auth, isLoading } = useAuthorization('myapp')

  if (isLoading) return <Loader />

  // Access all authorization data from one query
  const canExport = auth?.tier_features?.export_reports &&
                    auth?.role_permissions?.can_export

  const isNearLimit = auth?.current_usage?.items >=
                      (auth?.tier_limits?.items * 0.9)

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Role: {auth?.user_role}</p>
      <p>Tier: {auth?.tier_display_name}</p>

      {canExport && <ExportButton />}
      {isNearLimit && <UpgradePrompt />}

      <UsageIndicator
        current={auth?.current_usage?.items}
        limit={auth?.tier_limits?.items}
      />
    </div>
  )
}
```

---

## Best Practices

### ✅ DO

1. **Use PostgREST for all data operations** (never admin RPC in regular apps)
   ```typescript
   const { data } = await supabase.from('app_items').select('*')
   ```

2. **Trust RLS policies** - Don't manually filter by organization_id
   ```typescript
   // ✅ GOOD: RLS handles organization filtering
   const { data } = await supabase.from('roads').select('*')

   // ❌ BAD: Redundant and error-prone
   const { data } = await supabase
     .from('roads')
     .select('*')
     .eq('organization_id', currentOrgId)
   ```

3. **Use useAuthorization() for complete context**
   ```typescript
   // ✅ GOOD: One query, all data
   const { data: auth } = useAuthorization('appId')
   const canEdit = auth?.role_permissions?.can_edit
   const hasFeature = auth?.tier_features?.advanced

   // ❌ BAD: Multiple separate queries
   const { data: features } = useFeatures()
   const { data: permissions } = usePermissions()
   const { data: role } = useRole()
   ```

4. **Use AuthGate for declarative access control**
   ```typescript
   // ✅ GOOD: Clear and maintainable
   <AuthGate appId="app" feature="premium" permission="can_edit">
     <PremiumEditor />
   </AuthGate>

   // ❌ BAD: Manual checks everywhere
   {hasPremium && canEdit && <PremiumEditor />}
   ```

5. **Import from shared packages**
   ```typescript
   // ✅ GOOD
   import { createBrowserClient } from '@playze/shared-auth/client'
   import { Button } from '@playze/shared-ui'
   import type { Organization } from '@playze/shared-types'

   // ❌ BAD: Never create your own
   const supabase = createClient(url, key)
   function Button() { ... }
   type Organization = { ... }
   ```

### ❌ DON'T

1. **Don't use admin RPC functions in regular apps**
   ```typescript
   // ❌ BAD: Will fail with permission error
   const { data } = await supabase.rpc('admin_list_organizations')
   ```

2. **Don't manually manage organization context**
   ```typescript
   // ❌ BAD: Framework handles this
   const [currentOrgId, setCurrentOrgId] = useState(null)

   // ✅ GOOD: Use framework hooks
   const { data: currentOrg } = useCurrentOrganization()
   ```

3. **Don't create API routes for database operations**
   ```typescript
   // ❌ BAD: Unnecessary API route
   // app/api/roads/route.ts
   export async function GET() {
     const data = await supabase.from('roads').select('*')
     return Response.json(data)
   }

   // ✅ GOOD: Direct PostgREST from client
   const { data } = await supabase.from('roads').select('*')
   ```

4. **Don't duplicate authorization checks**
   ```typescript
   // ❌ BAD: Multiple queries for same data
   const { data: tier } = useTier()
   const { data: role } = useRole()
   const { data: features } = useFeatures()

   // ✅ GOOD: One query returns all
   const { data: auth } = useAuthorization('appId')
   ```

---

## Performance & Caching

### Unified Authorization System Performance

**Key Insight:** All authorization hooks share the **SAME database query** via TanStack Query caching.

```typescript
// In a component with 15 authorization checks:
const { data: auth } = useAuthorization('roadcloud')
const { data: canExport } = useFeatureAccess('roadcloud', 'export')
const { data: canEdit } = usePermission('roadcloud', 'can_edit')
const { data: isAdmin } = useHasRole('roadcloud', ['admin', 'owner'])
// ... 11 more checks

// Total database queries: 1 (not 15!)
// All hooks use the cached result from useAuthorization()
```

### Caching Strategy

```typescript
// Default cache configuration (in QueryClient)
{
  queries: {
    staleTime: 5 * 60 * 1000,  // 5-minute cache
    refetchOnWindowFocus: false,
  }
}
```

**What this means:**
- Authorization data cached for 5 minutes
- Background refetch after 5 minutes
- No refetch when window regains focus
- All authorization hooks share the same cache entry

### Cache Invalidation

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// Invalidate on organization switch
const switchOrg = useSwitchOrganization()
await switchOrg.mutateAsync(newOrgId)
queryClient.invalidateQueries({ queryKey: ['authorization'] })
```

---

## Related Documentation

### Essential Reading

- **[Playze Core Architecture](../../docs/playze-core-architecture.md)** - Complete platform architecture (60 min read)
- **[TestApp Developer Guide](../../apps/testapp/TESTAPP_DEVELOPER_GUIDE.md)** - Reference app patterns (30 min read)
- **[Database Schema](../../supabase/migrations/)** - Core tables and RLS policies

### Additional Resources

- **[Admin Portal Architecture](../../apps/admin-portal/README.md)** - Admin access patterns (contrast with regular patterns)
- **[Supabase Decision Tree](./src/lib/decision-tree.ts)** - When to use PostgREST vs RPC vs Edge Functions
- **[TestApp Database Setup](../../apps/testapp/DATABASE_SETUP.md)** - Example app registration

### External Documentation

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth) - Authentication patterns
- [Supabase RLS Guide](https://supabase.com/docs/guides/database/postgres/row-level-security) - Row Level Security
- [TanStack Query Docs](https://tanstack.com/query/latest) - React Query patterns
- [Next.js App Router](https://nextjs.org/docs/app) - Next.js 15 patterns

---

## Quick Reference

### Import Cheat Sheet

```typescript
// Supabase Clients
import { createBrowserClient } from '@playze/shared-auth/client'
import { createServerClient } from '@playze/shared-auth/server'
import { updateSession } from '@playze/shared-auth/middleware'

// Organization Hooks
import {
  useCurrentOrganization,
  useUserOrganizations,
  useOrganizationApps,
} from '@playze/shared-auth'

// Authorization Hooks (all share ONE query!)
import {
  useAuthorization,      // PRIMARY: Complete auth context
  useFeatureAccess,      // Convenience: Check tier feature
  usePermission,         // Convenience: Check role permission
  useHasRole,            // Convenience: Check user role
} from '@playze/shared-auth'

// User Auth
import { useAuth } from '@playze/shared-auth'

// Organization Switching
import { useSwitchOrganization } from '@playze/shared-auth'
```

### Common Patterns

```typescript
// Pattern 1: Protected page with auth
const { data: user } = useAuth()
if (!user) return <LoginPrompt />

// Pattern 2: Organization context
const { data: org } = useCurrentOrganization()
const { data: userOrgs } = useUserOrganizations()

// Pattern 3: Complete authorization
const { data: auth } = useAuthorization('appId')

// Pattern 4: Tier-based feature gate
<AuthGate appId="app" feature="premium">
  <PremiumFeature />
</AuthGate>

// Pattern 5: Role-based permission gate
<AuthGate appId="app" permission="can_edit">
  <EditButton />
</AuthGate>

// Pattern 6: Combined authorization
<AuthGate appId="app" feature="premium" permission="can_export" requireAll>
  <AdvancedExport />
</AuthGate>
```

---

**Golden Rule:** If PostgREST can do it, use PostgREST. Never create API routes for database operations.

**Performance Mantra:** Use `useAuthorization()` once, check everything. All hooks share the same cached query.

**Security Foundation:** Trust RLS policies. They automatically filter data to the user's organization based on JWT metadata.
