# TestApp Developer Guide

> **Reference Application for Playze Core Framework**
>
> Learn how to build applications on Playze Core by studying this minimal reference implementation.

## Table of Contents

1. [Overview](#overview)
2. [What TestApp Demonstrates](#what-testapp-demonstrates)
3. [Architecture Patterns](#architecture-patterns)
4. [Code Examples by Feature](#code-examples-by-feature)
5. [Framework Integration Points](#framework-integration-points)
6. [Best Practices](#best-practices)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## Overview

### Purpose

TestApp is a **minimal reference application** that demonstrates how to build applications on the Playze Core framework. It showcases:

- ✅ Standard user authentication patterns (NOT admin patterns)
- ✅ Proper integration with shared packages
- ✅ Multi-tenancy via organization context
- ✅ Subscription-based feature gating (tier + role authorization)
- ✅ Next.js 15 App Router best practices
- ✅ Client/server component patterns

### What TestApp Is NOT

- ❌ **NOT a production application** - It's a learning reference
- ❌ **NOT using admin patterns** - Uses regular user RLS-based access
- ❌ **NOT a starter template** - It's for understanding patterns, not copying

### Key Differentiator

**TestApp vs Admin Portal:**

| Aspect | TestApp (Regular User) | Admin Portal (Elevated Access) |
|--------|------------------------|--------------------------------|
| Data Access | `supabase.from('table')` | `supabase.rpc('admin_*')` |
| RLS | Respected (org-scoped) | Bypassed (SECURITY DEFINER) |
| Authorization | Organization membership | Email whitelist |
| Scope | User's organization only | All organizations |
| Pattern | PostgREST + RLS | RPC functions |

---

## What TestApp Demonstrates

### 1. Authentication Flow ✅

**Files:**
- [app/login/login-form.tsx](app/login/login-form.tsx) - Magic link authentication
- [app/auth/callback/route.ts](app/auth/callback/route.ts) - OAuth callback handler
- [middleware.ts](middleware.ts) - Session management

**What You'll Learn:**
- How to implement magic link authentication with Supabase
- Proper cookie-based session management in Next.js 15
- Protected route patterns with middleware
- Error handling and user feedback

**Key Pattern:**
```typescript
// Magic link authentication
const { error } = await supabase.auth.signInWithOtp({
  email: email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

### 2. Session Management ✅

**File:** [middleware.ts](middleware.ts)

**What You'll Learn:**
- How to refresh sessions on every request
- Redirect authenticated/unauthenticated users appropriately
- Manage cookies with `@supabase/ssr`
- Define public vs protected routes

**Key Pattern:**
```typescript
// Session refresh in middleware
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) { /* Set on request and response */ },
    },
  }
)
```

### 3. Multi-Tenancy (Organization Context) ✅

**File:** [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx)

**What You'll Learn:**
- Access current organization from JWT metadata
- Display organization context to users
- Use organization switcher for multi-org users
- Understand organization-scoped data access

**Key Pattern:**
```typescript
// Get current organization from shared-auth
const { data: currentOrg } = useCurrentOrganization()
const { data: userOrgs } = useUserOrganizations()

// Organization context is in JWT app_metadata.organization_id
// RLS policies automatically filter data to this organization
```

### 4. Authorization System (Tier + Role) ✅

**File:** [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) (lines 239-349)

**What You'll Learn:**
- **Tier-based authorization** - Features based on subscription (Free, Pro, Enterprise)
- **Role-based authorization** - Permissions based on user role (Owner, Admin, Member, Viewer)
- **Combined authorization** - Requiring both tier AND role
- How to use `AuthGate` component for declarative access control
- Fallback UI for unauthorized access

**Three Authorization Patterns:**

#### Pattern 1: Tier-Based Feature Gate
```typescript
// Shows content only if organization has the feature in their tier
<AuthGate appId="testapp" feature="professional_demo">
  <ProfessionalFeature />
</AuthGate>

// Free tier users see upgrade prompt automatically
```

#### Pattern 2: Role-Based Permission Gate
```typescript
// Shows content only if user's role has the permission
<AuthGate appId="testapp" permission="can_edit">
  <EditButton />
</AuthGate>

// Viewers (no edit permission) see permission denied message
```

#### Pattern 3: Combined Authorization
```typescript
// Requires BOTH conditions (tier feature AND role permission)
<AuthGate
  appId="testapp"
  feature="professional_demo"
  permission="can_export"
  requireAll
>
  <AdvancedExportFeature />
</AuthGate>

// Only Pro tier users with Owner/Admin role see this
```

**Performance Optimization:**
All authorization checks share **ONE database query** via the unified authorization system:
```typescript
const { data: auth } = useAuthorization('testapp')

// Single query returns:
// - User's role in current organization
// - Organization's subscription tier
// - Tier features (e.g., { professional_demo: true })
// - Role permissions (e.g., { can_edit: true, can_export: false })
// - Usage limits and current usage
```

### 5. Shared Package Integration ✅

**All Files**

**What You'll Learn:**
- Import from `@playze/shared-auth` for authentication
- Import from `@playze/shared-ui` for UI components
- Import from `@playze/shared-types` for TypeScript types
- Never duplicate framework functionality

**Key Imports:**
```typescript
// Authentication & Authorization
import { createBrowserClient } from '@playze/shared-auth/client'
import { useCurrentOrganization, useAuthorization } from '@playze/shared-auth'

// UI Components
import { Button, Card, Input, AuthGate } from '@playze/shared-ui'

// Types
import type { Organization, UserAuthorization } from '@playze/shared-types'
```

### 6. Client/Server Component Patterns ✅

**Files:**
- [app/layout.tsx](app/layout.tsx) - Server component
- [app/providers.tsx](app/providers.tsx) - Client provider
- [app/dashboard/page.tsx](app/dashboard/page.tsx) - Client with dynamic import

**What You'll Learn:**
- When to use server vs client components
- How to prevent hydration errors
- Dynamic imports with `ssr: false`
- Proper QueryClient setup

**Key Pattern:**
```typescript
// Root layout (server component for metadata)
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>  {/* Client provider */}
      </body>
    </html>
  )
}

