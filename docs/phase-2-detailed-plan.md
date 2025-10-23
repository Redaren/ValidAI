# Phase 2 Detailed Plan: Import Playze Core

**Status:** Ready for Execution
**Duration:** 2-3 days (16-24 hours)
**Risk:** 🟡 Medium (database migration, multiple apps)
**Objective:** Import complete Playze Core infrastructure - all apps run independently

**Last Updated:** 2025-01-23
**Prerequisites Verified:**
- ✅ Phase 1 committed (clean git status)
- ✅ ValidAI runs with `validai_*` prefixed tables
- ✅ Database backup created
- ✅ No table name conflicts (ValidAI uses `validai_*`, Playze uses platform tables)

---

## Table of Contents

1. [Overview](#overview)
2. [Task 2.1: Copy Shared Packages](#task-21-copy-shared-packages)
3. [Task 2.2: Copy Apps](#task-22-copy-apps)
4. [Task 2.3: Copy Edge Functions](#task-23-copy-edge-functions)
5. [Task 2.4: Apply Playze Core Database Migrations](#task-24-apply-playze-core-database-migrations)
6. [Task 2.5: Register ValidAI as Platform App](#task-25-register-validai-as-platform-app)
7. [Task 2.6: Verify Database Functions](#task-26-verify-database-functions)
8. [Verification Checklist](#verification-checklist)

---

## Overview

### What Phase 2 Accomplishes

**Import Playze Core framework into ValidAI monorepo:**
- Copy 4 shared packages (`@playze/shared-*`)
- Copy 2 reference apps (`admin-portal`, `testapp`)
- Copy Edge Functions (auth, admin utilities)
- Apply 22 platform database migrations
- Register ValidAI as a platform application
- Verify all 3 apps run independently

### No Table Conflicts

**Critical Understanding:**
- ValidAI tables: ALL prefixed with `validai_*` (10 tables)
- Playze platform tables: Standard names (10 tables)
- **Total after Phase 2:** ~20 tables, zero conflicts
- **No merging needed:** Tables coexist independently

### Final Database Schema

**Platform Tables (from Playze Core):**
- `organizations` - Platform-level organizations
- `organization_members` - Platform membership
- `organization_invitations` - Platform invites
- `apps` - Platform app catalog
- `app_tiers` - Subscription tiers per app
- `organization_app_subscriptions` - Org subscriptions to apps
- `organization_app_usage` - Usage tracking
- `profiles` - Platform user profiles
- `user_preferences` - Platform user settings
- `invoices` - Platform billing (manual MVP)

**ValidAI Tables (existing, prefixed):**
- `validai_organizations` - ValidAI-specific org settings
- `validai_organization_members` - ValidAI membership
- `validai_profiles` - ValidAI-specific profiles
- `validai_documents` - Document management
- `validai_processors` - AI processor configs
- `validai_operations` - Processor operations
- `validai_runs` - Processor executions
- `validai_operation_results` - Operation outputs
- `validai_workbench_executions` - Workbench tests
- `validai_llm_global_settings` - LLM configurations

**Relationship:**
- ValidAI can reference platform tables via foreign keys
- Platform tables remain independent
- Both schemas coexist peacefully

---

## Task 2.1: Copy Shared Packages

**Duration:** 2 hours
**Objective:** Import all Playze Core shared packages

### Step 1.1: Align Node.js Version (20 minutes)

**Playze Core requires Node.js 22.x**

```bash
cd /c/Dev/Validai

# Update .nvmrc
echo "22" > .nvmrc

# Install and use Node 22
nvm install 22
nvm use 22

# Verify version
node --version
# Should output: v22.x.x
```

**Update root package.json:**

```bash
# Edit package.json, change:
# "devDependencies": {
#   "@types/node": "^20",  ← Change to "^22"
# }
```

**Update apps/validai/package.json:**

```bash
# Edit apps/validai/package.json, change:
# "devDependencies": {
#   "@types/node": "^20",  ← Change to "^22"
# }
```

**Deliverable:** Node.js 22.x active, package.json updated

---

### Step 1.2: Copy Package Directories (10 minutes)

```bash
cd /c/Dev/Validai

# Copy all shared packages from Playze Core
cp -r /c/Dev/playze-core/packages/shared-ui ./packages/
cp -r /c/Dev/playze-core/packages/shared-auth ./packages/
cp -r /c/Dev/playze-core/packages/shared-types ./packages/
cp -r /c/Dev/playze-core/packages/shared-config ./packages/
```

**Verify copied packages:**

```bash
ls -la packages/
# Should show: shared-auth shared-config shared-types shared-ui

# Check package contents
ls packages/shared-ui/src/components/
# Should show: platform/ ui/

ls packages/shared-auth/src/hooks/
# Should show: use-auth.ts use-authorization.ts etc.
```

**Deliverable:** 4 packages copied to `./packages/`

---

### Step 1.3: Package Contents Summary (Reference)

**shared-ui:**
- 19+ shadcn components (Button, Card, Badge, Input, Select, etc.)
- Platform components:
  - `AuthGate` - Authorization wrapper
  - `AppSwitcher` - Switch between platform apps
  - `OrgSwitcher` - Switch organizations
- Hooks: `useDebounce`, etc.
- Utilities: `cn()`, React Query provider

**shared-auth:**
- Supabase clients:
  - `createBrowserClient()` - Client-side
  - `createServerClient()` - Server-side (RSC, Route Handlers)
  - `updateSession()` - Middleware session refresh
- 9 authorization hooks:
  - `useAuth()` - Current user
  - `useAuthorization()` - **PRIMARY** (tier + role)
  - `useCurrentOrganization()` - Active org
  - `useFeatureAccess()` - Check feature access
  - `usePermission()` - Check permission
  - `useHasRole()` - Check role
  - `useOrganizationApps()` - List org apps
  - `useSwitchOrganization()` - Switch org context
  - `useUserOrganizations()` - User's orgs

**shared-types:**
- `database.types.ts` - Generated from Playze Core schema
- `shortcuts.ts` - Type helpers (Organization, Profile, etc.)
- `platform.types.ts` - Platform-specific types

**shared-config:**
- ESLint configurations
- TypeScript base configs
- Tailwind base config

---

### Step 1.4: Install Dependencies (30 minutes)

```bash
cd /c/Dev/Validai

# Clean install
rm -rf node_modules
rm pnpm-lock.yaml

# Install all dependencies (root + packages + apps)
pnpm install
```

**Expected output:**
```
Progress: resolved 1500+, reused 1400+, downloaded 100+
Packages: +1500
```

**Verify workspace setup:**

```bash
pnpm list --depth=0
# Should show:
# playze-validai
# ├── @playze/shared-auth (workspace link)
# ├── @playze/shared-config (workspace link)
# ├── @playze/shared-types (workspace link)
# ├── @playze/shared-ui (workspace link)
# └── @playze/validai (workspace link)
```

**Deliverable:** All dependencies installed, workspace links created

---

### Step 1.5: Build Shared Packages (30 minutes)

```bash
cd /c/Dev/Validai

# Build all shared packages
turbo build --filter="@playze/shared-*"
```

**Expected output:**
```
@playze/shared-types:build: cache miss, executing...
@playze/shared-types:build: tsc
@playze/shared-types:build: Generated database.types.ts

@playze/shared-auth:build: cache miss, executing...
@playze/shared-auth:build: tsc
@playze/shared-auth:build: Generated dist/

@playze/shared-ui:build: cache miss, executing...
@playze/shared-ui:build: tsc
@playze/shared-ui:build: Generated dist/

@playze/shared-config:build: cache hit, skipping...

Tasks: 4 successful, 4 total
```

**Verify build outputs:**

```bash
ls packages/shared-types/dist/
# Should show: database.types.d.ts database.types.js shortcuts.d.ts shortcuts.js etc.

ls packages/shared-auth/dist/
# Should show: client.js server.js middleware.js hooks/ etc.

ls packages/shared-ui/dist/
# Should show: components/ hooks/ lib/ etc.
```

**Deliverable:** All packages built successfully with dist/ outputs

---

### Step 1.6: Verify Package Dependency Tree (10 minutes)

```bash
# Check shared-types (no dependencies on other shared packages)
pnpm --filter @playze/shared-types list --depth=1

# Check shared-auth (depends on shared-types)
pnpm --filter @playze/shared-auth why @playze/shared-types
# Should show: shared-types is a dependency

# Check shared-ui (depends on shared-types, shared-auth)
pnpm --filter @playze/shared-ui why @playze/shared-types
pnpm --filter @playze/shared-ui why @playze/shared-auth
# Should show both as dependencies

# Verify no circular dependencies
pnpm list --depth=2 | grep -i circular
# Should be empty
```

**Deliverable:** Dependency tree verified, no circular dependencies

---

## Task 2.2: Copy Apps

**Duration:** 2 hours
**Objective:** Import admin-portal and testapp

### Step 2.1: Copy App Directories (10 minutes)

```bash
cd /c/Dev/Validai

# Copy apps from Playze Core
cp -r /c/Dev/playze-core/apps/admin-portal ./apps/
cp -r /c/Dev/playze-core/apps/testapp ./apps/

# Note: Do NOT copy apps/initial (not needed for platform)
```

**Verify app structure:**

```bash
ls apps/
# Should show: admin-portal testapp validai

ls apps/admin-portal/app/
# Should show: (admin)/ layout.tsx page.tsx providers.tsx

ls apps/testapp/app/
# Should show: dashboard/ layout.tsx login/ page.tsx
```

**Deliverable:** admin-portal and testapp copied

---

### Step 2.2: Environment Variables Setup (20 minutes)

**Get Supabase credentials:**

1. Open Supabase dashboard: https://supabase.com/dashboard/project/xczippkxxdqlvaacjexj
2. Navigate to: Settings → API
3. Copy:
   - Project URL: `https://xczippkxxdqlvaacjexj.supabase.co`
   - Anon/Public key: `eyJhbGc...`
   - Service Role key: `eyJhbGc...` (for Edge Functions)

**Create root `.env.local`:**

```bash
cd /c/Dev/Validai

cat > .env.local << 'EOF'
# Supabase Project (ValidAI)
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste-anon-key-here>

# Service Role (for Edge Functions and admin operations)
SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key-here>
EOF
```

**Copy to all apps:**

```bash
# Copy to ValidAI
cp .env.local apps/validai/.env.local

# Copy to Admin Portal
cp .env.local apps/admin-portal/.env.local

# Copy to TestApp
cp .env.local apps/testapp/.env.local
```

**Verify environment files:**

```bash
ls -la apps/*/\.env.local
# Should show 3 files:
# apps/admin-portal/.env.local
# apps/testapp/.env.local
# apps/validai/.env.local
```

**Deliverable:** Environment variables configured for all 3 apps

---

### Step 2.3: Install App Dependencies (30 minutes)

```bash
cd /c/Dev/Validai

# Install dependencies (includes new apps)
pnpm install
```

**Verify app workspace links:**

```bash
pnpm list --depth=0
# Should show:
# playze-validai
# ├── @playze/admin-portal (workspace link)
# ├── @playze/testapp (workspace link)
# ├── @playze/validai (workspace link)
# ├── @playze/shared-* (workspace links)
```

**Deliverable:** All app dependencies installed

---

### Step 2.4: Verify App Configurations (30 minutes)

**Check admin-portal package.json:**

```bash
cat apps/admin-portal/package.json
# Verify:
# - name: "@playze/admin-portal"
# - Dependencies include @playze/shared-*
# - Scripts: dev, build, lint, typecheck
```

**Check testapp package.json:**

```bash
cat apps/testapp/package.json
# Verify:
# - name: "@playze/testapp"
# - Dependencies include @playze/shared-*
# - Scripts: dev, build, lint, typecheck
```

**Check port configurations:**

**apps/admin-portal/package.json:**
```json
{
  "scripts": {
    "dev": "next dev -p 3001"
  }
}
```

**apps/testapp/package.json:**
```json
{
  "scripts": {
    "dev": "next dev -p 3002"
  }
}
```

**apps/validai/package.json:**
```json
{
  "scripts": {
    "dev": "next dev -p 3000"
  }
}
```

**Deliverable:** App configurations verified, ports assigned

---

### Step 2.5: Build Apps (Dry Run - 30 minutes)

**Attempt to build each app (will fail - database not ready yet):**

```bash
# Build admin-portal
turbo build --filter=@playze/admin-portal
# Expected: May fail due to missing database tables (OK for now)

# Build testapp
turbo build --filter=@playze/testapp
# Expected: May fail due to missing database tables (OK for now)

# Build validai
turbo build --filter=@playze/validai
# Expected: Should succeed (tables already exist)
```

**Note:** Full build verification happens in Phase 3 after database migrations.

**Deliverable:** Apps copied and configured (builds will be verified post-migration)

---

## Task 2.3: Copy Edge Functions

**Duration:** 2 hours
**Objective:** Import Playze Core Edge Functions

### Step 3.1: Copy Function Directories (10 minutes)

```bash
cd /c/Dev/Validai

# Copy Edge Function utilities and functions
cp -r /c/Dev/playze-core/supabase/functions/_shared ./supabase/functions/
cp -r /c/Dev/playze-core/supabase/functions/auth ./supabase/functions/
cp -r /c/Dev/playze-core/supabase/functions/admin ./supabase/functions/
```

**Verify function structure:**

```bash
ls supabase/functions/
# Should show: _shared admin auth

ls supabase/functions/_shared/
# Should show: auth.ts cors.ts response.ts supabaseAdmin.ts validation.ts

ls supabase/functions/auth/
# Should show: switch-organization/

ls supabase/functions/admin/
# Should show: create-organization/
```

**Deliverable:** Edge Functions copied

---

### Step 3.2: Function Contents Summary (Reference)

**_shared/ (Utilities - not deployed):**
- `supabaseAdmin.ts` - Service-role Supabase client
- `auth.ts` - JWT validation and user extraction
- `validation.ts` - Input validation helpers
- `response.ts` - Standardized response formats
- `cors.ts` - CORS headers

**auth/switch-organization/ (Deployed):**
- Updates user's JWT metadata with new `current_organization_id`
- Allows users to switch between their organizations
- Returns updated session

**admin/create-organization/ (Deployed):**
- Admin-only function to create organizations
- Bypasses RLS using service-role
- Used by Admin Portal

---

### Step 3.3: Supabase CLI Setup (30 minutes)

**Set Supabase access token (for deployment):**

```bash
# Windows (Command Prompt)
set SUPABASE_ACCESS_TOKEN=sbp_646a9a0c9d1f841b006b0567bfc515a9754460fa

# Windows (PowerShell)
$env:SUPABASE_ACCESS_TOKEN="sbp_646a9a0c9d1f841b006b0567bfc515a9754460fa"

# Linux/Mac
export SUPABASE_ACCESS_TOKEN=sbp_646a9a0c9d1f841b006b0567bfc515a9754460fa
```

**Link to ValidAI Supabase project:**

```bash
cd /c/Dev/Validai

# Link to project
npx supabase link --project-ref xczippkxxdqlvaacjexj
```

**Expected output:**
```
Linked to project: xczippkxxdqlvaacjexj
```

**Verify link:**

```bash
npx supabase projects list
# Should show xczippkxxdqlvaacjexj in the list
```

**Deliverable:** Supabase CLI linked to ValidAI project

---

### Step 3.4: Deploy Edge Functions (1 hour)

**Deploy switch-organization:**

```bash
cd /c/Dev/Validai

npx supabase functions deploy switch-organization
```

**Expected output:**
```
Deploying function: switch-organization
Version: 1
Status: Active
URL: https://xczippkxxdqlvaacjexj.supabase.co/functions/v1/switch-organization
```

**Deploy create-organization:**

```bash
npx supabase functions deploy create-organization
```

**Expected output:**
```
Deploying function: create-organization
Version: 1
Status: Active
URL: https://xczippkxxdqlvaacjexj.supabase.co/functions/v1/create-organization
```

**Verify deployment:**

```bash
npx supabase functions list
```

**Expected output:**
```
┌──────────────────────────┬──────────┬─────────┬──────────────────────┐
│ NAME                     │ VERSION  │ STATUS  │ CREATED AT           │
├──────────────────────────┼──────────┼─────────┼──────────────────────┤
│ switch-organization      │ 1        │ ACTIVE  │ 2025-01-23 ...       │
│ create-organization      │ 1        │ ACTIVE  │ 2025-01-23 ...       │
│ execute-processor-run    │ X        │ ACTIVE  │ 2025-01-XX ...       │ (existing)
└──────────────────────────┴──────────┴─────────┴──────────────────────┘
```

**Deliverable:** Edge Functions deployed and active

---

### Step 3.5: Test Edge Functions (20 minutes)

**Test switch-organization (requires auth):**

```bash
# Get a user JWT token from Supabase dashboard or ValidAI app
# Settings → API → Generate new anon key for testing

# Test function call
curl -X POST \
  "https://xczippkxxdqlvaacjexj.supabase.co/functions/v1/switch-organization" \
  -H "Authorization: Bearer <user-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"organization_id": "<valid-org-uuid>"}'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Organization switched successfully",
  "organization_id": "..."
}
```

**Test create-organization (service-role only - skip for now):**

Note: This requires admin setup which happens after migrations. Will test in Phase 3.

**Deliverable:** Edge Functions deployed and responding

---

## Task 2.4: Apply Playze Core Database Migrations

**Duration:** 8-10 hours (includes careful review and testing)
**Risk:** 🔴 High (database schema changes)
**Objective:** Apply ALL 22 Playze Core migrations to create platform tables

### Step 4.1: Review Playze Core Migrations (2 hours)

**List all Playze Core migrations:**

```bash
ls -1 /c/Dev/playze-core/supabase/migrations/ | sort
```

**Expected output (22 migrations):**
```
20250117000000_core_schema.sql
20250117000001_rls_policies.sql
20250117000002_helper_functions.sql
20250117000003_database_functions.sql
20250117000004_triggers.sql
20250120000000_admin_users.sql
20250120000001_fix_admin_email_check.sql
20250120000002_add_admin_bypass_to_org_members.sql
20250120000003_add_admin_bypass_to_all_org_tables.sql
20250120000005_admin_database_functions.sql
20250120000006_simplify_rls_policies.sql
20250120000007_fix_admin_members_function.sql
20250120000008_fix_admin_members_email_type.sql
20250120000009_fix_member_count.sql
20250120000010_fix_admin_subscriptions_columns.sql
20250120000011_add_admin_update_organization.sql
20250120000012_add_admin_assign_subscription.sql
20250121000000_admin_user_subscription_functions.sql
20250122000000_add_admin_assign_member.sql
20250122000001_fix_admin_assign_member_type_cast.sql
20251021095006_fix_remove_organization_slug.sql
20251022124850_fix_current_organization_query.sql
```

**Review migration purposes:**

| Migration | Purpose |
|-----------|---------|
| `20250117000000_core_schema.sql` | Create 10 platform tables |
| `20250117000001_rls_policies.sql` | RLS policies for platform tables |
| `20250117000002_helper_functions.sql` | Utility functions (organization lookup, etc.) |
| `20250117000003_database_functions.sql` | Public database functions (get_user_organizations, etc.) |
| `20250117000004_triggers.sql` | Auto-update triggers (updated_at, etc.) |
| `20250120000000_admin_users.sql` | Admin users table and RLS bypass |
| `20250120000001-12` | Admin function fixes and improvements |
| `20250121000000` | Admin user/subscription functions |
| `20250122000000-001` | Admin member assignment |
| `20251021095006` | **Remove slug from organizations** |
| `20251022124850` | Fix current organization query |

**Key Discovery:**
- Migration `20251021095006` **removes** `slug` column from `organizations`
- This is a recent Playze Core decision (Oct 21, 2025)
- ValidAI's `validai_organizations` still has `slug` - **no conflict** (different tables)

**Deliverable:** All 22 migrations reviewed and understood

---

### Step 4.2: Copy Migration Files (30 minutes)

```bash
cd /c/Dev/Validai

# Copy ALL Playze Core migrations
cp /c/Dev/playze-core/supabase/migrations/*.sql ./supabase/migrations/
```

**Verify copied migrations:**

```bash
ls -1 supabase/migrations/ | sort
```

**Should show (26 total):**
```
# ValidAI migrations (4 - Phase 1)
20250123000000_rename_validai_tables.sql
20250123000001_rename_remaining_validai_tables.sql
20250123000002_update_functions_for_renamed_tables.sql
20250123000003_fix_database_functions_for_renamed_tables.sql

# Playze Core migrations (22)
20250117000000_core_schema.sql
20250117000001_rls_policies.sql
... (all 22 migrations)
```

**Migration order (automatic - sorted by timestamp):**
1. Phase 1 ValidAI migrations run first (already applied)
2. Playze Core migrations run next (will be applied now)
3. Phase 2 ValidAI app registration runs last (next task)

**Deliverable:** All Playze Core migrations copied

---

### Step 4.3: Pre-Migration Database Snapshot (30 minutes)

**Check current database state:**

```sql
-- Count current tables
SELECT COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public';
-- Expected: 10 tables (all validai_*)

-- List current tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected:
-- validai_documents
-- validai_llm_global_settings
-- validai_operation_results
-- validai_operations
-- validai_organization_members
-- validai_organizations
-- validai_processors
-- validai_profiles
-- validai_runs
-- validai_workbench_executions
```

**Create pre-migration snapshot:**

```bash
# Export current schema
npx supabase db dump --schema public > pre-phase2-schema.sql

# Export current data
npx supabase db dump --data-only > pre-phase2-data.sql
```

**Deliverable:** Pre-migration snapshot created

---

### Step 4.4: Apply Migrations (2 hours)

**Push migrations to Supabase:**

```bash
cd /c/Dev/Validai

npx supabase db push
```

**Expected output (long - 22 new migrations):**
```
Applying migration 20250117000000_core_schema.sql...
✓ Created table: organizations
✓ Created table: organization_members
✓ Created table: organization_invitations
✓ Created table: apps
✓ Created table: app_tiers
✓ Created table: organization_app_subscriptions
✓ Created table: organization_app_usage
✓ Created table: profiles
✓ Created table: user_preferences
✓ Created table: invoices

Applying migration 20250117000001_rls_policies.sql...
✓ Created RLS policies for all platform tables

Applying migration 20250117000002_helper_functions.sql...
✓ Created helper functions

... (continue for all 22 migrations)

Applying migration 20251022124850_fix_current_organization_query.sql...
✓ Fixed current organization query

All migrations applied successfully.
```

**If errors occur:**

**Error: "relation already exists"**
- Check if table name conflicts with validai_* tables
- This should NOT happen (all ValidAI tables are prefixed)
- If it does, investigate which table and why

**Error: "constraint violation"**
- Check data integrity
- Review migration SQL for issues
- Rollback and fix migration

**Error: "permission denied"**
- Check RLS policies
- Verify service-role key is correct

**Deliverable:** All 22 Playze Core migrations applied successfully

---

### Step 4.5: Post-Migration Verification (2 hours)

**Check total table count:**

```sql
SELECT COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public';
-- Expected: 20 tables (10 validai_* + 10 platform)
```

**List all tables:**

```sql
SELECT tablename, schemaname
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected output (20 tables):**

**Platform Tables (10):**
```
admin_users
app_tiers
apps
invoices
organization_app_subscriptions
organization_app_usage
organization_invitations
organization_members
organizations
profiles
user_preferences
```

**ValidAI Tables (10):**
```
validai_documents
validai_llm_global_settings
validai_operation_results
validai_operations
validai_organization_members
validai_organizations
validai_processors
validai_profiles
validai_runs
validai_workbench_executions
```

**Verify functions created:**

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

**Expected (20+ functions):**
```
admin_assign_member
admin_assign_subscription
admin_create_organization
admin_delete_organization
admin_get_all_members
admin_get_all_organizations
admin_get_all_subscriptions
admin_update_organization
get_organization_apps
get_user_authorization
get_user_organizations
has_app_access
is_playze_admin
user_organization_id
... (more ValidAI functions)
```

**Check RLS policies:**

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected:** Policies for all 20 tables

**Verify no data loss:**

```sql
-- ValidAI data should remain intact
SELECT
  'validai_organizations' as table_name, COUNT(*) as rows FROM validai_organizations
UNION ALL
SELECT 'validai_documents', COUNT(*) FROM validai_documents
UNION ALL
SELECT 'validai_processors', COUNT(*) FROM validai_processors
UNION ALL
SELECT 'validai_operations', COUNT(*) FROM validai_operations
UNION ALL
SELECT 'validai_runs', COUNT(*) FROM validai_runs
UNION ALL
SELECT 'validai_operation_results', COUNT(*) FROM validai_operation_results
UNION ALL
SELECT 'validai_workbench_executions', COUNT(*) FROM validai_workbench_executions;
```

**Expected:** Same row counts as before Phase 2

**Deliverable:** Database verified - 20 tables, all functions, all data intact

---

### Step 4.6: Generate Updated Types (30 minutes)

**Generate TypeScript types for Playze Core tables:**

```bash
cd /c/Dev/Validai

# Generate types for shared-types package
npx supabase gen types typescript --project-id xczippkxxdqlvaacjexj > packages/shared-types/src/database.types.ts
```

**Verify generated types include both:**
- Platform tables (organizations, apps, etc.)
- ValidAI tables (validai_organizations, validai_documents, etc.)

**Rebuild shared-types package:**

```bash
turbo build --filter=@playze/shared-types
```

**Rebuild dependent packages:**

```bash
turbo build --filter=@playze/shared-auth
turbo build --filter=@playze/shared-ui
```

**Deliverable:** TypeScript types generated for all tables

---

## Task 2.5: Register ValidAI as Platform App

**Duration:** 2 hours
**Objective:** Register ValidAI in platform app catalog with tiers

### Step 5.1: Create App Registration Migration (1 hour)

**Create migration file:**

```bash
cd /c/Dev/Validai

# Create new migration
cat > supabase/migrations/20250124000000_register_validai_app.sql << 'EOF'
-- =============================================================================
-- REGISTER VALIDAI AS PLATFORM APPLICATION
-- =============================================================================
-- Description: Register ValidAI in apps catalog with tiers and permissions
-- Created: 2025-01-24
-- Risk: Low (data insertion only)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- REGISTER VALIDAI APPLICATION
-- -----------------------------------------------------------------------------

INSERT INTO apps (id, name, description, is_active)
VALUES (
  'validai',
  'ValidAI',
  'Document processing and validation platform powered by AI',
  true
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE apps IS 'Platform application catalog';

-- -----------------------------------------------------------------------------
-- CREATE VALIDAI TIERS
-- -----------------------------------------------------------------------------

-- Free Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  features,
  limits,
  price_monthly,
  price_yearly
)
VALUES (
  'validai',
  'free',
  'Free',
  jsonb_build_object(
    'basic_processing', true,
    'export_reports', false,
    'custom_models', false,
    'advanced_operations', false
  ),
  jsonb_build_object(
    'processors', 5,
    'runs_per_month', 100,
    'documents', 10,
    'operations_per_processor', 10
  ),
  0,
  0
)
ON CONFLICT (app_id, tier_name) DO NOTHING;

-- Professional Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  features,
  limits,
  price_monthly,
  price_yearly
)
VALUES (
  'validai',
  'pro',
  'Professional',
  jsonb_build_object(
    'basic_processing', true,
    'export_reports', true,
    'custom_models', false,
    'advanced_operations', true
  ),
  jsonb_build_object(
    'processors', 50,
    'runs_per_month', 10000,
    'documents', 1000,
    'operations_per_processor', 50
  ),
  49,
  490
)
ON CONFLICT (app_id, tier_name) DO NOTHING;

-- Enterprise Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  features,
  limits,
  price_monthly,
  price_yearly
)
VALUES (
  'validai',
  'enterprise',
  'Enterprise',
  jsonb_build_object(
    'basic_processing', true,
    'export_reports', true,
    'custom_models', true,
    'advanced_operations', true,
    'priority_support', true,
    'custom_integrations', true
  ),
  jsonb_build_object(
    'processors', 999,
    'runs_per_month', 999999,
    'documents', 999999,
    'operations_per_processor', 999
  ),
  499,
  4990
)
ON CONFLICT (app_id, tier_name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ASSIGN VALIDAI TO EXISTING ORGANIZATIONS
-- -----------------------------------------------------------------------------
-- Strategy: Give all existing ValidAI organizations a Free tier subscription

-- Note: This links validai_organizations to platform organizations
-- Each validai_organization will get a subscription record

INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  tier_name,
  status,
  billing_period_start,
  billing_period_end,
  notes
)
SELECT
  vo.id as organization_id,
  'validai' as app_id,
  (SELECT id FROM app_tiers WHERE app_id = 'validai' AND tier_name = 'free' LIMIT 1) as tier_id,
  'free' as tier_name,
  'active' as status,
  now() as billing_period_start,
  (now() + interval '1 year') as billing_period_end,
  'Automatically assigned during Phase 2 migration' as notes
FROM validai_organizations vo
WHERE NOT EXISTS (
  SELECT 1 FROM organization_app_subscriptions oas
  WHERE oas.organization_id = vo.id AND oas.app_id = 'validai'
)
ON CONFLICT (organization_id, app_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  app_count int;
  tier_count int;
  subscription_count int;
BEGIN
  -- Verify ValidAI app registered
  SELECT COUNT(*) INTO app_count
  FROM apps
  WHERE id = 'validai';

  IF app_count = 0 THEN
    RAISE EXCEPTION 'ValidAI app not registered';
  END IF;

  -- Verify 3 tiers created
  SELECT COUNT(*) INTO tier_count
  FROM app_tiers
  WHERE app_id = 'validai';

  IF tier_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 ValidAI tiers, found %', tier_count;
  END IF;

  -- Verify subscriptions created
  SELECT COUNT(*) INTO subscription_count
  FROM organization_app_subscriptions
  WHERE app_id = 'validai';

  RAISE NOTICE 'ValidAI registered successfully!';
  RAISE NOTICE 'Tiers: %', tier_count;
  RAISE NOTICE 'Subscriptions: %', subscription_count;
END $$;

-- -----------------------------------------------------------------------------
-- END REGISTRATION
-- -----------------------------------------------------------------------------
EOF
```

**Deliverable:** App registration migration created

---

### Step 5.2: Apply App Registration (30 minutes)

```bash
cd /c/Dev/Validai

npx supabase db push
```

**Expected output:**
```
Applying migration 20250124000000_register_validai_app.sql...
NOTICE: ValidAI registered successfully!
NOTICE: Tiers: 3
NOTICE: Subscriptions: 1
Migration applied successfully.
```

**Verify app registration:**

```sql
-- Check ValidAI app
SELECT * FROM apps WHERE id = 'validai';
-- Should return 1 row

-- Check tiers
SELECT tier_name, display_name, price_monthly
FROM app_tiers
WHERE app_id = 'validai'
ORDER BY price_monthly;
-- Should return: free ($0), pro ($49), enterprise ($499)

-- Check subscriptions
SELECT
  oas.organization_id,
  oas.tier_name,
  oas.status,
  vo.name as org_name
FROM organization_app_subscriptions oas
JOIN validai_organizations vo ON vo.id = oas.organization_id
WHERE oas.app_id = 'validai';
-- Should return 1 row (existing ValidAI organization with 'free' tier)
```

**Deliverable:** ValidAI registered in platform catalog

---

## Task 2.6: Verify Database Functions

**Duration:** 2 hours
**Objective:** Ensure all database functions work with new schema

### Step 6.1: Test Platform Functions (1 hour)

**Test organization functions:**

```sql
-- Test get_user_organizations (platform function)
SELECT * FROM get_user_organizations();
-- Should return organizations where current user is a member

-- Test has_app_access (platform function)
SELECT has_app_access('validai');
-- Should return true if user has ValidAI subscription

-- Test get_organization_apps (platform function)
SELECT * FROM get_organization_apps();
-- Should return apps available to current user's organization
```

**Test admin functions:**

```sql
-- Test admin_get_all_organizations (service-role only)
-- Skip for now - requires admin setup in Phase 3
```

**Deliverable:** Platform functions verified

---

### Step 6.2: Test ValidAI Functions (1 hour)

**List ValidAI-specific functions:**

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name LIKE '%validai%'
ORDER BY routine_name;
```

**Test key ValidAI functions:**

```sql
-- If ValidAI has custom functions, test them here
-- Example: get_processor_stats, get_run_summary, etc.

-- Test table access
SELECT COUNT(*) FROM validai_processors;
SELECT COUNT(*) FROM validai_documents;
SELECT COUNT(*) FROM validai_runs;

-- All should return expected counts (no errors)
```

**Deliverable:** ValidAI functions verified

---

## Verification Checklist

**After completing all tasks, verify:**

### Packages
- [ ] 4 shared packages copied to `./packages/`
- [ ] All packages build successfully (`dist/` outputs exist)
- [ ] No circular dependencies
- [ ] Workspace links created (`pnpm list` shows workspace:*)

### Apps
- [ ] admin-portal copied to `./apps/admin-portal`
- [ ] testapp copied to `./apps/testapp`
- [ ] validai exists at `./apps/validai`
- [ ] All apps have `.env.local` files
- [ ] Port assignments: ValidAI (3000), Admin (3001), TestApp (3002)

### Edge Functions
- [ ] `_shared/` utilities copied
- [ ] `auth/switch-organization` deployed
- [ ] `admin/create-organization` deployed
- [ ] Functions listed in `npx supabase functions list`

### Database
- [ ] 20 total tables (10 platform + 10 validai_*)
- [ ] All 22 Playze Core migrations applied
- [ ] ValidAI app registered in `apps` table
- [ ] 3 tiers created for ValidAI
- [ ] Existing organizations have ValidAI subscriptions
- [ ] All functions work (platform + ValidAI)
- [ ] No data loss (validai_* tables intact)
- [ ] Types generated for all tables

### Environment
- [ ] Node.js 22.x active
- [ ] pnpm 9.x installed
- [ ] Supabase CLI linked to project
- [ ] Environment variables set for all apps

---

## Next Steps

**After Phase 2 completion:**

1. **Commit all changes:**
   ```bash
   git add .
   git commit -m "feat: Phase 2 - Import Playze Core framework

   Complete import of Playze Core infrastructure:
   - 4 shared packages (auth, ui, types, config)
   - 2 reference apps (admin-portal, testapp)
   - Edge Functions (switch-org, create-org)
   - 22 platform migrations (10 tables, 20+ functions)
   - ValidAI registered as platform app (3 tiers)

   Database now has 20 tables:
   - 10 platform tables (organizations, apps, etc.)
   - 10 ValidAI tables (validai_* prefix)

   All apps ready for independent verification in Phase 3.
   "
   ```

2. **Proceed to Phase 3:** Verify all 3 apps run independently
   - Start ValidAI (port 3000)
   - Start admin-portal (port 3001)
   - Start testapp (port 3002)
   - Verify database access for each
   - Verify no conflicts

---

## Rollback Plan

**If Phase 2 fails:**

1. **Rollback database:**
   ```bash
   # Restore from pre-migration snapshot
   psql -h db.xczippkxxdqlvaacjexj.supabase.co -U postgres < pre-phase2-schema.sql
   psql -h db.xczippkxxdqlvaacjexj.supabase.co -U postgres < pre-phase2-data.sql
   ```

2. **Rollback code:**
   ```bash
   # Remove copied packages and apps
   rm -rf packages/shared-*
   rm -rf apps/admin-portal
   rm -rf apps/testapp
   rm -rf supabase/functions/_shared
   rm -rf supabase/functions/auth
   rm -rf supabase/functions/admin

   # Reset to Phase 1 state
   git reset --hard <phase-1-commit-hash>
   ```

3. **Verify rollback:**
   - ValidAI app still runs
   - Database has 10 validai_* tables
   - No platform tables

---

## Success Criteria

**Phase 2 is complete when:**

- ✅ 4 shared packages built and ready
- ✅ 3 apps copied (validai, admin-portal, testapp)
- ✅ Edge Functions deployed and responding
- ✅ 22 Playze Core migrations applied (20 tables total)
- ✅ ValidAI registered as platform app
- ✅ No data loss in validai_* tables
- ✅ All database functions working
- ✅ TypeScript types generated for all tables
- ✅ Ready for Phase 3 verification

**Duration:** 2-3 days (16-24 hours)

---

**End of Phase 2 Detailed Plan**
