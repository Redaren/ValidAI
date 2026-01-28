# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **⚠️ Platform Under Development:** ValidAI Core Framework is being built in phases.
>
> **Current Status (2025-10-24):**
> - ✅ **Phase 1 COMPLETE:** Monorepo Foundation (pnpm, Turborepo)
> - ✅ **Phase 2 COMPLETE:** Framework Import (4 shared packages, admin-portal, testapp, migrations)
> - ⚠️ **Phase 3 NOT STARTED:** ValidAI Integration with Framework
> - ⚠️ **Phase 4 NOT STARTED:** Additional Apps
>
> **Important:** ValidAI app exists but has not yet been fully integrated with shared packages. Admin Portal and Test App demonstrate proper framework integration.

## Project Overview

ValidAI Core Framework is a multi-tenant B2B SaaS platform built as a monorepo containing multiple Next.js applications that share authentication, organization management, and billing infrastructure via Supabase.

**ValidAI Application** (document processing and AI validation) is the **first application** built on this framework, demonstrating the integration patterns for future apps.

The framework provides centralized services for a family of applications (ValidAI, Admin Portal, future apps) with per-app subscriptions and feature gating.

**Framework Origin:** ValidAI Core Framework was imported from Playze Core in Phase 2, bringing battle-tested multi-tenant infrastructure to support ValidAI and future applications.

## 🚨 CRITICAL: Supabase Platform Best Practices

**ValidAI Core Framework uses Supabase as a complete Backend-as-a-Service (BaaS) platform, NOT just a database.**

Read the Supabase Architecture Guide first: https://supabase.com/docs/guides/getting-started/architecture

### Platform Capabilities We MUST Use

Supabase provides these features out-of-the-box that you MUST use instead of building custom solutions:

1. **PostgREST** - Automatic REST API from your database schema
2. **Database Functions** - SQL/plpgsql functions for complex business logic
3. **Row Level Security (RLS)** - Authorization at the database level
4. **Edge Functions** - Deno-based serverless functions for service-role operations
5. **Real-time Subscriptions** - WebSocket connections for live data
6. **Authentication** - Built-in auth with JWT and user management
7. **Storage** - File uploads and serving with RLS policies

### ✅ DO - ALWAYS

1. **Use PostgREST directly** for all database operations
   - Simple CRUD: Direct table queries via `supabase.from('table')`
   - Complex queries: Database functions via `supabase.rpc('function_name')`

2. **Create database functions** (not API routes) when you need:
   - Multi-table operations in a single transaction
   - Complex business logic that belongs near the data
   - Computed aggregations or analytics
   - Return type: ALWAYS use `RETURNS TABLE` format, not JSON

3. **Use Edge Functions ONLY** when you need:
   - Service-role operations (JWT metadata updates, admin operations)
   - External API integrations (payment processors, email services)
   - File processing or transformations
   - Operations that MUST bypass RLS with proper validation

4. **Leverage RLS policies** for all authorization
   - Let the database handle data access control
   - Use `auth.uid()` and `auth.jwt()` in policies

5. **Use real-time subscriptions** for live data
   - Replace polling with `supabase.channel().on('postgres_changes')`

### ❌ DON'T - NEVER

1. **NEVER create Next.js API routes** for:
   - Database CRUD operations (use PostgREST)
   - Simple data fetching (use PostgREST)
   - Complex queries (use database functions)
   - Authorization logic (use RLS policies)

2. **NEVER use Edge Functions** for:
   - Simple database queries (use PostgREST)
   - Operations that RLS can handle (use RLS policies)
   - Client-accessible CRUD (use PostgREST with RLS)

3. **NEVER build custom solutions** for:
   - Authentication (use Supabase Auth)
   - File uploads (use Supabase Storage)
   - Real-time updates (use Supabase Realtime)
   - API generation (use PostgREST)

### Decision Tree for Data Operations

