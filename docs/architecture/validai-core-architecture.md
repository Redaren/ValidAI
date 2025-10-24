# ValidAI Core Framework Architecture

> **Document Status:** Architecture Definition - Post Phase 2 Implementation
> **Last Updated:** 2025-10-24
> **Framework Version:** 1.0 (Imported from Playze Core)
>
> **Implementation Status:**
> - ✅ **Phase 1 COMPLETE:** Monorepo Foundation (pnpm, Turborepo)
> - ✅ **Phase 2 COMPLETE:** Framework Import (packages, apps, migrations)
> - ⚠️ **Phase 3 PENDING:** ValidAI Integration with Framework
>
> This document describes the **ValidAI Core Framework** - the platform infrastructure that supports multiple applications. ValidAI (document processing app) is the first application built on this framework.

---

## Table of Contents

1. [Overview & Objectives](#overview--objectives)
2. [Core Architecture](#core-architecture)
3. [Authentication & Authorization](#authentication--authorization)
4. [Multi-Tenancy Model](#multi-tenancy-model)
5. [Shared Services](#shared-services)
6. [User & Organization Management](#user--organization-management)
7. [App Integration Patterns](#app-integration-patterns)
8. [Development Guidelines](#development-guidelines)
9. [Example Scenarios](#example-scenarios)

---

## Overview & Objectives

### What is ValidAI Core Framework?

**ValidAI Core Framework** is a shared infrastructure platform that provides centralized authentication, authorization, billing, and organization management for multiple SaaS applications. It enables building a family of applications that share users, organizations, and subscriptions while maintaining clear boundaries between app-specific functionality.

**Important Distinction:**
- **ValidAI Core Framework** = Platform infrastructure (authentication, multi-tenancy, shared services)
- **ValidAI Application** = Document processing and AI validation app built on the framework
- This document focuses on the **framework**, not the ValidAI app's internal architecture

### Framework Origin

ValidAI Core Framework was imported from **Playze Core** (Phase 2 complete):
- 4 shared packages (@playze/shared-ui, shared-auth, shared-types, shared-config)
- Admin Portal for platform management
- Test app for reference implementation
- Complete database schema (11 platform tables, 15+ functions)
- Edge Functions for service-role operations

### Framework Objectives

**ValidAI Core Framework Provides:**

✅ **Single Sign-On (SSO)**
- One login works across all applications on the platform
- Seamless app switching without re-authentication

✅ **B2B Organization Management**
- **Organizations created by platform admins** (not self-service)
- Invite-only user access with role-based permissions
- Members can be invited by admins with specific roles
- Switch between multiple organizations (if user belongs to multiple)

✅ **Per-App Subscription & Billing Management**
- Each organization subscribes to different apps
- Different tiers per app (Free, Pro, Enterprise)
- Track subscription status, usage, and billing periods
- Manual invoicing (no PSP integration in MVP)

✅ **Role-Based Access Control (RBAC)**
- Organization-level roles (owner, admin, member, viewer)
- App-level access control per organization

✅ **Shared UI Components**
- Design system (buttons, forms, layouts)
- App switcher and organization switcher
- Reusable business components

✅ **User Preferences**
- Shared preferences (theme, language, timezone)
- App-specific settings storage

**Explicitly OUT of MVP Scope:**

❌ **Self-signup** (invite-only in MVP, self-signup is roadmap)
❌ **User-created organizations** (only platform admins create orgs in MVP)
❌ **PSP integration** (payment gateway integration is roadmap)
❌ **Automated payment processing** (manual invoicing in MVP)
❌ **Self-service billing** (contact-based upgrades in MVP)
❌ **SSO/SAML for enterprise** (future)
❌ **Advanced audit logging** (future)
❌ **Multi-region data residency** (future)
❌ **White-label/reseller capabilities** (future)

### How Apps Fit In

Applications built on ValidAI Core Framework:

1. **Share** authentication, organizations, and billing
2. **Own** their data tables (with app name prefixes)
3. **Implement** their unique business logic
4. **Import** shared components and utilities
5. **Respect** organization subscription levels

**Current Apps:**

- **ValidAI** (apps/validai): Document processing and AI validation application
- **Admin Portal** (apps/admin-portal): Platform administration interface
- **Test App** (apps/testapp): Reference implementation and authorization demo

**Future Apps:**

- Any additional SaaS applications following the same integration patterns

---

## Core Architecture

### Monorepo Structure

```
validai/                                        # Root repository
├── apps/
│   ├── validai/                          # ValidAI application (document processing)
│   │   ├── app/                          # Next.js app directory
│   │   ├── components/                   # App-specific components
│   │   ├── lib/                          # App-specific utilities
│   │   ├── stores/                       # Zustand state stores
│   │   └── package.json
│   │
│   ├── testapp/                          # Reference implementation
│   │   ├── app/
│   │   │   ├── dashboard/                # Dashboard with authorization demo
│   │   │   └── layout.tsx                # Uses shared-auth and shared-ui
│   │   ├── components/                   # App-specific components
│   │   └── package.json
│   │
│   └── admin-portal/                     # Platform administration
│       ├── app/
│       │   ├── (admin)/
│       │   │   ├── organizations/        # CRUD orgs + members + subscriptions
│       │   │   ├── subscriptions/        # Manage app subscriptions
│       │   │   └── users/                # View all users + memberships
│       │   ├── layout.tsx                # Admin layout with navigation
│       │   └── page.tsx                  # Admin dashboard
│       ├── components/                   # Admin-specific components
│       ├── lib/
│       │   ├── queries/                  # Database RPC functions (15 admin functions)
│       │   └── validations/              # Zod schemas
│       └── package.json
│
├── packages/                             # Shared framework packages
│   ├── shared-ui/                        # Shared React components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── platform/             # AuthGate, AppSwitcher, OrgSwitcher
│   │   │   │   └── ui/                   # shadcn/ui components (19+ components)
│   │   │   ├── hooks/                    # Platform hooks
│   │   │   └── lib/
│   │   │       ├── utils.ts              # cn() utility, etc.
│   │   │       └── react-query.tsx       # QueryClientProvider setup
│   │   └── package.json
│   │
│   ├── shared-auth/                      # Authentication utilities
│   │   ├── src/
│   │   │   ├── client.ts                 # Browser client
│   │   │   ├── server.ts                 # Server-side client
│   │   │   ├── middleware.ts             # Auth middleware
│   │   │   ├── hooks/                    # 9 authorization hooks
│   │   │   └── lib/
│   │   │       ├── query-keys.ts         # TanStack Query keys
│   │   │       └── decision-tree.ts      # Supabase patterns guide
│   │   └── package.json
│   │
│   ├── shared-types/                     # TypeScript types
│   │   ├── src/
│   │   │   ├── database.types.ts         # Generated from Supabase
│   │   │   ├── shortcuts.ts              # Type shortcuts
│   │   │   ├── helpers.ts                # Type utilities
│   │   │   └── platform.types.ts         # Platform-specific types
│   │   └── package.json
│   │
│   └── shared-config/                    # Shared configurations
│       ├── eslint/                       # ESLint configs
│       ├── typescript/                   # TypeScript configs
│       └── tailwind/                     # Tailwind base config
│
├── supabase/                             # Shared Supabase project
│   ├── functions/                        # Edge Functions (service-role operations)
│   │   ├── _shared/                      # Shared utilities
│   │   │   ├── supabaseAdmin.ts          # Service-role client
│   │   │   ├── auth.ts                   # JWT validation
│   │   │   ├── validation.ts             # Input validation helpers
│   │   │   ├── response.ts               # Standardized responses
│   │   │   └── cors.ts                   # CORS headers
│   │   ├── auth/                         # Auth functions
│   │   │   └── switch-organization/      # Updates JWT metadata
│   │   └── admin/                        # Admin functions
│   │       └── create-organization/      # Admin org creation
│   │
│   ├── migrations/                       # Database migrations
│   │   ├── 20250117000000_core_schema.sql
│   │   ├── 20250117000001_rls_policies.sql
│   │   ├── 20250117000002_helper_functions.sql
│   │   ├── 20250117000003_database_functions.sql
│   │   ├── 20250117000004_triggers.sql
│   │   ├── 20250120000000_admin_users.sql
│   │   ├── 20250122000000_add_admin_assign_member.sql
│   │   └── 20250122000002_unified_authorization.sql
│   │
│   └── config.toml
│
├── docs/                                 # Documentation
│   ├── architecture/                     # Architecture documentation
│   │   └── validai-core-architecture.md  # This document
│   └── updated-migration-plan.md         # Phase 2 import plan
│
├── package.json                          # Root package.json
├── pnpm-workspace.yaml                   # Workspace configuration
└── turbo.json                            # Turborepo configuration
```

### Database Schema Organization

All applications share a **single Supabase project** with clear naming conventions:

#### Platform Tables (No Prefix) ✅ IMPLEMENTED

Platform tables are shared across all applications:

```sql
-- Organizations (tenant units)
organizations
organization_members
organization_invitations

-- App catalog and subscriptions
apps
app_tiers
organization_app_subscriptions
organization_app_usage

-- Authorization
app_role_permissions  -- Role-based permissions per app

-- User data
profiles
user_preferences

-- Billing
invoices

-- Platform Administration
admin_users
```

#### App-Specific Tables (With Prefix)

Each application owns its tables with a clear prefix:

```sql
-- ValidAI tables (prefix: validai_)
validai_documents
validai_processors
validai_operations
validai_runs
validai_operation_results
validai_workbench_executions
validai_llm_global_settings

-- Future app tables (example pattern)
futureapp_entities
futureapp_records
futureapp_settings
```

**Naming Convention Rules:**

1. **Platform tables**: No prefix (e.g., `organizations`, `apps`)
2. **App tables**: `{app_id}_` prefix (e.g., `validai_documents`)
3. **Use snake_case**: All table and column names
4. **Foreign keys**: Always reference platform tables (e.g., `organization_id`)
5. **Timestamps**: Include `created_at`, `updated_at` where applicable

---

## Authentication & Authorization

### Single Sign-On with Supabase Auth

All applications use **one Supabase Auth instance**:

```typescript
// Shared configuration
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

**User Login Flow (Invite-Only B2B):**

1. **Organization Setup (Admin):** Platform admin creates organization and assigns app subscriptions
2. **User Invitation:** Organization admin invites user via email (using Edge Function)
3. **Accept Invitation:** User clicks invite link → creates account with provided credentials
4. **First Login:** User visits any app (e.g., validai.domain.com)
5. **Authentication:** Signs in with email/password (no self-signup option shown)
6. **Session:** Session established across all domains
7. **Access:** User can access apps their organization subscribes to

> **Note:** Self-signup is disabled in MVP. All users must be invited.

### JWT Structure

The JWT contains all necessary context for authorization:

```typescript
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "aud": "authenticated",
  "role": "authenticated",

  // Custom metadata (managed by framework)
  "app_metadata": {
    "organization_id": "current-org-uuid",      // Active organization
    "organizations": [                          // All user's orgs
      { "id": "org-1", "role": "owner" },
      { "id": "org-2", "role": "member" }
    ]
  },

  "user_metadata": {
    "full_name": "John Doe",
    "avatar_url": "https://..."
  }
}
```

**Key Points:**

- `organization_id`: Current active organization (used by RLS policies)
- `organizations`: All organizations user belongs to (for org switcher)
- Updated via Edge Functions when user switches organization

### Two Patterns for Data Access

ValidAI Core Framework uses **two distinct architectural patterns** for database access:

#### 1. Regular User Access (Standard Pattern)

**Who uses this:** All regular users in platform apps (ValidAI, future apps)

**How it works:**
- Frontend makes direct PostgREST queries via `supabase.from('table').select()`
- Row Level Security (RLS) policies automatically filter data to user's organization
- PostgreSQL enforces authorization at the database level

**Example:**
```typescript
// Regular user querying their organization's documents
const { data: documents } = await supabase
  .from('validai_documents')
  .select('*')
// RLS policy automatically filters to organization_id from JWT
```

**Security mechanism:**
```sql
-- RLS policy checks user's organization membership
CREATE POLICY "users_access_own_org_data" ON validai_documents
USING (
  organization_id = auth.user_organization_id()
  AND auth.has_app_access('validai')
);
```

#### 2. Admin Access (Elevated Pattern)

**Who uses this:** Platform administrators in Admin Portal only

**Why needed:** Admin operations require bypassing RLS to access ALL organizations' data. However, adding `is_admin()` checks to RLS policies creates **infinite recursion**.

**How it works:**
- Frontend calls database functions via RPC: `supabase.rpc('admin_function_name')`
- Functions use `SECURITY DEFINER` to bypass RLS
- Functions check `is_playze_admin()` internally before executing
- Returns data from all organizations (not filtered by RLS)

**Example:**
```typescript
// Admin querying ALL organizations
const { data: orgs } = await supabase.rpc('admin_list_organizations')
// No RLS evaluation - function handles authorization internally
```

**Security mechanism:**
```sql
-- SECURITY DEFINER function bypasses RLS
CREATE FUNCTION admin_list_organizations()
RETURNS TABLE (...)
SECURITY DEFINER  -- ← Runs with elevated privileges
SET search_path = public
AS $$
BEGIN
  -- 1. Check admin authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can list all organizations';
  END IF;

  -- 2. Query data without RLS restrictions
  RETURN QUERY SELECT * FROM organizations;
END;
$$;
```

#### Decision Tree

```
Need to perform database operation?
├─ For regular user in platform app?
│  └─ ✅ Use PostgREST with RLS policies
│     Example: supabase.from('validai_documents').select()
│
├─ For admin in Admin Portal?
│  └─ ✅ Create SECURITY DEFINER function, call via RPC
│     Example: supabase.rpc('admin_list_organizations')
│
└─ For external API/webhook/service-role operations?
   └─ ✅ Create Edge Function
      Example: supabase.functions.invoke('switch-organization')
```

### Role-Based Access Control (RBAC)

**Two-Level Permission System:**

#### 1. Organization-Level Roles

Applied across all apps within an organization:

| Role | Permissions | Description |
|------|-------------|-------------|
| **owner** | Full control | Can delete org, manage billing, all admin permissions |
| **admin** | Manage members, settings | Can invite/remove members, change settings |
| **member** | Standard access | Can use apps based on subscription |
| **viewer** | Read-only | Can view but not modify |

```sql
-- Stored in organization_members table
CREATE TABLE organization_members (
  organization_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES auth.users(id),
  role text CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  PRIMARY KEY (organization_id, user_id)
);
```

#### 2. App-Level Access

Controlled by **organization app subscriptions**:

```typescript
// Organization's access to apps
{
  "org_id": "company-a-uuid",
  "apps": {
    "validai": {
      "tier": "pro",
      "status": "active",
      "features": ["basic_processing", "advanced_ai", "export_reports"]
    }
  }
}
```

**Permission Check Pattern:**

```typescript
// Check if user's org has access to app feature
const hasAccess = await checkOrgFeatureAccess(
  organizationId,
  'validai',
  'advanced_ai'
)

if (!hasAccess) {
  return <UpgradeToPro />
}
```

### RLS Policy Pattern

All app tables follow this RLS pattern:

```sql
-- Example: ValidAI documents table
CREATE POLICY "Users access documents in their organization with app access"
  ON validai_documents
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );
```

**Key RLS Helper Functions:**

```sql
-- Helper function: Get current user's organization
CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: Check app access
CREATE OR REPLACE FUNCTION public.has_app_access(app_name text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_app_subscriptions
    WHERE organization_id = public.user_organization_id()
      AND app_id = app_name
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: Check if current user is platform admin
CREATE OR REPLACE FUNCTION is_playze_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE email = (auth.jwt() ->> 'email')::text
  );
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Unified Authorization System ✅ IMPLEMENTED

**Performance Breakthrough:** Authorization checks require **ONE database query** instead of N queries.

ValidAI Core Framework implements a **dual authorization model** combining tier-based features AND role-based permissions:

#### Architecture Overview

```
User Authorization = Tier Features + Role Permissions + Current Role + Usage Limits
                    └─────────────────┬─────────────────┘
                              ONE database query
                           get_user_authorization()
```

**Benefits:**
- 🚀 **Performance:** 15 authorization checks = 1 database query (was 15 queries)
- 🔒 **Dual Model:** Supports both subscription tiers AND role-based permissions
- ♻️ **Cached:** 5-minute cache via TanStack Query
- 🎯 **Single Source of Truth:** All auth hooks share same data
- 📦 **Clean Separation:** Framework provides hooks, apps use them

#### 1. Tier-Based Features (Subscription Model)

Features controlled by organization's subscription tier:

```typescript
// Example: Export feature available in Pro tier only
const { data: auth } = useAuthorization('validai')
const canExport = auth?.tier_features?.export_reports  // true/false

// Stored in app_tiers.features
{
  "validai": {
    "free": { "export_reports": false, "basic_processing": true },
    "pro": { "export_reports": true, "advanced_ai": true }
  }
}
```

#### 2. Role-Based Permissions (User Capability Model)

Permissions controlled by user's role in the organization:

```typescript
// Example: Edit permission for admin/member, not viewer
const { data: auth } = useAuthorization('validai')
const canEdit = auth?.role_permissions?.can_edit  // true/false based on role

// Stored in app_role_permissions table
app_role_permissions:
  app_id: 'validai'
  role: 'admin'
  permissions: { "can_edit": true, "can_delete": true, "can_export": true }
```

#### 3. get_user_authorization() Database Function

The PRIMARY authorization function - returns complete context in ONE query:

```sql
CREATE OR REPLACE FUNCTION public.get_user_authorization(
  p_org_id uuid DEFAULT NULL,
  p_app_id text DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  user_role text,  -- 'owner', 'admin', 'member', 'viewer'
  app_id text,
  app_name text,
  tier_name text,
  tier_display_name text,
  tier_features jsonb,  -- Features from subscription tier
  tier_limits jsonb,    -- Usage limits from tier
  role_permissions jsonb,  -- Permissions from user's role
  current_usage jsonb,  -- Current usage this period
  subscription_status text
) AS $$
-- ... (Implementation handles organization resolution, role lookup, and joins)
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

#### 4. Authorization Hooks

All hooks are in `@playze/shared-auth`:

**Primary Hook:**

```typescript
import { useAuthorization } from '@playze/shared-auth'

// Returns complete authorization context in ONE query
const { data: auth, isLoading } = useAuthorization('validai')

// Access all authorization data:
auth.user_role           // 'owner' | 'admin' | 'member' | 'viewer'
auth.tier_features       // { "export_reports": true, ... }
auth.role_permissions    // { "can_edit": true, "can_delete": false, ... }
auth.tier_limits         // { "documents": 500, ... }
auth.current_usage       // { "documents": 125, ... }
```

**Convenience Hooks (all use useAuthorization internally):**

```typescript
import {
  useFeatureAccess,   // Check tier feature
  usePermission,      // Check role permission
  useHasRole          // Check user's role
} from '@playze/shared-auth'

// Tier-based feature check
const { data: canExport } = useFeatureAccess('validai', 'export_reports')

// Role-based permission check
const { data: canEdit } = usePermission('validai', 'can_edit')

// Role check
const { data: isAdmin } = useHasRole('validai', ['owner', 'admin'])
```

#### 5. AuthGate Component

Unified component supporting all authorization patterns:

```typescript
import { AuthGate } from '@playze/shared-ui'

// Pattern 1: Tier-based feature gate
<AuthGate appId="validai" feature="export_reports">
  <ExportButton />
</AuthGate>

// Pattern 2: Role-based permission gate
<AuthGate appId="validai" permission="can_edit">
  <EditButton />
</AuthGate>

// Pattern 3: Role requirement
<AuthGate appId="validai" role={['owner', 'admin']}>
  <AdminPanel />
</AuthGate>

// Pattern 4: Combined (tier + permission)
<AuthGate
  appId="validai"
  feature="advanced_ai"
  permission="can_edit"
  requireAll={true}
>
  <AdvancedEditor />
</AuthGate>
```

---

## Multi-Tenancy Model

### Organization as Tenant

**Core Concept:** Organizations (companies/teams) are the tenant unit, not individual users.

```
Organization: "Acme Corp"
├─ Members: [john@acme.com (owner), jane@acme.com (admin), bob@acme.com (member)]
├─ Subscriptions:
│  └─ ValidAI: Pro tier
└─ Data:
   ├─ validai_documents (100 documents)
   └─ validai_processors (5 processors)
```

### Per-App Subscriptions

Organizations can have **different subscription tiers for different apps**:

```sql
CREATE TABLE organization_app_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  app_id text REFERENCES apps(id),
  tier_id uuid REFERENCES app_tiers(id),
  tier_name text NOT NULL,  -- 'free', 'pro', 'enterprise'
  status text NOT NULL,      -- 'active', 'past_due', 'canceled'

  -- Billing management (MVP)
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  last_invoice_date timestamptz,
  last_payment_date timestamptz,

  -- Manual management by platform admins
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now(),
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, app_id)
);
```

**Example: Different Organizations**

```sql
-- Company A: ValidAI Free
INSERT INTO organization_app_subscriptions (organization_id, app_id, tier_name, status)
VALUES ('company-a-uuid', 'validai', 'free', 'active');

-- Company B: ValidAI Pro
INSERT INTO organization_app_subscriptions (organization_id, app_id, tier_name, status)
VALUES ('company-b-uuid', 'validai', 'pro', 'active');
```

### Organization Switching Flow

Users can belong to multiple organizations and switch between them:

**Flow:**

```
1. User clicks Organization Switcher
   └─> Shows list of all user's organizations

2. User selects "Company B"
   └─> Calls Edge Function: switch-organization

3. Edge Function validates access
   └─> Checks organization_members table

4. Updates JWT app_metadata
   └─> Sets organization_id = "company-b-uuid"

5. Client refreshes session
   └─> Gets new JWT with updated context

6. All queries now filtered to Company B data
   └─> RLS policies use new organization_id
```

**Implementation:**

```typescript
// Edge Function: supabase/functions/auth/switch-organization/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { organizationId } = await req.json()
  const authHeader = req.headers.get('Authorization')!
  const token = authHeader.replace('Bearer ', '')

  // Get user from token
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Verify user has access to this organization
  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return new Response('Not a member of this organization', { status: 403 })
  }

  // Update JWT metadata
  await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      organization_id: organizationId,
    }
  })

  return new Response(JSON.stringify({ success: true }))
})
```

**Client Usage:**

```typescript
// React component
import { useSwitchOrganization } from '@playze/shared-auth'