// Dashboard (client with dynamic import to prevent hydration)
const DashboardContent = dynamic(() => import('./dashboard-content'), {
  ssr: false,  // Prevents hydration issues
  loading: () => <Loader />
})
```

### 7. App Switcher Integration ✅

**File:** [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) (line 102)

**What You'll Learn:**
- Display app switcher for ecosystem navigation
- Show organization's app subscriptions
- Handle cross-app navigation

**Key Pattern:**
```typescript
// App switcher shows all apps in Playze ecosystem
<AppSwitcher currentApp="testapp" />

// Get organization's app subscriptions
const { data: orgApps } = useOrganizationApps()
```

---

## Architecture Patterns

### 1. Regular User Access Pattern (What TestApp Uses)

**Characteristics:**
- Direct PostgREST queries via `supabase.from('table')`
- Row Level Security (RLS) policies enforce organization-scoping
- Data automatically filtered to user's current organization
- Standard user permissions (member, viewer, admin, owner)

**When to Use:**
- ✅ All regular user-facing applications (RoadCloud, ProjectX, etc.)
- ✅ Organization-scoped data operations
- ✅ Feature-gated content based on subscription
- ✅ Role-based permissions within an organization

**Example:**
```typescript
// Query is automatically filtered to user's organization via RLS
const { data: items } = await supabase
  .from('testapp_items')
  .select('*')

// User only sees items where:
// - organization_id = current user's organization (from JWT)
// - User's org has active testapp subscription
```

**RLS Policy Example:**
```sql
-- RLS policy automatically filters to user's organization
CREATE POLICY "Users access items in their org with app access"
  ON testapp_items FOR ALL
  USING (
    organization_id = public.user_organization_id()  -- From JWT metadata
    AND public.has_app_access('testapp')              -- Subscription check
  );