```
Need to fetch/modify data?
├─ Simple CRUD on single table?
│  └─ ✅ Use PostgREST directly: supabase.from('table')
│
├─ Complex query with joins/aggregations?
│  └─ ✅ Create database function: supabase.rpc('function_name')
│
├─ Need service-role permissions?
│  └─ ✅ Create Edge Function: supabase.functions.invoke('function-name')
│
└─ Need real-time updates?
   └─ ✅ Use subscriptions: supabase.channel().on('postgres_changes')
```

### Exceptions (The ONLY Times to Create API Routes)

1. **Authentication callback routes** (OAuth flows, email confirmations)
2. **Admin-only migration tools** (one-time data migrations)
3. **Third-party webhooks** that require specific Next.js middleware

If you're about to create an API route, STOP and ask:
- Can PostgREST handle this? (90% yes)
- Can a database function handle this? (9% yes)
- Can an Edge Function handle this? (0.9% yes)
- Is this truly an exception? (0.1% maybe)

## Development Commands

### Prerequisites

**Required Node Version:** Node.js 22.x or higher

```bash
# Check your Node version
node --version  # Should be v22.x.x or higher

# Use .nvmrc for automatic version management
nvm use  # Automatically uses version from .nvmrc
# OR with other version managers:
asdf install  # Uses .nvmrc
fnm use  # Uses .nvmrc
```

**Why Node 22?** All apps use `@types/node@^22` for consistent TypeScript definitions. Using different Node versions will cause type mismatches and potential runtime issues.

### Common Commands

```bash
# From repository root (monorepo)
pnpm install              # Install all workspace dependencies
pnpm dev                  # Run all apps in development (via Turbo)
pnpm build                # Build all apps
pnpm lint                 # Lint all packages
pnpm format               # Format code with Prettier
pnpm clean                # Clean all build artifacts

# Run specific app (current apps)
pnpm --filter @playze/validai dev          # ValidAI app
pnpm --filter @playze/admin-portal dev     # Admin Portal
pnpm --filter @playze/testapp dev          # Test app (reference)

# Future apps (Phase 4+)
pnpm --filter @playze/futureapp dev

# Work in shared packages
cd packages/shared-ui && pnpm dev
cd packages/shared-auth && pnpm build
```

### Testing Commands
```bash
# Run tests across all apps
pnpm test                # Run unit tests with Vitest
pnpm test:watch          # Run tests in watch mode
pnpm test:coverage       # Run tests with coverage report
pnpm test:all            # Run all tests

# Test specific app
pnpm --filter @playze/validai test
```

### Code Quality
```bash
pnpm format              # Format code with Prettier
pnpm lint:fix            # Fix ESLint issues automatically
pnpm typecheck           # Type check all apps
```

### Supabase Commands (From Root)
```bash
# Supabase is at root level (shared across apps)
npx supabase db push              # Push migrations to remote
npx supabase gen types typescript # Generate TypeScript types
npx supabase functions deploy     # Deploy Edge Functions
```

### 🚨 Monorepo Best Practices (CRITICAL)

**All team members MUST follow these rules:**

1. **Install pnpm globally** (required for all developers)
   ```bash
   npm install -g pnpm
   ```

2. **ALWAYS run commands from repository root**
   - ✅ Correct: `pnpm dev` (from root)
   - ✅ Correct: `pnpm --filter @playze/validai dev` (from root)
   - ❌ Wrong: `cd apps/validai && npm dev` (never use npm in monorepo)
   - ❌ Wrong: `cd apps/validai && node_modules/.bin/next dev` (bypass workspace)

3. **Use pnpm filters for specific apps**
   ```bash
   # Run dev server for specific app
   pnpm --filter @playze/validai dev
   pnpm --filter @playze/admin-portal dev

   # Build specific app
   pnpm --filter @playze/validai build

   # Lint specific app
   pnpm --filter @playze/validai lint
   ```