function OrganizationSwitcher() {
  const switchOrg = useSwitchOrganization()

  const handleSwitch = async (orgId: string) => {
    await switchOrg.mutateAsync(orgId)
    // Session automatically refreshed
    // All data refetched with new org context
    router.refresh()
  }
}
```

---

## Shared Services

ValidAI Core Framework provides shared services via **Edge Functions** and **Database Functions**.

### Core Edge Functions (Service-Role Operations)

Located in `supabase/functions/`:

#### Authentication Functions

**`auth/switch-organization`**
- Updates JWT metadata with new organization context
- Requires: `organizationId`
- Validates: User membership in target organization

#### Admin Functions

**`admin/create-organization`** ✅ DEPLOYED
- Creates new organization (platform admin only)
- Assigns initial owner and sets up subscriptions
- Returns: Organization details

### Core Database Functions (PostgREST)

Complex queries that involve multiple tables.

**PRIMARY AUTHORIZATION FUNCTION:**

```sql
-- get_user_authorization() - Complete auth context in ONE query
-- Returns: role, tier features, role permissions, usage, limits
-- Called by: useAuthorization() hook
-- Performance: Single query, 5-min cache, all hooks share result
```

**ORGANIZATION FUNCTIONS:**

```sql
-- Get user's organizations with roles
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  user_role text,
  joined_at timestamptz
) AS $$
-- ... (Returns all organizations user is member of)
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get organization's app access and features
CREATE OR REPLACE FUNCTION get_organization_apps(org_id uuid DEFAULT NULL)
RETURNS TABLE (
  app_id text,
  app_name text,
  tier_name text,
  tier_display_name text,
  status text,
  features jsonb,
  limits jsonb,
  current_usage jsonb
) AS $$
-- ... (Returns all apps org has access to with their features)
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### What Apps Should NOT Implement