```

### 2. Admin Access Pattern (NOT Used in TestApp)

**Characteristics:**
- Database RPC functions via `supabase.rpc('admin_function')`
- SECURITY DEFINER bypasses RLS policies
- Email whitelist authorization (`admin_users` table)
- Access to ALL organizations' data

**When to Use:**
- ✅ Admin Portal only
- ✅ Platform-wide operations (create orgs, manage subscriptions)
- ✅ Cross-organization reporting
- ✅ System administration tasks

**Example (NOT in TestApp):**
```typescript
// Admin function sees ALL organizations
const { data: orgs } = await supabase.rpc('admin_list_organizations')

// Function checks is_playze_admin() internally
// Returns data from ALL organizations (bypasses RLS)
```

### 3. Data Access Decision Tree

```
Need to fetch/modify data?
│
├─ Are you building TestApp or similar user-facing app?
│  └─ ✅ Use Pattern 1: PostgREST + RLS
│     const { data } = await supabase.from('table').select()
│
├─ Are you building Admin Portal?
│  └─ ✅ Use Pattern 2: Admin RPC functions
│     const { data } = await supabase.rpc('admin_function')
│
└─ Need service-role operations (JWT updates, invitations)?
   └─ ✅ Use Edge Functions
      await supabase.functions.invoke('function-name')
```

---

## Code Examples by Feature

### Example 1: Protected Page with Auth Check

**Location:** [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) (lines 23-85)

**Pattern:**
```typescript
'use client'

export default function DashboardContent() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createBrowserClient()

    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <LoadingSpinner />

  return <ProtectedContent user={user} />
}
```

**What This Demonstrates:**
- Client-side user state management
- Auth state change listener
- Loading state handling
- Cleanup on unmount

### Example 2: Organization Context Display

**Location:** [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) (lines 158-211)

**Pattern:**
```typescript
'use client'

export default function OrganizationCard() {
  // Framework hooks provide organization context
  const { data: currentOrg } = useCurrentOrganization()
  const { data: userOrgs } = useUserOrganizations()
  const { data: orgApps } = useOrganizationApps()

  // Extract user's role in current organization
  const currentOrgRole = userOrgs?.find(
    org => org.organization_id === currentOrg?.id
  )?.user_role

  // Find app subscription
  const testAppSubscription = orgApps?.find(
    app => app.app_id === 'testapp'
  )

  return (
    <Card>
      <h2>Organization Context</h2>
      <div>
        <div>Organization: {currentOrg?.name}</div>
        <div>Your Role: {currentOrgRole}</div>
        <div>Tier: {testAppSubscription?.tier_display_name}</div>
        <div>Total Orgs: {userOrgs?.length}</div>
      </div>
    </Card>
  )
}
```

**What This Demonstrates:**
- Using framework hooks for organization data
- Type-safe data access
- Deriving computed values (user role)
- Displaying multi-tenancy context

### Example 3: Feature Gating (Three Patterns)

**Location:** [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) (lines 238-349)

#### 3a. Tier-Based Feature Gate

```typescript
// Pattern: Subscription tier controls access
<AuthGate appId="testapp" feature="professional_demo">
  <Card className="bg-amber-50">
    <Crown className="text-amber-600" />
    <h2>Professional Tier Feature</h2>
    <p>This feature requires Professional tier subscription.</p>
    <ul>
      <li>Uses FeatureGate component from @playze/shared-ui</li>
      <li>Checks database for tier features</li>
      <li>Free tier users see upgrade prompt</li>
    </ul>
  </Card>
</AuthGate>
```

**When Free Tier Users Visit:**
- Card is hidden
- Automatic upgrade prompt shown
- "Contact us" button displayed (MVP: no self-service)

#### 3b. Role-Based Permission Gate

```typescript
// Pattern: User role controls access
<AuthGate appId="testapp" permission="can_edit">
  <Card className="bg-green-50">
    <Edit3 className="text-green-600" />
    <h2>Edit Permission Feature</h2>
    <p>You see this because you have edit permissions.</p>
    <ul>
      <li>Checks user's role permissions</li>
      <li>Owner/Admin/Member: can_edit = true</li>
      <li>Viewer: can_edit = false</li>
    </ul>
  </Card>