4. **Turborepo caching** - Subsequent builds are 3-10x faster
   - First build: ~20-30 seconds
   - Cached build: ~2-5 seconds (if no changes)
   - Cache stored in `.turbo/` directory
   - Cache is safe to delete: `pnpm clean`

5. **Environment variables location**
   - ❌ Wrong: `.env.local` in repository root
   - ✅ Correct: `.env.local` in each app directory (e.g., `apps/validai/.env.local`)
   - Each app can have its own environment variables
   - Shared Supabase config goes in each app's `.env.local`

6. **Never use npm/yarn commands**
   - All `npm` commands will fail or cause issues
   - Always use `pnpm` equivalents
   - `package-lock.json` and `yarn.lock` should not exist

7. **Working with node_modules**
   - Root `node_modules/` contains shared dependencies
   - Each app has its own `node_modules/` (symlinked by pnpm)
   - Don't manually edit `node_modules/` - changes will be lost
   - To reinstall: `pnpm install --force`

8. **Adding new dependencies**
   ```bash
   # Add to specific app
   pnpm --filter @playze/validai add <package>

   # Add dev dependency to specific app
   pnpm --filter @playze/validai add -D <package>

   # Add to root (workspace-wide dev tools only)
   pnpm add -D -w <package>
   ```

9. **Troubleshooting**
   ```bash
   # If you see "workspace not found" errors:
   pnpm install

   # If builds are failing unexpectedly:
   pnpm clean && pnpm install

   # If TypeScript can't find packages:
   # Restart your IDE/TypeScript server
   ```

## Architecture

### ✅ CREATED: Shared Packages (Phase 2 Complete)

**Status:** Packages imported from Playze Core and building successfully. Integration into ValidAI app begins in Phase 3.

**Note:** ValidAI app still uses local implementations. Admin Portal demonstrates proper framework integration.

**All apps MUST import from these packages instead of duplicating code:**

- **`@playze/shared-types`** - Auto-generated database types + shortcuts
  - Generated from Supabase: `pnpm --filter @playze/shared-types gen:types`
  - Import: `import type { Organization, UserOrganization } from '@playze/shared-types'`

- **`@playze/shared-auth`** - Supabase clients + auth hooks
  - Server: `import { createServerClient } from '@playze/shared-auth/server'`
  - Client hooks: `import { useAuth, useCurrentOrganization } from '@playze/shared-auth'`
  - Contains decision tree at `@playze/shared-auth/lib/decision-tree`

- **`@playze/shared-ui`** - shadcn/ui components + platform components
  - UI primitives: `import { Button, Card } from '@playze/shared-ui'`
  - Platform: `import { AppSwitcher, OrgSwitcher, AuthGate } from '@playze/shared-ui'`

- **`@playze/shared-config`** - ESLint, TypeScript, Tailwind configs
  - Warns when creating API routes (anti-pattern)

**Package Dependency Order:** shared-types → shared-auth → shared-ui

### Monorepo Structure
- **Workspace**: pnpm workspace with Turborepo for build orchestration
- **Apps Directory**: Multiple Next.js applications (`apps/validai/`, `apps/admin-portal/`, `apps/testapp/`)
- **Shared Packages**: Reusable code (`@playze/shared-ui`, `@playze/shared-auth`, `@playze/shared-types`, `@playze/shared-config`)
- **Single Supabase Project**: All apps share one Supabase instance with table prefixes for isolation
- **App Router**: All apps use Next.js 15 App Router pattern
- **Authentication**: Cookie-based auth via Supabase middleware
- **State Management**: TanStack Query + Zustand architecture
- **UI Components**: shadcn/ui with Radix primitives
- **Styling**: Tailwind CSS with theme support
- **Quality**: ESLint + Prettier + Husky hooks + GitHub Actions

### Directory Structure