Apps should **never** implement their own versions of:

❌ Authentication/authorization logic
❌ Organization management
❌ Billing/subscription handling
❌ JWT manipulation
❌ User invitation flows

Instead, apps should:

✅ Use shared Edge Functions
✅ Call shared database functions via PostgREST
✅ Respect RLS policies
✅ Import shared packages

---

## User & Organization Management

### User Lifecycle

**1. Invitation (MVP Flow)**

> **B2B Model:** Users cannot self-register. All users must be invited to an existing organization.

```sql
-- Triggered when user accepts invitation and creates account
CREATE OR REPLACE FUNCTION handle_invited_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_org_id uuid;
  invitation_role text;
BEGIN
  -- Create user profile
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');

  -- Check for pending invitation
  SELECT organization_id, role INTO invitation_org_id, invitation_role
  FROM organization_invitations
  WHERE email = NEW.email
    AND status = 'pending'
  LIMIT 1;

  -- If invited, add to organization
  IF invitation_org_id IS NOT NULL THEN
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (invitation_org_id, NEW.id, invitation_role);

    -- Mark invitation as accepted
    UPDATE organization_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE email = NEW.email AND organization_id = invitation_org_id;

    -- Set initial organization in JWT
    UPDATE auth.users
    SET raw_app_metadata = jsonb_set(
      COALESCE(raw_app_metadata, '{}'::jsonb),
      '{organization_id}',
      to_jsonb(invitation_org_id)
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**2. Profile Management**

```typescript
// User can update their own profile
const { error } = await supabase
  .from('profiles')
  .update({ full_name: 'New Name' })
  .eq('id', user.id)