</AuthGate>
```

**Role Permissions:**
- Owner: All permissions
- Admin: All except billing
- Member: Can edit, cannot delete/export
- Viewer: Read-only (no edit permission)

#### 3c. Combined Authorization (Tier + Role)

```typescript
// Pattern: Requires BOTH tier AND role
<AuthGate
  appId="testapp"
  feature="professional_demo"    // Requires Pro tier
  permission="can_export"         // Requires Owner/Admin role
  requireAll                      // BOTH must be true
>
  <Card className="bg-purple-50">
    <Shield className="text-purple-600" />
    <h2>Combined Authorization</h2>
    <p>You see this because you have BOTH:</p>
    <ul>
      <li>Professional tier (has professional_demo feature)</li>
      <li>Export permission (Owner/Admin role)</li>
    </ul>
  </Card>
</AuthGate>
```

**Access Requirements:**
- Organization must have Professional tier
- User must have Owner or Admin role
- If either is false, card is hidden with appropriate message

### Example 4: Magic Link Authentication

**Location:** [app/login/login-form.tsx](app/login/login-form.tsx) (lines 37-66)

**Pattern:**
```typescript
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

    setEmailSent(true)  // Show success state
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An unexpected error occurred')
  } finally {
    setLoading(false)
  }
}
```

**What This Demonstrates:**
- Proper error handling
- Loading state management
- Success state with user feedback
- Email normalization (lowercase, trim)

---

## Framework Integration Points

### 1. Shared Authentication Package (`@playze/shared-auth`)

**What It Provides:**
- Supabase client creation (server, browser, middleware)
- Authorization hooks (organization, apps, features, permissions)
- Query key factories for TanStack Query

**How TestApp Uses It:**

```typescript
// Client-side Supabase client
import { createBrowserClient } from '@playze/shared-auth/client'

// Organization hooks
import {
  useCurrentOrganization,    // Get active organization
  useUserOrganizations,       // Get all user's organizations
  useOrganizationApps,        // Get organization's app subscriptions
} from '@playze/shared-auth'

// Authorization hooks (unified system)
import {
  useAuthorization,           // PRIMARY: Complete auth context (1 query)
  useFeatureAccess,           // Check tier-based feature
  usePermission,              // Check role-based permission
  useHasRole,                 // Check user's role
} from '@playze/shared-auth'
```

**Key Hook: useAuthorization() - The Performance Hero**

```typescript
// ONE database query returns complete authorization context
const { data: auth } = useAuthorization('testapp')

// Result contains everything you need:
{
  user_role: 'admin',                          // User's role in org
  tier_features: {                             // Features from tier
    professional_demo: true,
    advanced_analytics: false
  },
  role_permissions: {                          // Permissions from role
    can_edit: true,
    can_delete: true,
    can_export: true
  },
  tier_limits: { items: 500 },                 // Usage limits
  current_usage: { items: 125 },               // Current usage
  tier_display_name: 'Professional',
  subscription_status: 'active'
}

// All other hooks (useFeatureAccess, usePermission, useHasRole)
// use this SAME cached data - no additional queries!
```

### 2. Shared UI Package (`@playze/shared-ui`)

**What It Provides:**
- shadcn/ui components (Button, Card, Input, Label, etc.)
- Platform components (AppSwitcher, OrgSwitcher, AuthGate)
- Utility functions (cn, formatDate, etc.)

**How TestApp Uses It:**

```typescript
// UI primitives
import { Button, Card, Input, Label } from '@playze/shared-ui'

// Icons (from lucide-react, re-exported)
import { LogOut, User, Loader2, Crown } from 'lucide-react'

// Platform components
import { AppSwitcher, OrgSwitcher, AuthGate } from '@playze/shared-ui'

// Usage examples:
<Button onClick={handleClick} variant="outline">
  <LogOut className="mr-2 h-4 w-4" />
  Sign Out
</Button>

<OrgSwitcher />  {/* Shows user's organizations */}
<AppSwitcher currentApp="testapp" />  {/* Shows app ecosystem */}

<AuthGate appId="testapp" feature="pro_feature">
  <ProFeatureComponent />