```
validai/                                    # Root repository
├── apps/
│   ├── validai/                       # ValidAI application (document processing)
│   │   ├── app/                       # Next.js app directory
│   │   ├── components/                # App-specific components
│   │   ├── lib/                       # App-specific utilities
│   │   ├── stores/                    # Zustand state stores
│   │   └── package.json
│   │
│   ├── testapp/                       # Reference implementation
│   │   ├── app/
│   │   │   ├── dashboard/             # Dashboard with authorization demo
│   │   │   └── layout.tsx             # Uses shared-auth and shared-ui
│   │   ├── components/                # App-specific components
│   │   └── package.json
│   │
│   └── admin-portal/                  # Platform administration
│       ├── app/
│       │   ├── (admin)/
│       │   │   ├── organizations/     # CRUD orgs + members + subscriptions
│       │   │   ├── subscriptions/     # Manage app subscriptions
│       │   │   └── users/             # View all users + memberships
│       │   ├── layout.tsx             # Admin layout with navigation
│       │   └── page.tsx               # Admin dashboard
│       ├── components/                # Admin-specific components
│       ├── lib/
│       │   ├── queries/               # Database RPC functions (15 admin functions)
│       │   └── validations/           # Zod schemas
│       └── package.json
│
├── packages/                          # Shared framework packages
│   ├── shared-ui/                     # Shared React components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── platform/          # AuthGate, AppSwitcher, OrgSwitcher
│   │   │   │   └── ui/                # shadcn/ui components (19+ components)
│   │   │   ├── hooks/                 # Platform hooks
│   │   │   └── lib/
│   │   └── package.json
│   │
│   ├── shared-auth/                   # Authentication utilities
│   │   ├── src/
│   │   │   ├── client.ts              # Browser client
│   │   │   ├── server.ts              # Server-side client
│   │   │   ├── middleware.ts          # Auth middleware
│   │   │   ├── hooks/                 # 9 authorization hooks
│   │   │   └── lib/
│   │   └── package.json
│   │
│   ├── shared-types/                  # TypeScript types
│   │   ├── src/
│   │   │   ├── database.types.ts      # Generated from Supabase
│   │   │   ├── shortcuts.ts           # Type shortcuts
│   │   │   ├── helpers.ts             # Type utilities
│   │   │   └── platform.types.ts      # Platform-specific types
│   │   └── package.json
│   │
│   └── shared-config/                 # Shared configurations
│       ├── eslint/                    # ESLint configs
│       ├── typescript/                # TypeScript configs
│       └── tailwind/                  # Tailwind base config
│
├── supabase/                          # Shared Supabase project
│   ├── functions/                     # Edge Functions (service-role operations)
│   │   ├── _shared/                   # Shared utilities
│   │   │   ├── supabaseAdmin.ts       # Service-role client
│   │   │   ├── auth.ts                # JWT validation
│   │   │   ├── validation.ts          # Input validation helpers
│   │   │   ├── response.ts            # Standardized responses
│   │   │   └── cors.ts                # CORS headers
│   │   ├── auth/                      # Auth functions
│   │   │   └── switch-organization/   # Updates JWT metadata
│   │   └── admin/                     # Admin functions
│   │       └── create-organization/   # Admin org creation
│   │
│   ├── migrations/                    # Database migrations
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
├── docs/                              # Documentation
│   ├── architecture/                  # Architecture documentation
│   │   ├── validai-core-architecture.md  # Framework architecture
│   │   └── [app-specific docs]/      # App-specific architecture
│   └── updated-migration-plan.md      # Phase 2 import plan
│
├── package.json                       # Root package.json
├── pnpm-workspace.yaml                # Workspace configuration
└── turbo.json                         # Turborepo configuration
```

### Key Files

**Shared Packages:**
- `packages/shared-auth/`: Supabase client configurations (server, client, middleware)
- `packages/shared-ui/`: Shared React components (AppSwitcher, OrgSwitcher, AuthGate, UI primitives)
- `packages/shared-types/`: TypeScript types (Organization, User, Subscription, generated DB types)
- `packages/shared-config/`: Shared ESLint, TypeScript, Tailwind configs