```

### User Preferences

**Shared Preferences** (apply across all apps):

```sql
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),

  -- Shared settings
  theme text DEFAULT 'system',         -- 'light', 'dark', 'system'
  language text DEFAULT 'en',          -- 'en', 'es', 'fr', etc.
  timezone text DEFAULT 'UTC',

  -- Notification preferences
  email_notifications boolean DEFAULT true,
  push_notifications boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**App-Specific Settings** (stored per app):

```sql
-- Each app can have its own settings table
CREATE TABLE validai_user_settings (
  user_id uuid REFERENCES auth.users(id),
  organization_id uuid REFERENCES organizations(id),

  -- ValidAI-specific preferences
  default_processor text,
  auto_execute boolean DEFAULT false,
  notification_preferences jsonb DEFAULT '{}'::jsonb,

  PRIMARY KEY (user_id, organization_id)
);
```

### Organization Management

**Creating Organizations (Platform Admin Only):**

> **MVP:** Only platform administrators can create organizations. User-created organizations are roadmap.

```typescript
// Platform admin creates organization via admin portal
await supabase.functions.invoke('admin/create-organization', {
  body: {
    name: 'Acme Corp',
    slug: 'acme-corp',
    initialOwnerEmail: 'owner@acmecorp.com',
    appSubscriptions: [
      { appId: 'validai', tierName: 'pro' }
    ]
  }
})
```