</AuthGate>
```

### 3. Shared Types Package (`@playze/shared-types`)

**What It Provides:**
- Auto-generated database types from Supabase schema
- Type shortcuts for common entities
- Helper types for authorization

**How TestApp Uses It:**

```typescript
import type {
  Organization,           // Organization entity
  UserOrganization,       // User-org relationship with role
  OrganizationApp,        // Org's app subscription with tier
  UserAuthorization,      // Complete auth context
  User as SupabaseUser    // Supabase user type
} from '@playze/shared-types'

// Type-safe data access
const { data: org } = useCurrentOrganization()  // Returns Organization type
const { data: auth } = useAuthorization('testapp')  // Returns UserAuthorization type
```

### 4. TanStack Query Integration

**What It Provides:**
- Server state management
- Automatic caching and refetching
- Loading/error states

**How TestApp Uses It:**

```typescript
// Setup in providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const [queryClient] = useState(
  () => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,        // Cache for 1 minute
        refetchOnWindowFocus: false,  // Don't refetch on window focus
      },
    },
  })
)

// Hooks automatically use QueryClient
const { data, isLoading, error } = useCurrentOrganization()
```

**Caching Strategy:**
All authorization hooks share the same query:
- `useAuthorization('testapp')` fetches data once
- `useFeatureAccess('testapp', 'feature')` uses cached data
- `usePermission('testapp', 'permission')` uses cached data
- Result: 1 database query instead of N queries

---

## Best Practices

### 1. Component Architecture

✅ **DO:**
- Use server components for static content and metadata
- Use client components for interactivity
- Separate client providers from server layouts
- Use dynamic imports with `ssr: false` to prevent hydration issues

```typescript
// ✅ GOOD: Server component layout
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

// ✅ GOOD: Client component with dynamic import
const DashboardContent = dynamic(() => import('./dashboard-content'), {
  ssr: false,
  loading: () => <Loader />
})
```

❌ **DON'T:**
```typescript
// ❌ BAD: Using "use client" in root layout
"use client"  // Makes everything client-side
export default function RootLayout({ children }) { ... }

// ❌ BAD: SSR with client-only features
const DashboardContent = dynamic(() => import('./dashboard-content'), {
  ssr: true  // Can cause hydration errors with auth state
})
```

### 2. Authentication & Authorization

✅ **DO:**
- Use middleware for session management
- Use `AuthGate` for declarative access control
- Use `useAuthorization()` for complete auth context
- Handle loading and error states

```typescript
// ✅ GOOD: Declarative feature gating
<AuthGate appId="testapp" feature="pro_feature">
  <ProFeature />
</AuthGate>

// ✅ GOOD: Get complete auth context once
const { data: auth } = useAuthorization('testapp')
const canEdit = auth?.role_permissions?.can_edit
const hasPro = auth?.tier_features?.advanced_analytics
```

❌ **DON'T:**
```typescript
// ❌ BAD: Manual authorization checks without framework
if (user.subscription === 'pro' && user.role === 'admin') { ... }

// ❌ BAD: Multiple separate queries
const { data: tier } = useTier()         // Query 1
const { data: role } = useRole()         // Query 2
const { data: features } = useFeatures() // Query 3
// Use useAuthorization() instead - ONE query!
```

### 3. Data Access

✅ **DO:**
- Use PostgREST for all data operations (`supabase.from()`)
- Trust RLS policies to filter data
- Use database functions for complex operations
- Handle errors gracefully

```typescript
// ✅ GOOD: PostgREST with error handling
const { data, error } = await supabase
  .from('testapp_items')
  .select('*')

if (error) {
  console.error('Failed to load items:', error)
  return <ErrorMessage />
}
```

❌ **DON'T:**
```typescript
// ❌ BAD: Trying to use admin functions in regular apps
const { data } = await supabase.rpc('admin_list_organizations')
// Will fail - regular users don't have admin access