**Apps:**
- `apps/*/middleware.ts`: App-specific session management (imports from `@playze/shared-auth`)
- `apps/*/app/`: Next.js App Router directories
- `apps/*/components/`: App-specific components
- `apps/*/stores/`: Zustand state stores (ALL stores must be here)
- `apps/*/lib/validations/`: Zod validation schemas

**Supabase:**
- `supabase/migrations/`: Database schema migrations for all apps ✅ **IMPLEMENTED**
- `supabase/functions/`: Edge Functions for service-role operations ✅ **PHASE 2 COMPLETE**
  - `_shared/`: Shared utilities (auth, validation, response, cors, supabaseAdmin) ✅
  - `auth/switch-organization/`: Organization context switching ✅
  - `admin/create-organization/`: Admin organization creation ✅

**Documentation:**
- `/docs/architecture/validai-core-architecture.md`: Complete framework architecture
- `/docs/updated-migration-plan.md`: Phase 2 import plan

### Supabase Integration
- **Two Environments** (accessible via MCP):
  - **Production**: `xczippkxxdqlvaacjexj.supabase.co` - Full schema with ValidAI tables
  - **Staging**: `cijfuxvudgoqupvjcbsd.supabase.co`
- **Table Naming Convention**:
  - Core tables: No prefix (`organizations`, `apps`, `profiles`)
  - App tables: Prefixed with app ID (`validai_documents`, `futureapp_entities`)
- **Client Types**:
  - `packages/shared-auth/server.ts`: Server-side client (RSC, Route Handlers)
  - `packages/shared-auth/client.ts`: Client-side operations
  - `packages/shared-auth/middleware.ts`: Session refresh logic
- **Generated Types**: Auto-generated from Supabase schema
- **JWT Metadata**: Contains user identity and current organization details in `app_metadata.organization_id`

### Environment Variables
Required in each app's `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Edge Functions only
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### Database Schema

#### Platform Tables (No Prefix) ✅ IMPLEMENTED
Platform tables are shared across all applications:
- `organizations`, `organization_members`, `organization_invitations`
- `apps`, `app_tiers`, `organization_app_subscriptions`, `organization_app_usage`
- `app_role_permissions`
- `profiles`, `user_preferences`
- `invoices` (manual billing in MVP)
- `admin_users`

#### App-Specific Tables (With Prefix) ✅ IMPLEMENTED
Each application owns its tables with a clear prefix:
- **ValidAI**: `validai_documents`, `validai_processors`, `validai_operations`, `validai_runs`, `validai_operation_results`, `validai_workbench_executions`, `validai_llm_global_settings`
- **Future Apps**: Follow `{app_id}_{entity}` naming convention

#### Naming Rules
1. **Platform tables**: No prefix (e.g., `organizations`, `apps`)
2. **App tables**: `{app_id}_` prefix (e.g., `validai_documents`)
3. **All tables**: snake_case naming
4. **Foreign keys**: Always include `organization_id` for multi-tenancy
5. **Timestamps**: Include `created_at`, `updated_at` where applicable