**Member Management:**

```typescript
// Get organization members
const { data } = await supabase
  .from('organization_members')
  .select(`
    *,
    profiles (full_name, avatar_url)
  `)
  .eq('organization_id', currentOrgId)
```

---

## App Integration Patterns

### How Apps Connect to Framework

**1. Import Shared Packages**

```json
// apps/validai/package.json
{
  "name": "@playze/validai",
  "dependencies": {
    "@playze/shared-ui": "workspace:*",
    "@playze/shared-auth": "workspace:*",
    "@playze/shared-types": "workspace:*"
  }
}
```

**2. Use Shared Authentication**

```typescript
// apps/validai/app/layout.tsx
import { createServerClient } from '@playze/shared-auth/server'

export default async function RootLayout({ children }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <html>{children}</html>
}
```

**3. Check App Access**

```typescript
// apps/validai/middleware.ts
import { createServerClient } from '@playze/shared-auth/server'

export async function middleware(request: NextRequest) {
  const supabase = await createServerClient()

  // Check if org has ValidAI access using the authorization function
  const { data: auth } = await supabase.rpc('get_user_authorization', {
    p_org_id: undefined,
    p_app_id: 'validai'
  })

  if (!auth || auth.length === 0) {
    return NextResponse.redirect('/no-access')
  }

  return NextResponse.next()
}
```