// ❌ BAD: Manual organization filtering
.eq('organization_id', currentOrgId)
// RLS does this automatically - redundant and error-prone
```

### 4. Shared Package Usage

✅ **DO:**
- Always import from shared packages
- Never duplicate shared functionality
- Use type imports for TypeScript types
- Follow import conventions

```typescript
// ✅ GOOD: Import from shared packages
import { createBrowserClient } from '@playze/shared-auth/client'
import { Button, Card } from '@playze/shared-ui'
import type { Organization } from '@playze/shared-types'
```

❌ **DON'T:**
```typescript
// ❌ BAD: Creating own Supabase client
const supabase = createClient(url, key)  // Use shared-auth instead

// ❌ BAD: Creating own Button component
function Button({ children }) { ... }  // Use shared-ui instead

// ❌ BAD: Defining own types
type Organization = { id: string, name: string }  // Use shared-types
```

### 5. Error Handling

✅ **DO:**
- Display user-friendly error messages
- Log errors for debugging
- Provide fallback UI
- Handle loading states

```typescript
// ✅ GOOD: Comprehensive error handling
const [error, setError] = useState('')

try {
  const { error: authError } = await supabase.auth.signInWithOtp({ email })
  if (authError) throw authError
  setEmailSent(true)
} catch (err) {
  setError(err instanceof Error ? err.message : 'An unexpected error occurred')
  console.error('Login error:', err)
}

// Display to user
{error && <ErrorAlert>{error}</ErrorAlert>}
```

❌ **DON'T:**
```typescript
// ❌ BAD: Silent errors
await supabase.auth.signInWithOtp({ email }).catch(() => {})

// ❌ BAD: Exposing technical details to users
<div>{JSON.stringify(error)}</div>

// ❌ BAD: No loading state
const data = await fetchData()  // User sees nothing while waiting
```

---

## Common Patterns

### Pattern 1: Protected Route with User State

```typescript
'use client'

export default function ProtectedPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient()

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      setLoading(false)
    }

    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) router.push('/login')
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) return <LoadingSkeleton />
  if (!user) return null

  return <ProtectedContent user={user} />
}
```

### Pattern 2: Feature-Gated Component

```typescript
'use client'

export default function FeatureGatedComponent() {
  const { data: auth } = useAuthorization('testapp')

  // Manual check (when you need custom logic)
  const hasFeature = auth?.tier_features?.advanced_analytics
  const hasPermission = auth?.role_permissions?.can_export

  if (!hasFeature) {
    return (
      <Card>
        <h3>Advanced Analytics</h3>
        <p>Available in Professional tier</p>
        <Button>Contact Sales</Button>
      </Card>
    )
  }

  if (!hasPermission) {
    return (
      <Card>
        <h3>Access Denied</h3>
        <p>You need export permission to view this</p>
      </Card>
    )
  }

  return <AnalyticsDashboard />
}

// OR use declarative AuthGate (recommended):
export default function FeatureGatedComponent() {
  return (
    <AuthGate
      appId="testapp"
      feature="advanced_analytics"
      permission="can_export"
      requireAll
    >
      <AnalyticsDashboard />
    </AuthGate>
  )
}
```

### Pattern 3: Organization Context Display

```typescript
'use client'

export default function OrgContextCard() {
  const { data: currentOrg, isLoading: orgLoading } = useCurrentOrganization()
  const { data: userOrgs, isLoading: orgsLoading } = useUserOrganizations()
  const { data: orgApps, isLoading: appsLoading } = useOrganizationApps()

  if (orgLoading || orgsLoading || appsLoading) {
    return <CardSkeleton />
  }

  const userRole = userOrgs?.find(
    org => org.organization_id === currentOrg?.id
  )?.user_role

  const appSubscription = orgApps?.find(
    app => app.app_id === 'testapp'
  )

  return (
    <Card>
      <h2>Organization Context</h2>
      <dl>
        <dt>Organization</dt>
        <dd>{currentOrg?.name ?? 'Unknown'}</dd>

        <dt>Your Role</dt>
        <dd className="capitalize">{userRole ?? 'Unknown'}</dd>

        <dt>Subscription Tier</dt>
        <dd>{appSubscription?.tier_display_name ?? 'None'}</dd>

        <dt>Total Organizations</dt>
        <dd>{userOrgs?.length ?? 0}</dd>
      </dl>
    </Card>
  )
}
```

### Pattern 4: Form with Loading and Error States

```typescript
'use client'

