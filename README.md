# ValidAI Core Framework

Multi-tenant B2B SaaS platform providing centralized authentication, authorization, billing, and organization management for multiple applications.

> **✅ Production-Ready Framework** imported from Playze Core
>
> **Status:** Core framework complete (Phases 1-2) • ValidAI integration pending • Admin Portal 75% complete • TestApp operational

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Applications](#applications)
5. [Shared Packages](#shared-packages)
6. [Development](#development)
7. [Database & Supabase](#database--supabase)
8. [Implementation Status](#implementation-status)
9. [Documentation](#documentation)
10. [Tech Stack](#tech-stack)

---

## Overview

### What is ValidAI Core Framework?

**ValidAI Core Framework** is a complete B2B SaaS platform framework built as a monorepo. It provides everything needed to build a family of applications that share:

- ✅ **Single Sign-On (SSO)** - One login across all apps
- ✅ **Organization Management** - B2B multi-tenancy with invite-only access
- ✅ **Subscription Management** - Per-app subscriptions with tiered features
- ✅ **Unified Authorization** - Dual model (tier features + role permissions)
- ✅ **Shared UI Components** - Design system and platform components
- ✅ **Centralized Billing** - Organization-level subscription tracking (MVP: manual)

**ValidAI Application** (document processing and AI validation) is the **first application** built on this framework.

### Key Differentiators

**Two Access Patterns:**

| Pattern | Used By | Data Access | Scope |
|---------|---------|-------------|-------|
| **Regular User** | ValidAI, TestApp, future apps | `supabase.from()` + RLS | User's organization only |
| **Admin** | Admin Portal | `supabase.rpc('admin_*')` | All organizations |

**Performance Breakthrough:**
- **Unified Authorization System** - Complete auth context in ONE database query
- 15 authorization checks on a page = 1 database query (not 15!)
- 5-minute cache via TanStack Query

### Framework Origin

ValidAI Core Framework was imported from **Playze Core** (Phase 2 complete, January 2025):
- 4 shared packages (@playze/shared-ui, shared-auth, shared-types, shared-config)
- Admin Portal for platform management
- TestApp for reference implementation
- Complete database schema (11 platform tables, 15+ functions)
- Edge Functions for service-role operations

### Who Should Use This?

- ✅ Building B2B SaaS applications with multi-tenancy
- ✅ Need organization-based access control
- ✅ Want subscription-based feature gating
- ✅ Prefer PostgREST over API routes
- ✅ Building multiple apps that share infrastructure

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 22.0.0 (uses `@types/node@^22`)
- **pnpm** ≥ 9.0.0

```bash
# Install pnpm globally
npm install -g pnpm

# Check versions
node --version  # Should be 22.x.x
pnpm --version  # Should be 9.x.x
```

### Installation

```bash
# Clone repository
git clone <repository-url>
cd Validai

# Install dependencies
pnpm install

# Build shared packages (required before running apps)
pnpm --filter "@playze/shared-*" build
```

### Environment Setup

Create `.env.local` in each app directory:

```env
# apps/<app-name>/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Run Your First App

```bash
# Run TestApp (reference implementation)
pnpm --filter @playze/testapp dev
# Visit http://localhost:3000

# Or run Admin Portal
pnpm --filter @playze/admin-portal dev
# Visit http://localhost:3001

# Or run ValidAI (integration pending)
pnpm --filter @playze/validai dev
# Visit http://localhost:3002
```

---

## Architecture

### Platform Overview

```
┌─────────────────────────────────────────────────────────────┐
│                ValidAI Core Framework                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Apps Layer                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ ValidAI  │  │ TestApp  │  │  Future  │  │  Admin   │    │
│  │ (Phase 3)│  │(Reference)│  │  Apps    │  │ Portal   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └─────────────┴─────────────┴──────────────┘          │
│                          │                                    │
│  ─────────────────────────────────────────────────────────  │
│                          │                                    │
│  Shared Packages Layer                                       │
│  ┌───────────────────────┴───────────────────────┐          │
│  │  @playze/shared-auth    @playze/shared-ui     │          │
│  │  @playze/shared-types   @playze/shared-config │          │
│  └────────────────────┬──────────────────────────┘          │
│                       │                                       │
│  ─────────────────────────────────────────────────────────  │
│                       │                                       │
│  Backend Layer (Supabase)                                    │
│  ┌────────────────────┴──────────────────────────┐          │
│  │  Auth  │  Database  │  Edge Functions  │  RLS  │          │
│  └───────────────────────────────────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Core Concepts

#### 1. Multi-Tenancy (Organization-Based)

**Organizations are the tenant unit**, not individual users.

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

#### 2. Unified Authorization System

**Performance breakthrough:** All authorization hooks share **ONE database query**.

```typescript
// ONE query returns complete auth context
const { data: auth } = useAuthorization('appId')

// Result contains:
// - user_role (owner/admin/member/viewer)
// - tier_features (from subscription tier)
// - role_permissions (from user's role)
// - tier_limits & current_usage
// - tier_display_name
// - subscription_status

// All other hooks use this SAME cached data!
const { data: canExport } = useFeatureAccess('appId', 'export')  // No extra query!
const { data: canEdit } = usePermission('appId', 'can_edit')     // No extra query!
```

#### 3. Row Level Security (RLS)

All app tables use RLS policies to automatically filter data:

```sql
-- Example RLS policy
CREATE POLICY "Users access data in their org with app access"
  ON app_items FOR ALL
  USING (
    organization_id = public.user_organization_id()  -- From JWT
    AND public.has_app_access('appId')               -- Subscription check
  );
```

**Key Point:** You never manually filter by `organization_id` - RLS does it automatically.

#### 4. Two Access Patterns

| Aspect | Regular Users | Admin Users |
|--------|---------------|-------------|
| **Frontend API** | `supabase.from()` | `supabase.rpc()` |
| **Data Access** | RLS-filtered | SECURITY DEFINER bypass |
| **Authorization** | RLS policies | Function-internal checks |
| **Scope** | Single organization | All organizations |
| **Performance** | RLS evaluation | Direct queries (faster) |
| **Examples** | ValidAI, TestApp | Admin Portal |

---

## Applications

### ValidAI (Document Processing) ⚠️

**Purpose:** AI-powered document processing and validation application.

**Location:** [apps/validai/](apps/validai/)

**Status:** Phase 3 - Framework integration pending (app exists, needs integration with shared packages)

**Planned Features:**
- Document upload and storage
- AI-powered processor execution
- Operation result tracking
- Workbench for testing processors
- LLM configuration management

**Quick Start:**
```bash
# Run ValidAI (once Phase 3 integration is complete)
pnpm --filter @playze/validai dev
# Visit http://localhost:3002
```

**Documentation:**
- ValidAI-specific architecture docs: [apps/validai/docs/](apps/validai/docs/)
- Integration will follow TestApp patterns

### TestApp (Reference Implementation) ✅

**Purpose:** Minimal reference application demonstrating all framework patterns.

**Location:** [apps/testapp/](apps/testapp/)

**What it demonstrates:**
- ✅ Magic link authentication
- ✅ Organization context and multi-tenancy
- ✅ Three authorization patterns (tier, role, combined)
- ✅ Proper server/client component split
- ✅ Integration with all shared packages
- ✅ Regular user access pattern (PostgREST + RLS)

**Quick Start:**
```bash
# Setup database
psql -h <host> -U postgres -f apps/testapp/testapp-registration.sql

# Run app
pnpm --filter @playze/testapp dev
# Visit http://localhost:3000
```

**Documentation:**
- [TestApp Developer Guide](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md) - Complete reference (30 min read)
- [Database Setup](apps/testapp/DATABASE_SETUP.md) - App registration
- [README](apps/testapp/README.md) - Quick start

**Key Features:**
- Dashboard with user info, organization context, and app switcher
- Three authorization demo cards showing tier, role, and combined gates
- Comprehensive JSDoc comments explaining patterns
- Complete authentication flow example

### Admin Portal (75% Complete) 🚧

**Purpose:** Platform administration interface for ValidAI administrators.

**Location:** [apps/admin-portal/](apps/admin-portal/)

**What it provides:**
- ✅ Organization management (CRUD + members + subscriptions)
- ✅ User management (view users + memberships)
- ✅ Subscription management (assign, update tier, cancel)
- ✅ Admin authorization (database whitelist)
- ✅ Data tables (searchable, sortable, paginated)

**Access Control:**
- Database whitelist via `admin_users` table
- SECURITY DEFINER functions for god-mode access
- 15 admin database functions (zero API routes)

**Quick Start:**
```bash
# Add yourself to admin whitelist
INSERT INTO admin_users (email) VALUES ('your@email.com');

# Run app
pnpm --filter @playze/admin-portal dev
# Visit http://localhost:3001
```

**Documentation:**
- [Admin Portal README](apps/admin-portal/README.md)
- [Architecture: Elevated Access](docs/playze-core-architecture-elevated-access.md)

### Future Apps (Planned) 📋

**Status:** Phase 4+ - Not yet implemented

**Potential Applications:**
- Additional B2B SaaS applications following the same integration patterns
- All apps will share authentication, organizations, and billing infrastructure

---

## Shared Packages

### @playze/shared-types

**TypeScript types generated from Supabase database schema.**

```typescript
import type {
  Organization,
  UserOrganization,
  OrganizationApp,
  UserAuthorization,
  TypedSupabaseClient
} from '@playze/shared-types'
```

**Features:**
- ✅ Auto-generated database types from Supabase
- ✅ Type shortcuts for common tables/functions
- ✅ Type helpers for advanced patterns
- ✅ Platform-specific business logic types

**Generation:**
```bash
# Regenerate types from database
pnpm --filter @playze/shared-types gen:types
```

### @playze/shared-auth

**Authentication utilities, Supabase clients, and authorization hooks.**

```typescript
import { createServerClient, createBrowserClient } from '@playze/shared-auth'
import {
  useAuth,
  useCurrentOrganization,
  useAuthorization,
  useFeatureAccess,
  usePermission
} from '@playze/shared-auth'
```

**Features:**
- ✅ Server/client Supabase client creators
- ✅ 9 authorization hooks (organization context, features, permissions)
- ✅ Unified authorization system (1 query for all checks)
- ✅ TanStack Query integration with 5-minute cache
- ✅ Session management middleware
- ✅ Supabase architecture decision tree

**Documentation:**
- [Comprehensive README](packages/shared-auth/README.md) - 960 lines covering everything

**Key Exports:**
- **Clients:** `createBrowserClient`, `createServerClient`, `updateSession`
- **Organization:** `useCurrentOrganization`, `useUserOrganizations`, `useOrganizationApps`
- **Authorization:** `useAuthorization` (primary), `useFeatureAccess`, `usePermission`, `useHasRole`
- **User:** `useAuth`, `useSwitchOrganization`

### @playze/shared-ui

**Shared React components (shadcn/ui + platform components).**

```typescript
import {
  Button, Card, Input, Label, Badge,      // UI primitives
  AppSwitcher, OrgSwitcher, AuthGate      // Platform components
} from '@playze/shared-ui'
```

**Features:**
- ✅ 19+ shadcn/ui components (Button, Card, Input, etc.)
- ✅ 3 platform components (AppSwitcher, OrgSwitcher, AuthGate)
- ✅ Tailwind CSS utilities
- ✅ QueryClientProvider setup

**Key Components:**

**AuthGate** - Declarative authorization component:
```typescript
// Tier-based feature gate
<AuthGate appId="validai" feature="export_reports">
  <ExportButton />
</AuthGate>

// Role-based permission gate
<AuthGate appId="validai" permission="can_edit">
  <EditButton />
</AuthGate>

// Combined (tier + role)
<AuthGate
  appId="validai"
  feature="advanced_ai"
  permission="can_export"
  requireAll
>
  <AdvancedExport />
</AuthGate>
```

### @playze/shared-config

**Shared ESLint, TypeScript, and Tailwind configurations.**

**Features:**
- ✅ ESLint configs (base + Next.js with API route warnings)
- ✅ TypeScript configs (base + Next.js, strict mode)
- ✅ Tailwind base config with design tokens
- ✅ Warns when creating API routes (anti-pattern)

**Usage:**
```json
{
  "extends": ["@playze/shared-config/eslint/nextjs"]
}
```

---

## Development

### Project Structure

```
validai/                                # Root repository
├── apps/                               # Applications
│   ├── validai/                        # ⚠️ ValidAI app (Phase 3)
│   │   ├── app/                        # Next.js App Router
│   │   ├── components/                 # App-specific components
│   │   ├── lib/                        # App-specific utilities
│   │   └── stores/                     # Zustand state stores
│   │
│   ├── testapp/                        # ✅ Reference implementation
│   │   ├── app/
│   │   │   ├── dashboard/              # Dashboard with authorization demo
│   │   │   └── layout.tsx              # Uses shared-auth and shared-ui
│   │   ├── components/                 # App-specific components
│   │   └── testapp-registration.sql
│   │
│   └── admin-portal/                   # 🚧 Admin interface (75%)
│       ├── app/(admin)/                # Admin routes
│       ├── components/                 # Admin components
│       └── lib/queries/                # Admin RPC functions
│
├── packages/                           # Shared packages
│   ├── shared-auth/                    # ✅ Auth & authorization
│   ├── shared-ui/                      # ✅ UI components
│   ├── shared-types/                   # ✅ TypeScript types
│   └── shared-config/                  # ✅ Shared configs
│
├── supabase/                           # Backend
│   ├── functions/                      # ✅ Edge Functions
│   │   ├── _shared/                    # Shared utilities
│   │   ├── auth/                       # switch-organization
│   │   └── admin/                      # create-organization
│   │
│   └── migrations/                     # ✅ Database schema
│       ├── 20250117000000_core_schema.sql
│       ├── 20250117000001_rls_policies.sql
│       ├── 20250117000002_helper_functions.sql
│       ├── 20250122000002_unified_authorization.sql
│       └── ...
│
└── docs/                               # Documentation
    ├── architecture/
    │   └── validai-core-architecture.md
    └── updated-migration-plan.md
```

### Common Commands

```bash
# Install dependencies
pnpm install

# Build shared packages (required before running apps)
pnpm --filter "@playze/shared-*" build

# Development
pnpm dev                              # Run all apps
pnpm --filter @playze/testapp dev     # Run specific app

# Build
pnpm build                            # Build all
pnpm --filter @playze/testapp build   # Build specific app

# Code Quality
pnpm lint                             # Lint all packages
pnpm format                           # Format with Prettier
pnpm clean                            # Clean build artifacts

# Testing
pnpm test                             # Run unit tests
pnpm test:watch                       # Watch mode
pnpm test:coverage                    # With coverage
```

### Working with Specific Apps

```bash
# Filter commands (from root)
pnpm --filter @playze/testapp dev
pnpm --filter @playze/testapp build
pnpm --filter @playze/testapp lint

# Or navigate to app directory
cd apps/testapp
pnpm dev
```

### Adding a New App

**Step 1:** Create app directory
```bash
mkdir apps/myapp
cd apps/myapp
pnpm init
```

**Step 2:** Add dependencies
```json
{
  "name": "@playze/myapp",
  "dependencies": {
    "@playze/shared-ui": "workspace:*",
    "@playze/shared-auth": "workspace:*",
    "@playze/shared-types": "workspace:*",
    "next": "15.0.0",
    "react": "19.0.0"
  }
}
```

**Step 3:** Create database migration
```sql
-- supabase/migrations/YYYYMMDD_myapp_schema.sql

-- App-specific tables (use prefix)
CREATE TABLE myapp_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE myapp_items ENABLE ROW LEVEL SECURITY;

-- Standard RLS policy
CREATE POLICY "Users access items in their org with app access"
  ON myapp_items FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('myapp')
  );

CREATE INDEX myapp_items_org_id_idx ON myapp_items(organization_id);
```

**Step 4:** Register app
```sql
-- Add to apps catalog
INSERT INTO apps (id, name, description, is_active)
VALUES ('myapp', 'MyApp', 'Description', true);

-- Define tiers
INSERT INTO app_tiers (app_id, tier_name, display_name, features, limits)
VALUES
  ('myapp', 'free', 'Free', '{"basic": true}', '{"items": 10}'),
  ('myapp', 'pro', 'Professional', '{"basic": true, "advanced": true}', '{"items": 1000}');
```

**Step 5:** Implement app following TestApp patterns

See [Architecture Documentation](docs/architecture/validai-core-architecture.md#adding-a-new-app) for complete instructions.

---

## Database & Supabase

### Database Schema

**11 Core Tables** (no prefix):
```
organizations               # Tenant units
organization_members        # User-org relationships with roles
organization_invitations    # Pending invitations
apps                        # App catalog
app_tiers                   # Subscription tiers per app
app_role_permissions        # ✅ Phase 2 - Role-based permissions
organization_app_subscriptions  # Org subscriptions to apps
organization_app_usage      # Usage tracking
profiles                    # User profiles
user_preferences           # Shared user settings
invoices                   # Manual billing (MVP)
admin_users                # Admin whitelist
```

**App-Specific Tables** (with prefix):
```
validai_documents          # ValidAI document management
validai_processors         # ValidAI AI processors
validai_operations         # ValidAI processor operations
validai_runs               # ValidAI execution runs
validai_operation_results  # ValidAI operation results
testapp_items              # TestApp example data
```

### Database Functions

**8 Core Functions:**
```sql
-- Helper Functions (public schema)
public.user_organization_id()           # Get current org from JWT
public.has_app_access(app_name)         # Check subscription
public.is_playze_admin()                # Check admin status
public.handle_invited_user()            # User signup processing

-- Business Logic Functions
public.get_user_organizations()         # List user's orgs with roles
public.get_organization_apps()          # List org's app subscriptions
public.increment_app_usage()            # Track usage

-- ✅ PRIMARY AUTHORIZATION FUNCTION (Phase 2)
public.get_user_authorization(p_org_id, p_app_id)
  # Returns complete auth context in ONE query:
  # - user_role
  # - tier_features (from subscription)
  # - role_permissions (from role)
  # - tier_limits & current_usage
  # - tier_display_name
  # - subscription_status
```

**15 Admin Functions:** (SECURITY DEFINER, bypass RLS)
```sql
admin_list_organizations()
admin_get_organization(org_id)
admin_list_organization_members(org_id)
admin_list_users()
admin_get_user(user_id)
admin_list_subscriptions()
admin_get_subscription(subscription_id)
# ... and more
```

### Edge Functions

**2 Deployed Functions:**

1. **`auth/switch-organization`** - Updates JWT metadata for organization switching
2. **`admin/create-organization`** - Admin creates org with optional owner invitation

**5 Shared Utilities:**
- `_shared/supabaseAdmin.ts` - Service-role client
- `_shared/auth.ts` - JWT validation
- `_shared/validation.ts` - Input validation
- `_shared/response.ts` - Standardized responses
- `_shared/cors.ts` - CORS headers

### Supabase Usage Patterns

**Golden Rule:** If PostgREST can do it, use PostgREST. Never create API routes.

```typescript
// ✅ GOOD: Direct PostgREST with RLS
const { data: items } = await supabase
  .from('app_items')
  .select('*')

// ✅ GOOD: Database function for complex queries
const { data: auth } = await supabase.rpc('get_user_authorization', {
  p_app_id: 'validai'
})

// ❌ BAD: API route for database operations
// app/api/items/route.ts
export async function GET() {
  const data = await supabase.from('items').select('*')
  return Response.json(data)
}
```

### Environment Variables

```env
# .env.local (in each app directory)
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Edge Functions only (not in apps)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Database Setup

```bash
# View migration status
npx supabase migration list

# Apply migrations (if needed)
npx supabase db push

# Generate TypeScript types
pnpm --filter @playze/shared-types gen:types
```

---

## Implementation Status

### ✅ Phase 1: Monorepo Foundation (Complete)
- [x] pnpm workspace configuration
- [x] Turborepo build orchestration
- [x] TypeScript workspace setup
- [x] Directory structure

### ✅ Phase 2: Framework Import from Playze Core (Complete)
- [x] 4 shared packages (auth, ui, types, config)
- [x] 11 core database tables with RLS policies
- [x] Helper functions (auth, permissions)
- [x] Business logic functions
- [x] Unified authorization system
- [x] 2 Edge Functions (org switching, admin org creation)
- [x] Admin Portal (75% complete)
- [x] TestApp reference implementation

### ⚠️ Phase 3: ValidAI Integration (Pending)
- [ ] Integrate ValidAI with shared-auth package
- [ ] Replace local auth with shared hooks
- [ ] Integrate ValidAI with shared-ui components
- [ ] Update ValidAI to use shared-types
- [ ] Implement feature gating with AuthGate
- [ ] Testing and validation

### 📋 Phase 4: Additional Apps (Planned)
- [ ] Future applications
- [ ] Cross-app analytics dashboard

---

## Documentation

### 🚀 Getting Started

**New to ValidAI Core Framework?** Start here:

1. [This README](#overview) - Platform overview (10 min)
2. [ValidAI Core Architecture](docs/architecture/validai-core-architecture.md) - Complete architecture (60 min)
3. [TestApp Developer Guide](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md) - Learn patterns (30 min)
4. Try TestApp hands-on (15 min)

### 📖 Core Documentation

**Architecture:**
- [ValidAI Core Architecture](docs/architecture/validai-core-architecture.md) - Complete platform (1500+ lines)
- [Updated Migration Plan](docs/updated-migration-plan.md) - Phase 2 import plan
- [Elevated Access Patterns](docs/playze-core-architecture-elevated-access.md) - Admin patterns (reference)

**Shared Packages:**
- [@playze/shared-auth README](packages/shared-auth/README.md) - Auth & authorization (960 lines)
- [@playze/shared-ui README](packages/shared-ui/README.md) - UI components
- [@playze/shared-types README](packages/shared-types/README.md) - TypeScript types

**Applications:**
- [TestApp Developer Guide](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md) - Complete reference
- [TestApp Database Setup](apps/testapp/DATABASE_SETUP.md) - App registration
- [Admin Portal README](apps/admin-portal/README.md) - Admin interface
- [ValidAI Docs](apps/validai/docs/) - ValidAI-specific documentation

**Development:**
- [CLAUDE.md](CLAUDE.md) - Developer instructions (890+ lines)
- [Edge Functions README](supabase/functions/README.md) - Edge Functions guide (500+ lines)

### 🎯 Documentation By Use Case

| I want to... | Read this... |
|--------------|--------------|
| Understand ValidAI Core Framework | [Architecture Doc](docs/architecture/validai-core-architecture.md) |
| Learn authorization patterns | [TestApp Developer Guide](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md) - Section 2.4 |
| Use auth hooks | [@playze/shared-auth README](packages/shared-auth/README.md) |
| Build a new app | [Architecture Doc](docs/architecture/validai-core-architecture.md) - Adding a New App |
| Understand admin patterns | [Elevated Access](docs/playze-core-architecture-elevated-access.md) |
| Setup database | [TestApp Database Setup](apps/testapp/DATABASE_SETUP.md) |
| Use Edge Functions | [Edge Functions README](supabase/functions/README.md) |
| Fix hydration errors | [TestApp Developer Guide](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md) - Troubleshooting |

### 📊 Documentation Stats

- **Total Documentation**: 6,000+ lines
- **Architecture Docs**: 2 comprehensive guides
- **Package READMEs**: 4 detailed references
- **App Guides**: 3 complete guides (ValidAI, TestApp, Admin Portal)
- **Code Examples**: 50+ patterns demonstrated
- **JSDoc Comments**: 8 files fully documented

---

## Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **React:** 19.x
- **Language:** TypeScript 5.x (strict mode)
- **UI Library:** shadcn/ui + Radix UI
- **Styling:** Tailwind CSS 3.x
- **Data Fetching:** TanStack Query (React Query)
- **State Management:** Zustand (for UI state only)

### Backend
- **BaaS:** Supabase (Auth, Database, Edge Functions, Storage)
- **Database:** PostgreSQL 15.x
- **API:** PostgREST (automatic REST API)
- **Auth:** Supabase Auth (JWT-based)
- **Edge Runtime:** Deno (Edge Functions)

### Development
- **Monorepo:** pnpm workspaces + Turborepo
- **Package Manager:** pnpm 9.x
- **Node Version:** 22.x (uses `@types/node@^22`)
- **Linting:** ESLint + Prettier
- **Testing:** Vitest (unit tests)
- **Git Hooks:** Husky + lint-staged

### Key Dependencies
```json
{
  "next": "15.0.0",
  "react": "19.0.0",
  "typescript": "^5.6.0",
  "@tanstack/react-query": "^5.62.14",
  "@supabase/ssr": "^0.5.2",
  "@supabase/supabase-js": "^2.46.2",
  "tailwindcss": "^3.4.17",
  "zod": "^3.24.1"
}
```

---

## Key Features

### 🔐 Authentication & Authorization

**Single Sign-On:**
- One login works across all applications
- Cookie-based sessions with automatic refresh
- Magic link authentication (email)
- Invite-only access (MVP)

**Unified Authorization:**
- Complete auth context in ONE database query
- Tier-based features (Free, Pro, Enterprise)
- Role-based permissions (Owner, Admin, Member, Viewer)
- Combined authorization (tier + role)
- 5-minute cache via TanStack Query

**Authorization Hooks:**
```typescript
const { data: auth } = useAuthorization('appId')  // Primary hook
const { data: canExport } = useFeatureAccess('appId', 'export')
const { data: canEdit } = usePermission('appId', 'can_edit')
const { data: isAdmin } = useHasRole('appId', ['owner', 'admin'])
```

### 🏢 Multi-Tenancy

**Organization-Based:**
- Organizations are the tenant unit (B2B focus)
- Users can belong to multiple organizations
- Organization context switching via JWT metadata
- Row-level security (RLS) for data isolation

**Organization Management:**
```typescript
const { data: currentOrg } = useCurrentOrganization()
const { data: userOrgs } = useUserOrganizations()
const switchOrg = useSwitchOrganization()

await switchOrg.mutateAsync(newOrgId)
// Session refreshed, all data refetched with new context
```

### 💳 Subscriptions & Billing

**Per-App Subscriptions:**
- Organizations subscribe to individual apps
- Different tiers per application (Free, Pro, Enterprise)
- Feature gating based on subscription tier
- Usage tracking per organization per app

**Billing (MVP):**
- Manual invoicing and payment tracking
- Admin-managed subscription assignments
- Contact-based upgrades (no self-service yet)
- Payment gateway integration (roadmap)

### 🎨 UI Components

**shadcn/ui Integration:**
- 19+ pre-built components (Button, Card, Input, etc.)
- Radix UI primitives for accessibility
- Tailwind CSS styling
- Dark mode support

**Platform Components:**
```typescript
import { AppSwitcher, OrgSwitcher, AuthGate } from '@playze/shared-ui'

// Declarative authorization
<AuthGate appId="app" feature="premium" permission="can_edit">
  <PremiumEditor />
</AuthGate>
```

### 🚀 Performance

**Optimizations:**
- Unified authorization (1 query for all checks)
- TanStack Query caching (5-minute default)
- Turborepo build caching (3-10x faster builds)
- PostgREST automatic indexing
- RLS policy optimization

**Benchmarks:**
- First build: ~20-30 seconds
- Cached build: ~2-5 seconds
- 15 authorization checks: 1 database query
- Page load with auth: ~100-200ms

---

## Contributing

### Development Standards

This project follows strict architectural guidelines:

1. **Read the documentation:**
   - [Architecture Documentation](docs/architecture/validai-core-architecture.md)
   - [CLAUDE.md](CLAUDE.md) - Developer standards

2. **Follow patterns:**
   - Study TestApp for regular user patterns
   - Study Admin Portal for admin patterns
   - Use PostgREST, not API routes
   - Trust RLS policies

3. **Code quality:**
   - TypeScript strict mode
   - ESLint must pass
   - Prettier formatting
   - JSDoc comments for patterns

4. **Testing:**
   - Write tests for new features
   - Maintain 80%+ coverage
   - Test authorization logic thoroughly

### Commit Convention

```
<type>(<scope>): <description>

Examples:
feat(auth): add usePermission hook
fix(testapp): resolve hydration error
docs(architecture): update authorization section
chore(deps): update @supabase/ssr to 0.5.2
```

---

## License

Private - Proprietary

---

## Support & Community

### Getting Help

1. **Check documentation first:**
   - Search this README
   - Check [Architecture Doc](docs/architecture/validai-core-architecture.md)
   - Review [TestApp Developer Guide](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md)

2. **Common issues:**
   - Hydration errors: [TestApp Troubleshooting](apps/testapp/TESTAPP_DEVELOPER_GUIDE.md#troubleshooting-guide)
   - Auth problems: [@playze/shared-auth README](packages/shared-auth/README.md#best-practices)
   - Database issues: [Database Setup](apps/testapp/DATABASE_SETUP.md)

3. **Still stuck?** Create an issue with:
   - What you tried
   - Error messages
   - Relevant code snippets
   - Link to documentation you reviewed

---

## Quick Reference

### Import Cheat Sheet

```typescript
// Types
import type { Organization, UserAuthorization } from '@playze/shared-types'

// Auth & Authorization
import { createBrowserClient, createServerClient } from '@playze/shared-auth'
import {
  useAuth,
  useCurrentOrganization,
  useAuthorization,
  useFeatureAccess,
  usePermission
} from '@playze/shared-auth'

// UI Components
import { Button, Card, AuthGate } from '@playze/shared-ui'
```

### Common Patterns

```typescript
// Protected page with auth
const { data: user } = useAuth()
if (!user) return <LoginPrompt />

// Organization context
const { data: org } = useCurrentOrganization()

// Complete authorization
const { data: auth } = useAuthorization('appId')

// Tier-based feature gate
<AuthGate appId="app" feature="premium">
  <PremiumFeature />
</AuthGate>

// Role-based permission gate
<AuthGate appId="app" permission="can_edit">
  <EditButton />
</AuthGate>

// Combined authorization
<AuthGate appId="app" feature="premium" permission="can_export" requireAll>
  <AdvancedExport />
</AuthGate>
```

---

**Current Status:** ✅ Core framework complete • ValidAI integration pending (Phase 3) • Admin Portal 75% complete • TestApp operational

**Next Steps:** Complete ValidAI integration with shared packages (Phase 3) → Additional apps (Phase 4)

**Philosophy:** Trust PostgREST. Trust RLS. Use ONE query for authorization. Import from shared packages. Never create API routes.