**4. Query App-Specific Data with RLS**

```typescript
// apps/validai/app/documents/page.tsx
import { createServerClient } from '@playze/shared-auth/server'

export default async function DocumentsPage() {
  const supabase = await createServerClient()

  // RLS automatically filters to current organization
  const { data: documents } = await supabase
    .from('validai_documents')
    .select('*')

  return <DocumentsList documents={documents} />
}
```

**5. Feature Gating & Authorization**

```typescript
// apps/validai/components/export-button.tsx
import { AuthGate } from '@playze/shared-ui'
import { useFeatureAccess, usePermission } from '@playze/shared-auth'

// Pattern 1: Using AuthGate component (recommended)
export function ExportButton() {
  return (
    <AuthGate appId="validai" feature="export_reports" permission="can_export" requireAll>
      <Button onClick={handleExport}>Export Report</Button>
    </AuthGate>
  )
}

// Pattern 2: Using hooks directly (for custom logic)
export function ExportButtonCustom() {
  const { data: canExport } = useFeatureAccess('validai', 'export_reports')
  const { data: hasPermission } = usePermission('validai', 'can_export')

  if (!canExport || !hasPermission) {
    return <UpgradeToPro />
  }

  return <Button onClick={handleExport}>Export Report</Button>
}
```

### App-Specific Tables Pattern

**Always include organization_id for multi-tenancy:**