### Path Aliases
- `@/*`: Maps to app-specific root (configured in each app's tsconfig.json)
- `@playze/shared-ui`: Import shared UI components
- `@playze/shared-auth`: Import auth utilities
- `@playze/shared-types`: Import TypeScript types

## Multi-Tenancy Architecture

### Organization-First Model (B2B SaaS)
- **Tenant Unit**: Organizations (companies/teams), not individual users
- **B2B Flow**: Users invited to existing organizations (admin-created in MVP)
- **Multiple Orgs**: Users can belong to multiple organizations and switch context
- **JWT Context**: Active organization stored in `app_metadata.organization_id`
- **Invite-Only**: No self-signup in MVP—all users must be invited to an organization

### Per-App Subscriptions
- Organizations subscribe to individual apps with different tiers (Free, Pro, Enterprise)
- **Feature Gating**: Apps check subscription tier before allowing feature access
- **Usage Tracking**: Track consumption per organization per app
- **Manual Billing**: Invoice generation and payment tracking (MVP—no PSP integration yet)

### RLS Policy Pattern

All app-specific tables MUST follow this pattern:

```sql
-- Example: ValidAI table
CREATE TABLE validai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  -- ... other columns
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

-- Performance index
CREATE INDEX validai_documents_org_id_idx ON validai_documents(organization_id);
```

**Helper Functions:**

```sql
-- Get current user's organization from JWT
CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if user's org has access to app
CREATE OR REPLACE FUNCTION public.has_app_access(app_name text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_app_subscriptions
    WHERE organization_id = public.user_organization_id()
      AND app_id = app_name
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Organization Switching ✅ IMPLEMENTED (Phase 2 Complete)

Users switch organizations via Edge Function that updates JWT metadata:

```typescript
// Edge Function: supabase/functions/auth/switch-organization/index.ts
// ✅ DEPLOYED & ACTIVE
// Updates app_metadata.organization_id in JWT
// Client receives refreshed session with new org context
```

**Client Usage:**

```typescript
import { useSwitchOrganization } from '@playze/shared-auth'

function OrganizationSwitcher() {
  const switchOrg = useSwitchOrganization()

  const handleSwitch = async (orgId: string) => {
    await switchOrg.mutateAsync(orgId)
    router.refresh() // All data refetched with new org context
  }
}
```

**Current Status:** The Edge Function is deployed and operational. The `useSwitchOrganization` hook in `@playze/shared-auth` is ready to use.

## State Management & Data Fetching

### Modern Architecture (Recommended)
- **TanStack Query**: All database operations, caching, background refetching
- **Zustand**: Client-side UI state and notifications (ALL stores in `/stores`)
- **TypedSupabaseClient**: Generated types for all Supabase operations

### Query Patterns (Use TanStack Query)

**All data fetching MUST use hooks from `@playze/shared-auth` with TanStack Query:**

```typescript
// ✅ CORRECT: Use shared hooks
import { useAuth, useUserOrganizations, useAuthorization } from '@playze/shared-auth'

function MyComponent() {
  const { data: user } = useAuth()
  const { data: orgs } = useUserOrganizations()
  const { data: auth } = useAuthorization('validai')
}
```

**For custom queries, follow the same pattern:**
```typescript
// ✅ CORRECT: Direct PostgREST with TanStack Query
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'

const { data } = useQuery({
  queryKey: ['documents', orgId],
  queryFn: async () => {
    const supabase = createBrowserClient()
    const { data } = await supabase.from('validai_documents').select('*')
    return data
  }
})
```

**Query key factory pattern:** See `@playze/shared-auth/lib/query-keys.ts` for hierarchical key structure.

### Store Management Rules
- **ALWAYS** create Zustand stores in the `stores/` directory
- **NEVER** create stores inside components, hooks, or other directories
- **ALWAYS** use devtools middleware for debugging
- **ALWAYS** export stores through `stores/index.ts`

### Validation Schema Management Rules
- **ALWAYS** create Zod validation schemas in the `lib/validations/` directory
- **NEVER** define validation schemas inline in components or hooks
- **ALWAYS** use common schemas from `common-schemas.ts` for reusable primitives (names, descriptions, tags, UUIDs)
- **ALWAYS** create feature-specific schema files (e.g., `processor-schemas.ts`, `operation-schemas.ts`)
- **ALWAYS** export schemas through `lib/validations/index.ts` for centralized imports
- **ALWAYS** include JSDoc comments explaining what each schema validates and where it's used
- **ALWAYS** export inferred TypeScript types alongside schemas (e.g., `export type CreateProcessorInput = z.infer<typeof createProcessorSchema>`)

### Form Management Rules
- **ALWAYS** use React Hook Form for forms with 3+ fields or complex validation
- **ALWAYS** integrate with Zod schemas using `@hookform/resolvers/zod` (via `zodResolver`)
- **NEVER** manually manage form state with `useState` for multi-field forms
- Simple single-field inputs (search bars, filters) don't require React Hook Form

## Developing Apps in ValidAI Core Framework

### Adding a New App

**Step 1: Create App Directory**
```bash
cd apps/
mkdir newapp
cd newapp
pnpm init
```

**Step 2: Add Workspace Dependencies**
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

-- App-specific tables (use prefix)
CREATE TABLE newapp_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
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

**Step 5: Implement App with Shared Components**
```typescript
// apps/newapp/app/layout.tsx
import { createServerClient } from '@playze/shared-auth/server'
import { AppSwitcher } from '@playze/shared-ui/components'

export default async function Layout({ children }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

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

### App Integration Checklist
- ✅ Import shared auth from `@playze/shared-auth`
- ✅ Check app access in middleware via `public.has_app_access('app_id')`
- ✅ Use `organization_id` in all queries (RLS handles filtering)
- ✅ Implement feature gates with `useFeatureAccess()` hook
- ✅ Use shared UI components from `@playze/shared-ui`
- ✅ Follow table naming convention: `{app_id}_{entity}`
- ✅ Register app and tiers in `apps` and `app_tiers` tables

### Feature Gating Example

```typescript
// apps/validai/components/export-button.tsx (Example)
import { AuthGate } from '@playze/shared-ui'
import { useFeatureAccess } from '@playze/shared-auth'

export function ExportButton() {
  const { data: canExport } = useFeatureAccess('validai', 'export_reports')

  if (!canExport) {
    return (
      <div>
        <p>Export reports available in Pro plan</p>
        <Button variant="secondary" onClick={() => window.open('mailto:support@example.com?subject=Upgrade Request')}>
          Contact Us to Upgrade
        </Button>
      </div>
    )
  }

  return <Button onClick={handleExport}>Export Report</Button>
}

// Or using AuthGate component (recommended)
export function ExportButtonWithGate() {
  return (
    <AuthGate appId="validai" feature="export_reports">
      <Button onClick={handleExport}>Export Report</Button>
    </AuthGate>
  )
}
```

## Admin Portal (`apps/admin-portal/`) ✅ PHASE 2 - SUBSTANTIALLY COMPLETE

The admin portal is a functional Next.js app used by platform administrators to manage the platform.

### Implemented Features
- ✅ **Organization Management**: Create, view, update organizations with member/subscription details
- ✅ **User Management**: View all users and their organization memberships (read-only)
- ✅ **Subscription Management**: Assign, update tier, cancel app subscriptions across organizations
- ✅ **Admin Authorization**: Database-based admin whitelist via `admin_users` table
- ✅ **Data Tables**: Searchable, sortable, paginated tables for all entities

### What's Working
- **Organizations** - Full CRUD with tabs for overview, members, and subscriptions
- **Users** - View all users, profiles, organization memberships, and preferences
- **Subscriptions** - Platform-wide subscription management with tier updates and cancellation
- **Architecture** - 100% admin RPC function pattern (15 database functions), zero API routes, uses all shared packages

### Access Control
- ✅ Admin whitelist via `admin_users` table (middleware checks on every request)
- ✅ Uses SECURITY DEFINER database functions for god-mode access across all organizations
- ✅ Edge Functions verify admin status for service-role operations
- ✅ No self-service in MVP (contact-based model for upgrades and billing)

### Example Routes
- `/organizations` - List and create organizations ✅
- `/organizations/[id]` - Manage organization details, members, and subscriptions ✅
- `/subscriptions` - Manage app subscriptions and tiers ✅
- `/users` - View all platform users ✅
- `/users/[id]` - View user details and memberships ✅

## Example Routes

### Platform Apps
- **ValidAI** (`apps/validai/`): Document processing and AI validation ⚠️ **PHASE 3 - Integration pending**
- **Admin Portal** (`apps/admin-portal/`): Platform administration interface ✅ **PHASE 2 - SUBSTANTIALLY COMPLETE**
- **Test App** (`apps/testapp/`): Reference implementation with authorization demo ✅ **PHASE 2 - COMPLETE**

### Common Routes (Framework)
- `/` - Organization dashboard with app switcher
- `/settings/organization` - Organization member management
- `/settings/subscriptions` - View organization's app subscriptions
- `/settings/profile` - User profile and shared preferences

### ValidAI App Routes (Example)
See [apps/validai/docs/](apps/validai/docs/) for ValidAI-specific architecture and features.

## Quality Standards

### Testing Requirements
- Write tests for all new components and features
- Maintain 80%+ code coverage
- Use React Testing Library for component tests
- Add E2E tests for critical user journeys (framework prepared for future use)

### Code Quality
- ESLint must pass (auto-fixed on commit)
- Code formatted with Prettier (auto-formatted on commit)
- TypeScript strict mode enforced
- Conventional commit messages required

### Development Workflow
- Pre-commit hooks automatically run linting and formatting
- CI pipeline runs all tests on pull requests
- All PRs require code review and passing tests

## Important Notes

### Core Principles
- **Multi-Tenancy**: Always include `organization_id` in app tables and respect RLS policies
- **Table Naming**: Follow prefix convention (`{app_id}_*` for app tables, no prefix for platform)
- **Shared Packages**: Never duplicate auth/UI logic—import from `@playze/shared-*`
- **Feature Gating**: Check subscription tier before allowing feature access
- **Organization Context**: Get active org from JWT `app_metadata.organization_id`

### Technical Guidelines
- **Authentication**: Use shared auth package, never modify session management locally
- **Data Fetching**: Use PostgREST/RPC for all database operations, Edge Functions for service-role operations, TanStack Query for caching
- **Type Safety**: Always use typed Supabase client for database operations
- **Testing**: Write tests before or alongside feature development
- **Quality**: All code must pass automated quality checks

### Admin Operations
- **Edge Functions**: Use for service-role operations (org switching, JWT updates, admin actions)
- **RLS Bypass**: Only Edge Functions with service-role key can bypass RLS (with proper validation)
- **Invite-Only**: MVP is invite-only—users cannot self-signup or create organizations

## Quick Reference

### Architecture Documentation
- `/docs/architecture/validai-core-architecture.md` - Complete framework architecture
- `/docs/updated-migration-plan.md` - Phase 2 import plan
- `apps/validai/docs/` - ValidAI app-specific architecture

### Import Patterns
```typescript
// ✅ Shared packages (ALWAYS import from these)
import type { Organization, UserOrganization, AppTier } from '@playze/shared-types'
import { createServerClient, useAuth, useCurrentOrganization, useAuthorization } from '@playze/shared-auth'
import { Button, Card, AppSwitcher, OrgSwitcher, AuthGate } from '@playze/shared-ui'

// ✅ App-specific (only create if NOT in shared packages)
import { DocumentList } from '@/components/document-list'  // App-specific component
import { documentSchema } from '@/lib/validations'  // App-specific validation

// ❌ NEVER create these in app code (use shared packages instead)
// ❌ import { Button } from '@/components/ui/button'  // Use @playze/shared-ui
// ❌ import { useAuth } from '@/hooks/use-auth'  // Use @playze/shared-auth
// ❌ import { createClient } from '@/lib/supabase/client'  // Use @playze/shared-auth
```

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| **Tables** | `{app_id}_{entity}` | `validai_documents` |
| **Platform tables** | No prefix | `organizations` |
| **Edge Functions** | `{category}/{action}` | `auth/switch-organization` |
| **Database Functions** | `{verb}_{noun}` | `get_user_organizations()` |
| **React Components** | PascalCase | `AppSwitcher` |
| **Hooks** | `use{Name}` | `useCurrentOrganization` |
| **Packages** | `@playze/{name}` | `@playze/shared-ui` |