export default function ExampleForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
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

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return <SuccessMessage email={email} />
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert variant="destructive">{error}</Alert>}

      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        required
      />

      <Button type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          'Send Magic Link'
        )}
      </Button>
    </form>
  )
}
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Hydration Errors

**Symptom:** Console errors about hydration mismatch, content flashing

**Cause:** Server-rendered HTML doesn't match client-rendered HTML

**Solution:**
```typescript
// Use dynamic import with ssr: false
const Component = dynamic(() => import('./component'), {
  ssr: false,
  loading: () => <Loader />
})

// Or check typeof window
useEffect(() => {
  if (typeof window === 'undefined') return
  // Client-only code here
}, [])
```

#### Issue 2: "Organization not found" or Missing Context

**Symptom:** Current organization is undefined or null

**Cause:** JWT metadata not set or user not in any organization

**Solution:**
1. Verify user is invited to an organization
2. Check JWT metadata contains `organization_id`:
```typescript
const { data: { user } } = await supabase.auth.getUser()
console.log(user?.app_metadata?.organization_id)
```
3. If missing, re-invite user or use switch-organization Edge Function

#### Issue 3: AuthGate Not Showing Content

**Symptom:** Content behind `AuthGate` never shows even with correct tier/role

**Cause:** Authorization data not loaded or incorrect feature/permission name

**Solution:**
```typescript
// Debug authorization data
const { data: auth, isLoading, error } = useAuthorization('testapp')

console.log('Auth loading:', isLoading)
console.log('Auth error:', error)
console.log('Auth data:', auth)
console.log('Features:', auth?.tier_features)
console.log('Permissions:', auth?.role_permissions)

// Verify feature/permission names match database
// Check app_tiers.features and app_role_permissions.permissions
```

#### Issue 4: Session Lost on Page Refresh

**Symptom:** User redirected to login after refreshing page

**Cause:** Middleware not refreshing session properly

**Solution:**
1. Ensure middleware uses `@supabase/ssr`
2. Check cookie configuration:
```typescript
const supabase = createServerClient(url, key, {
  cookies: {
    getAll() { return request.cookies.getAll() },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set(name, value)
        response.cookies.set(name, value, options)  // Both request AND response
      })
    },
  },
})
```

#### Issue 5: "No subscription" for TestApp

**Symptom:** Cannot access TestApp even after login

**Cause:** Organization doesn't have testapp subscription

**Solution:**
1. Verify in Admin Portal: Organizations → [Your Org] → Subscriptions tab
2. Add testapp subscription if missing
3. Or run SQL:
```sql
-- Check if subscription exists
SELECT * FROM organization_app_subscriptions
WHERE app_id = 'testapp' AND status = 'active';

-- Add if missing (use Admin Portal preferably)
```

#### Issue 6: Magic Link Not Arriving

**Symptom:** No email received after login

**Cause:** Email service not configured in Supabase

**Solution:**
1. Check Supabase dashboard → Authentication → Email Templates
2. Verify SMTP settings or use Supabase defaults
3. Check spam folder
4. Test with different email provider

---

## Summary

TestApp demonstrates the complete Playze Core framework integration:

1. ✅ **Authentication** - Magic link flow with proper session management
2. ✅ **Multi-Tenancy** - Organization context and switching
3. ✅ **Authorization** - Unified tier + role system with one query
4. ✅ **Feature Gating** - Three patterns (tier, role, combined)
5. ✅ **Shared Packages** - Proper framework integration
6. ✅ **Next.js Patterns** - Server/client components, dynamic imports
7. ✅ **Error Handling** - User-friendly messages and loading states

Use this guide to understand how to build applications on Playze Core. Study the code examples, follow the patterns, and reference the architecture documentation for deeper understanding.

---

**Related Documentation:**
- [Playze Core Architecture](../../docs/playze-core-architecture.md) - Complete platform architecture
- [TestApp README](README.md) - Quick start and setup guide
- [Database Setup Guide](DATABASE_SETUP.md) - Database configuration