```sql
-- Good: Includes organization_id
CREATE TABLE validai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  file_path text,
  status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE validai_documents ENABLE ROW LEVEL SECURITY;

-- Standard RLS policy
CREATE POLICY "Users access documents in their org with app access"
  ON validai_documents FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- Indexes for performance
CREATE INDEX validai_documents_org_id_idx ON validai_documents(organization_id);
```

### Shared Components Usage

```typescript
// apps/validai/app/dashboard/page.tsx
import { AppSwitcher, Card, Button, AuthGate } from '@playze/shared-ui'
import { useCurrentOrganization, useAuthorization } from '@playze/shared-auth'

export default function ValidAIDashboard() {
  const { data: org } = useCurrentOrganization()
  const { data: auth } = useAuthorization('validai')

  return (
    <div>
      <AppSwitcher />  {/* Shows all apps user's org has access to */}

      <Card>
        <h1>ValidAI Dashboard</h1>
        <p>Organization: {org?.name}</p>
        <p className="text-sm text-muted-foreground">
          Tier: {auth?.tier_display_name} | Role: {auth?.user_role}
        </p>
      </Card>

      {/* Tier-based feature */}
      <AuthGate appId="validai" feature="advanced_ai">
        <AdvancedProcessing />
      </AuthGate>

      {/* Role-based permission */}
      <AuthGate appId="validai" permission="can_edit">
        <EditControls />
      </AuthGate>

      {/* App-specific content */}
      <DocumentList />
    </div>
  )
}
```

---

## Development Guidelines

### Adding a New App

**Step 1: Create App Directory**

```bash
cd apps/
mkdir newapp
cd newapp
pnpm init
```

**Step 2: Add Dependencies**

```json
{
  "name": "@playze/newapp",
  "dependencies": {
    "@playze/shared-ui": "workspace:*",
    "@playze/shared-auth": "workspace:*",
    "@playze/shared-types": "workspace:*",
    "next": "15.0.0",
    "react": "19.0.0"
  }
}
```

**Step 3: Create Database Migration**

```sql
-- supabase/migrations/YYYYMMDD_newapp_schema.sql

-- App-specific tables
CREATE TABLE newapp_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE newapp_entities ENABLE ROW LEVEL SECURITY;

-- Standard RLS policy
CREATE POLICY "Users access entities in their org with app access"
  ON newapp_entities FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('newapp')
  );

CREATE INDEX newapp_entities_org_id_idx ON newapp_entities(organization_id);
```

**Step 4: Register App in Framework**

```sql
-- Add app to catalog
INSERT INTO apps (id, name, description, is_active)
VALUES ('newapp', 'NewApp', 'Description of NewApp', true);

-- Define tiers
INSERT INTO app_tiers (app_id, tier_name, display_name, features, limits)
VALUES
  ('newapp', 'free', 'Free', '{"basic_feature": true}', '{"entities": 10}'),
  ('newapp', 'pro', 'Professional', '{"basic_feature": true, "advanced_feature": true}', '{"entities": 1000}');
```

**Step 5: Implement App**

```typescript
// apps/newapp/app/layout.tsx
import { createServerClient } from '@playze/shared-auth/server'
import { AppSwitcher } from '@playze/shared-ui/components'

export default async function Layout({ children }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html>
      <body>
        <AppSwitcher />
        {children}
      </body>
    </html>
  )
}
```

### Naming Conventions Summary

| Item | Convention | Example |
|------|------------|---------|
| **Tables** | `{app_id}_{entity}` | `validai_documents` |
| **Shared tables** | No prefix | `organizations` |
| **Edge Functions** | `{category}/{action}` | `auth/switch-organization` |
| **Database Functions** | `{verb}_{noun}` | `get_user_organizations()` |
| **React Components** | PascalCase | `AppSwitcher` |
| **Hooks** | `use{Name}` | `useCurrentOrganization` |
| **Packages** | `@playze/{name}` | `@playze/shared-ui` |

### Import Paths

```typescript
// Shared UI components
import { Button, Card, AuthGate } from '@playze/shared-ui'
import { AppSwitcher, OrgSwitcher } from '@playze/shared-ui'

// Shared auth hooks
import {
  useAuth,
  useCurrentOrganization,
  useUserOrganizations,
  useAuthorization,      // Primary authorization hook (tier + role)
  useFeatureAccess,      // Check tier-based feature
  usePermission,         // Check role-based permission
  useHasRole,            // Check user's role
  useOrganizationApps    // Get org's app subscriptions
} from '@playze/shared-auth'

// Shared types
import type {
  Organization,
  UserAuthorization,
  OrganizationApp
} from '@playze/shared-types'

// App-specific
import { DocumentList } from '@/components/document-list'
import { getDocuments } from '@/lib/queries'
```

### Environment Variables

**Shared across all apps:**

```env
# .env.local (in repo root)
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Edge Functions only
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**App-specific:**

```env
# apps/validai/.env.local
NEXT_PUBLIC_APP_ID=validai
NEXT_PUBLIC_APP_NAME=ValidAI
NEXT_PUBLIC_APP_URL=https://validai.domain.com
```

---

## Example Scenarios

### Scenario 1: Company A - Single App Free Tier

**Setup:**

- Organization: "City of Springfield"
- Subscription: ValidAI Free
- Users: 2 (John - owner, Jane - member)

**Access Matrix:**

| App | Access | Features |
|-----|--------|----------|
| ValidAI | ✅ Free | Basic processing, 10 documents limit |

**User Experience:**

1. John receives invitation email from platform admin
2. Clicks invite link → creates account with credentials
3. Logs in to ValidAI (no signup option shown)
4. Sees "City of Springfield" as active organization
5. Can create up to 10 documents (free tier limit)
6. Tries to use advanced AI → shown "Contact Admin" prompt
7. Organization owner contacts platform admin to upgrade tier

**Database State:**

```sql
-- organization_app_subscriptions
| org_id | app_id  | tier_name | status |
|--------|---------|-----------|--------|
| city   | validai | free      | active |

-- organization_members
| org_id | user_id | role   |
|--------|---------|--------|
| city   | john    | owner  |
| city   | jane    | member |
```

### Scenario 2: User in Multiple Organizations

**Setup:**

- User: Sarah
- Organizations:
  - "City of Springfield" (member) → ValidAI Free
  - "State DOT" (admin) → ValidAI Enterprise

**User Experience:**

1. Sarah logs in
2. Default organization: "City of Springfield"
3. Opens organization switcher → sees both organizations
4. Switches to "State DOT"
   - Edge Function called: `switch-organization`
   - JWT updated with new org_id
   - Session refreshed
5. Now sees Enterprise features in ValidAI

**JWT Changes:**

```javascript
// Before switch (City of Springfield)
{
  "app_metadata": {
    "organization_id": "city-uuid",
    "organizations": [
      { "id": "city-uuid", "role": "member" },
      { "id": "state-uuid", "role": "admin" }
    ]
  }
}

// After switch (State DOT)
{
  "app_metadata": {
    "organization_id": "state-uuid",  // Changed
    "organizations": [
      { "id": "city-uuid", "role": "member" },
      { "id": "state-uuid", "role": "admin" }
    ]
  }
}
```

### Scenario 3: Feature Gating in Action

**Situation:** User tries to use advanced AI processing in ValidAI Free tier

```typescript
// apps/validai/components/processor-card.tsx
import { AuthGate } from '@playze/shared-ui'
import { useAuthorization } from '@playze/shared-auth'

export function ProcessorCard() {
  const { data: auth } = useAuthorization('validai')

  return (
    <Card>
      <h2>Document Processor</h2>

      {/* Basic processing always available */}
      <Button onClick={handleBasicProcess}>Basic Processing</Button>

      {/* Advanced AI requires Pro tier */}
      <AuthGate appId="validai" feature="advanced_ai" permission="can_execute">
        <Button onClick={handleAdvancedProcess}>Advanced AI Processing</Button>
      </AuthGate>
    </Card>
  )
}
```

**What happens:**

1. Component loads → `useAuthorization('validai')` called
2. **ONE database query:** `get_user_authorization()` returns:
   ```json
   {
     "tier_features": { "advanced_ai": false },
     "role_permissions": { "can_execute": true },
     "tier_display_name": "Free",
     "user_role": "member"
   }
   ```
3. `AuthGate` checks both conditions (tier + permission)
4. Tier check fails → shows default upgrade prompt
5. UI shows contact prompt (no self-service billing in MVP)
6. Result cached for 5 minutes

---

## Summary

**ValidAI Core Framework provides:**

✅ **Single Sign-On** - One login, all apps
✅ **B2B Multi-tenancy** - Organization-based with invite-only access
✅ **Per-app subscriptions** - Manually assigned by platform admins
✅ **RBAC** - Organization roles + app-level access
✅ **Shared components** - UI library and utilities
✅ **Centralized services** - Auth, org management, admin portal

**Apps built on ValidAI Core Framework:**

✅ **Share** auth, orgs, subscription infrastructure
✅ **Own** their data (prefixed tables)
✅ **Respect** subscription limits via feature checks
✅ **Leverage** Supabase (PostgREST, RLS, Edge Functions)
✅ **Import** shared packages (@playze/shared-*)

**Key Architecture Decisions:**

✅ **Monorepo** - Single repo, fast iteration
✅ **Single Supabase project** - True data sharing
✅ **Table prefixes** - Clear app boundaries (`validai_`, `futureapp_`)
✅ **JWT-based context** - Organization in token metadata
✅ **Edge Functions for service-role** - JWT updates, admin ops
✅ **PostgREST for queries** - Complex operations as DB functions

**MVP Constraints (B2B Focus):**

🔒 **Invite-only** - No self-signup (roadmap)
🔒 **Admin-created orgs** - Users cannot create organizations (roadmap)
🔒 **Manual billing** - No PSP integration (roadmap)
🔒 **No self-service** - Contact-based upgrades (automation is roadmap)

This architecture enables building a family of B2B SaaS applications with shared infrastructure, starting with a simple admin-managed model that can evolve into self-service as the business grows.
