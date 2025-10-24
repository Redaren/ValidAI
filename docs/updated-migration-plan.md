# Updated Migration Plan: ValidAI as First App on Playze Core Framework

**Status:** Ready for Implementation
**Strategy:** Import Playze Core, ValidAI as Platform App
**Duration:** 7-10 days (56-80 hours)
**Risk Level:** 🟡 Medium (Lower than original plan)
**Created:** 2025-01-23
**Supersedes:** phase1-migration-plan.md (original approach)

---

## Table of Contents

1. [Strategic Overview](#strategic-overview)
2. [Key Architectural Decisions](#key-architectural-decisions)
3. [Phase 1: Structure Alignment & Table Rename](#phase-1-structure-alignment--table-rename)
4. [Phase 2: Import Playze Core](#phase-2-import-playze-core)
5. [Phase 3: MILESTONE - Verify Independent Operation](#phase-3-milestone---verify-independent-operation)
6. [Phase 4: Integrate ValidAI](#phase-4-integrate-validai)
7. [Success Criteria](#success-criteria)
8. [Risk Assessment](#risk-assessment)
9. [Timeline & Comparison](#timeline--comparison)

---

## Strategic Overview

### Philosophy

**ValidAI is an APPLICATION on the Playze Core FRAMEWORK, not a separate platform.**

This approach treats ValidAI as the first tenant application built on proven Playze Core infrastructure, rather than building a custom platform from scratch.

### Why This Approach is Better

| Aspect | Original Plan | This Plan | Winner |
|--------|---------------|-----------|--------|
| **Code Reuse** | Create custom packages | Import proven Playze packages | ✅ **This Plan** |
| **Risk** | Build + test new code | Copy working code | ✅ **This Plan** |
| **Time** | 15 days | 7-10 days | ✅ **This Plan** (47% faster) |
| **Verification** | No checkpoint | Phase 3 milestone | ✅ **This Plan** |
| **Complexity** | High (custom implementation) | Medium (copy + integrate) | ✅ **This Plan** |
| **Database Conflicts** | Table renames optional | Table renames required | ⚖️ **Trade-off** |
| **Integration** | Big-bang (Phase 3) | Incremental (Phase 4) | ✅ **This Plan** |

### Four-Phase Strategy

```
Phase 1: Structure Alignment (1 day)
├─ Move ValidAI to monorepo structure
├─ Rename ValidAI tables with validai_ prefix
└─ Verify ValidAI still functional

Phase 2: Import Playze Core (2-3 days)
├─ Copy shared packages (@playze/*)
├─ Copy apps (admin-portal, testapp)
├─ Apply database migrations
└─ Register ValidAI as platform app

Phase 3: MILESTONE Verification (1 day)
├─ Test ValidAI runs independently
├─ Test admin-portal runs
├─ Test testapp runs
└─ Database health check
    ↓
    CHECKPOINT: All apps working, no integration yet
    ↓
Phase 4: Integration (3-5 days)
├─ ValidAI adopts @playze/shared-types
├─ ValidAI adopts @playze/shared-auth
├─ ValidAI adopts @playze/shared-ui
├─ Implement authorization (AuthGate)
└─ Add platform features (AppSwitcher, etc.)
```

---

## Key Architectural Decisions

### Decision 1: ValidAI Tables Prefixed with `validai_`

**Decision:** Rename ALL ValidAI domain tables to include `validai_` prefix

**Rationale:**
- **Clean separation:** Platform tables vs app tables clearly distinguished
- **No conflicts:** Platform can add any table without collision
- **Standard pattern:** Matches Playze Core architecture (roadcloud_, projectx_)
- **Future-proof:** Allows multiple apps to coexist safely

**Impact:**
```sql
-- Before
documents
processors
operations
runs
operation_results
workbench_executions
llm_global_settings

-- After
validai_documents
validai_processors
validai_operations
validai_runs
validai_operation_results
validai_workbench_executions
validai_llm_global_settings
```

**Code changes required:**
```typescript
// Every .from('documents') becomes .from('validai_documents')
```

### Decision 2: Use `@playze/*` Package Namespace

**Decision:** Keep Playze Core's `@playze/*` namespace for all shared packages

**Rationale:**
- ValidAI is an APP on the Playze platform
- Shared packages belong to the framework, not the app
- Consistent with multi-app architecture
- Future apps (roadcloud, projectx) use same packages

**Impact:**
```typescript
// ValidAI imports from Playze framework
import { Button } from '@playze/shared-ui'
import { createServerClient } from '@playze/shared-auth/server'
import type { Database } from '@playze/shared-types'
```

### Decision 3: Import Proven Code, Don't Rebuild

**Decision:** Copy entire Playze Core implementation rather than recreating

**Rationale:**
- **Battle-tested:** Playze Core packages already work
- **Faster:** Copy takes hours, rebuild takes days
- **Lower risk:** Known bugs already fixed
- **Complete features:** Authorization system already implemented

**What gets imported:**
- ✅ 4 shared packages (shared-ui, shared-auth, shared-types, shared-config)
- ✅ admin-portal app (substantially complete)
- ✅ testapp app (working reference)
- ✅ Edge Functions (switch-organization, create-organization)
- ✅ Database migrations (11 platform tables, 15 functions)

### Decision 4: Milestone Checkpoint After Import

**Decision:** Phase 3 verifies all apps run BEFORE integration

**Rationale:**
- **Early detection:** Catches structural issues before complex integration
- **Clear rollback point:** Can revert Phase 4 without affecting Phase 2
- **Confidence building:** Proves infrastructure solid before adopting it
- **Parallel verification:** Tests 3 independent apps simultaneously

**Verification criteria:**
- ✅ ValidAI runs (still uses local code)
- ✅ admin-portal runs (manages platform)
- ✅ testapp runs (demonstrates authorization)
- ✅ Database healthy (all tables present)

### Decision 5: Incremental Integration

**Decision:** Adopt Playze packages step-by-step in Phase 4

**Rationale:**
- **Controlled risk:** Test after each package adoption
- **Easy rollback:** Can revert single package if issues found
- **Clear dependencies:** Types → Auth → UI → Authorization
- **Better debugging:** Know exactly what changed if something breaks

**Integration order:**
1. shared-types (no runtime dependencies)
2. shared-auth (depends on shared-types)
3. shared-ui (depends on shared-types, shared-auth)
4. Authorization features (depends on all above)

---

## Phase 1: Structure Alignment & Table Rename

**Duration:** 1 day (8 hours)
**Risk:** 🟡 Medium (database changes)
**Objective:** Prepare ValidAI for platform integration

### Task 1.1: Initialize Monorepo Structure (2 hours)

#### Create Root Workspace Files

**1. Root package.json**

```bash
cd /c/Dev/Validai
```

Create `/package.json`:

```json
{
  "name": "playze-validai",
  "version": "0.0.0",
  "private": true,
  "description": "Playze Core platform with ValidAI as first application",
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "clean": "turbo clean && rm -rf node_modules .turbo"
  },
  "devDependencies": {
    "@types/node": "^20",
    "prettier": "^3.4.2",
    "supabase": "^2.51.0",
    "turbo": "^2.3.3",
    "typescript": "^5"
  }
}
```

**2. pnpm-workspace.yaml**

Create `/pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**3. turbo.json**

Create `/turbo.json` (copy from Playze Core):

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": [
        "$TURBO_DEFAULT$",
        ".env.local",
        ".env.production.local"
      ],
      "outputs": [
        ".next/**",
        "!.next/cache/**",
        "dist/**"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**4. Root tsconfig.json**

Create `/tsconfig.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "exclude": ["node_modules", "dist", ".next"]
}
```

**5. Install pnpm**

```bash
npm install -g pnpm@9.15.0
pnpm --version  # Verify: 9.15.0
```

**Deliverable:** Monorepo root initialized

---

### Task 1.2: Move ValidAI to apps/ (1 hour)

#### Create Directory Structure

```bash
mkdir apps packages
```

#### Move ValidAI App

```bash
mv validai-app apps/validai
```

#### Move Supabase to Root

```bash
mv apps/validai/supabase ./supabase
```

**Why:** Supabase project is shared by all apps (ValidAI, admin-portal, testapp)

#### Update apps/validai/package.json

Edit `apps/validai/package.json`:

```json
{
  "name": "@playze/validai",  // Changed from "validai-app"
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    // ... existing dependencies (unchanged for now)
  }
}
```

#### Update apps/validai/tsconfig.json

Add root extension:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    // ... existing compilerOptions
  }
}
```

**Deliverable:** ValidAI in apps/ directory

---

### Task 1.3: Rename ValidAI Tables with Prefix (5 hours)

**CRITICAL STEP:** This renames all ValidAI domain tables to avoid conflicts with platform tables.

#### Pre-Migration Backup

**1. Backup database:**

```bash
# Via Supabase dashboard
# Settings → Database → Create backup
# OR via CLI
npx supabase db dump -f backup-before-rename.sql
```

**2. Document current state:**

```sql
-- Record table counts before rename
SELECT
  'documents' as table_name,
  COUNT(*) as row_count
FROM documents
UNION ALL
SELECT 'processors', COUNT(*) FROM processors
UNION ALL
SELECT 'operations', COUNT(*) FROM operations
UNION ALL
SELECT 'runs', COUNT(*) FROM runs
UNION ALL
SELECT 'operation_results', COUNT(*) FROM operation_results
UNION ALL
SELECT 'workbench_executions', COUNT(*) FROM workbench_executions
UNION ALL
SELECT 'llm_global_settings', COUNT(*) FROM llm_global_settings;
```

**Save results** to compare after migration.

#### Create Migration File

**File:** `supabase/migrations/20250123000000_rename_validai_tables.sql`

```sql
-- =============================================================================
-- VALIDAI TABLE RENAME MIGRATION
-- =============================================================================
-- Description: Rename all ValidAI domain tables with validai_ prefix
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Medium (table renames, code changes required)
-- =============================================================================

-- Disable foreign key checks temporarily (if needed)
-- PostgreSQL auto-updates foreign keys on table renames

-- -----------------------------------------------------------------------------
-- RENAME TABLES
-- -----------------------------------------------------------------------------

ALTER TABLE documents RENAME TO validai_documents;
ALTER TABLE processors RENAME TO validai_processors;
ALTER TABLE operations RENAME TO validai_operations;
ALTER TABLE runs RENAME TO validai_runs;
ALTER TABLE operation_results RENAME TO validai_operation_results;
ALTER TABLE workbench_executions RENAME TO validai_workbench_executions;
ALTER TABLE llm_global_settings RENAME TO validai_llm_global_settings;

-- -----------------------------------------------------------------------------
-- VERIFY RENAMES
-- -----------------------------------------------------------------------------

-- Check all tables exist with new names
DO $$
BEGIN
  -- Verify each table exists
  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_documents'
  )), 'validai_documents table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_processors'
  )), 'validai_processors table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_operations'
  )), 'validai_operations table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_runs'
  )), 'validai_runs table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_operation_results'
  )), 'validai_operation_results table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_workbench_executions'
  )), 'validai_workbench_executions table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_llm_global_settings'
  )), 'validai_llm_global_settings table not found';

  RAISE NOTICE 'All tables renamed successfully!';
END $$;

-- -----------------------------------------------------------------------------
-- NOTE: PostgreSQL auto-updates foreign keys, indexes, and RLS policies
-- No manual updates needed for:
-- - Foreign key constraints
-- - Indexes
-- - RLS policies (table references auto-updated)
-- -----------------------------------------------------------------------------
```

#### Apply Migration

```bash
cd /c/Dev/Validai
npx supabase db push
```

**Expected output:**
```
Applying migration 20250123000000_rename_validai_tables...
NOTICE:  All tables renamed successfully!
Migration applied successfully.
```

#### Verify Migration Success

```sql
-- Verify all tables renamed
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'validai_%'
ORDER BY tablename;

-- Should show:
-- validai_documents
-- validai_llm_global_settings
-- validai_operation_results
-- validai_operations
-- validai_processors
-- validai_runs
-- validai_workbench_executions

-- Verify row counts unchanged
SELECT
  'validai_documents' as table_name,
  COUNT(*) as row_count
FROM validai_documents
UNION ALL
SELECT 'validai_processors', COUNT(*) FROM validai_processors
UNION ALL
SELECT 'validai_operations', COUNT(*) FROM validai_operations
UNION ALL
SELECT 'validai_runs', COUNT(*) FROM validai_runs
UNION ALL
SELECT 'validai_operation_results', COUNT(*) FROM validai_operation_results
UNION ALL
SELECT 'validai_workbench_executions', COUNT(*) FROM validai_workbench_executions
UNION ALL
SELECT 'validai_llm_global_settings', COUNT(*) FROM validai_llm_global_settings;
```

**Compare with pre-migration counts** - should be identical.

#### Update ValidAI Code to Use New Table Names

**Automated find/replace:**

```bash
cd apps/validai

# Create backup
git stash

# Find and replace table names in all TypeScript/TSX files
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('documents')/\.from('validai_documents')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('processors')/\.from('validai_processors')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('operations')/\.from('validai_operations')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('runs')/\.from('validai_runs')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('operation_results')/\.from('validai_operation_results')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('workbench_executions')/\.from('validai_workbench_executions')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('llm_global_settings')/\.from('validai_llm_global_settings')/g" {} +

# Windows alternative using PowerShell
# Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object { (Get-Content $_) -replace "\.from\('documents'\)", ".from('validai_documents')" | Set-Content $_ }
```

**Files likely affected:**
- `apps/validai/app/queries/documents.ts`
- `apps/validai/app/queries/processors.ts`
- `apps/validai/app/queries/operations.ts`
- `apps/validai/app/queries/runs.ts`
- `apps/validai/app/queries/workbench.ts`
- Any component using direct Supabase queries

**Manual verification recommended:**

```bash
# Search for any remaining old table names
grep -r "\.from('documents')" apps/validai --include="*.ts" --include="*.tsx"
grep -r "\.from('processors')" apps/validai --include="*.ts" --include="*.tsx"
# ... repeat for other tables
```

**Should return NO results** after successful replacement.

#### Test ValidAI App

```bash
cd apps/validai
npm install  # Using npm for now (will switch to pnpm in Phase 2)
npm run dev
```

**Critical tests:**

1. **Login:**
   - [ ] Navigate to `/auth/login`
   - [ ] Log in with credentials
   - [ ] Redirected to dashboard

2. **Dashboard:**
   - [ ] Dashboard loads
   - [ ] Statistics display

3. **Processors:**
   - [ ] Navigate to `/proc`
   - [ ] List of processors displays (uses validai_processors)
   - [ ] Can view processor details
   - [ ] Can edit processor
   - [ ] Can save changes

4. **Operations:**
   - [ ] Operations list shows within processor (uses validai_operations)
   - [ ] Can create new operation
   - [ ] Can edit operation
   - [ ] Can save operation

5. **Documents:**
   - [ ] Documents list displays (uses validai_documents)
   - [ ] Can upload document
   - [ ] Document appears in list

6. **Runs:**
   - [ ] Can trigger run (uses validai_runs)
   - [ ] Run executes
   - [ ] Results display (uses validai_operation_results)
   - [ ] Charts render

7. **Workbench:**
   - [ ] Workbench loads (uses validai_workbench_executions)
   - [ ] Can execute prompt
   - [ ] Response displays

**If ANY test fails:**
- Check browser console for errors
- Look for table name mismatches
- Verify migration applied correctly
- Check RLS policies still work

#### Create Checkpoint Commit

```bash
git add .
git commit -m "feat: Phase 1 complete - ValidAI structure aligned

- Initialized monorepo root (pnpm, Turborepo)
- Moved validai-app → apps/validai
- Moved supabase to root level
- Renamed all ValidAI tables with validai_ prefix:
  - documents → validai_documents
  - processors → validai_processors
  - operations → validai_operations
  - runs → validai_runs
  - operation_results → validai_operation_results
  - workbench_executions → validai_workbench_executions
  - llm_global_settings → validai_llm_global_settings
- Updated all code to use new table names
- Verified ValidAI fully functional with prefixed tables

Database changes: 7 tables renamed
Code changes: All .from() calls updated
Data: Zero loss, verified row counts match

Next: Phase 2 - Import Playze Core"

git tag phase1-complete
```

**Deliverable:** Phase 1 complete, ValidAI ready for platform integration

---

## Phase 2: Import Playze Core

**Duration:** 2-3 days (16-24 hours)
**Risk:** 🟡 Medium (database migration, schema merge)
**Objective:** Import complete Playze Core infrastructure

### Task 2.1: Copy Shared Packages (2 hours)

#### Copy Package Directories

```bash
cd /c/Dev/Validai

# Copy all shared packages from Playze Core
cp -r /c/Dev/playze-core/packages/shared-ui ./packages/
cp -r /c/Dev/playze-core/packages/shared-auth ./packages/
cp -r /c/Dev/playze-core/packages/shared-types ./packages/
cp -r /c/Dev/playze-core/packages/shared-config ./packages/
```

**What gets copied:**

**shared-ui:**
- 19+ shadcn components (Button, Card, Badge, etc.)
- Platform components (AuthGate, AppSwitcher, OrgSwitcher)
- Hooks (useDebounce, etc.)
- Utilities (cn, react-query provider)

**shared-auth:**
- Supabase clients (client, server, middleware)
- 9 authorization hooks:
  - useAuth()
  - useAuthorization() - PRIMARY (tier + role)
  - useCurrentOrganization()
  - useFeatureAccess()
  - usePermission()
  - useHasRole()
  - useOrganizationApps()
  - useSwitchOrganization()
  - useUserOrganizations()

**shared-types:**
- database.types.ts (generated from Playze Core schema)
- shortcuts.ts (type helpers)
- platform.types.ts

**shared-config:**
- ESLint configurations
- TypeScript base configs
- Tailwind base config

#### Verify Package Contents

```bash
ls -la packages/
# Should show: shared-auth shared-config shared-types shared-ui

ls packages/shared-ui/src/components/
# Should show: platform/ ui/

ls packages/shared-auth/src/hooks/
# Should show: use-auth.ts use-authorization.ts etc.
```

#### Install Dependencies

```bash
pnpm install
```

**First time using pnpm** - will create `pnpm-lock.yaml`

#### Build Packages

```bash
turbo build --filter=@playze/shared-*
```

**Expected output:**
```
@playze/shared-types:build: cache miss, executing...
@playze/shared-auth:build: cache miss, executing...
@playze/shared-ui:build: cache miss, executing...
@playze/shared-config:build: cache hit, skipping...

Tasks: 4 successful, 4 total
```

**Verify build outputs:**
```bash
ls packages/shared-types/dist/
ls packages/shared-auth/dist/
ls packages/shared-ui/dist/
```

**Deliverable:** 4 shared packages building successfully

---

### Task 2.2: Copy Apps (2 hours)

#### Copy App Directories

```bash
cp -r /c/Dev/playze-core/apps/admin-portal ./apps/
cp -r /c/Dev/playze-core/apps/testapp ./apps/
```

#### Update Environment Variables

**Create root `.env.local`:**

```bash
cat > .env.local << 'EOF'
# Supabase Project (ValidAI)
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-validai-anon-key>

# Service Role (for Edge Functions and admin operations)
SUPABASE_SERVICE_ROLE_KEY=<your-validai-service-role-key>
EOF
```

**Get keys from Supabase dashboard:**
- Project: xczippkxxdqlvaacjexj
- Settings → API → Project URL
- Settings → API → Project API keys

**Copy to all apps:**

```bash
cp .env.local apps/validai/.env.local
cp .env.local apps/admin-portal/.env.local
cp .env.local apps/testapp/.env.local
```

#### Install Dependencies

```bash
pnpm install
```

#### Verify Apps Structure

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

### Task 2.3: Copy Edge Functions (2 hours)

#### Copy Function Directories

```bash
cp -r /c/Dev/playze-core/supabase/functions/_shared ./supabase/functions/
cp -r /c/Dev/playze-core/supabase/functions/auth ./supabase/functions/
cp -r /c/Dev/playze-core/supabase/functions/admin ./supabase/functions/
```

**What gets copied:**

**_shared/**
- supabaseAdmin.ts (service-role client)
- auth.ts (JWT validation)
- validation.ts (input validation)
- response.ts (standardized responses)
- cors.ts (CORS headers)

**auth/**
- switch-organization/ (updates JWT metadata)

**admin/**
- create-organization/ (admin-only org creation)

#### Verify Function Structure

```bash
ls supabase/functions/
# Should show: _shared admin auth

ls supabase/functions/auth/
# Should show: switch-organization/

ls supabase/functions/admin/
# Should show: create-organization/
```

#### Deploy Edge Functions

**Set Supabase access token:**

```bash
# Windows
set SUPABASE_ACCESS_TOKEN=sbp_646a9a0c9d1f841b006b0567bfc515a9754460fa

# Linux/Mac
export SUPABASE_ACCESS_TOKEN=sbp_646a9a0c9d1f841b006b0567bfc515a9754460fa
```

**Link to ValidAI project:**

```bash
npx supabase link --project-ref xczippkxxdqlvaacjexj
```

**Deploy functions:**

```bash
npx supabase functions deploy switch-organization
npx supabase functions deploy create-organization
```

**Verify deployment:**

```bash
npx supabase functions list
# Should show:
# - switch-organization (deployed)
# - create-organization (deployed)
```

**Deliverable:** Edge Functions deployed

---

### Task 2.4: Apply Playze Core Database Migrations (8-10 hours)

**CRITICAL SECTION:** This merges Playze Core platform tables with ValidAI tables.

#### Copy Migration Files

```bash
cp /c/Dev/playze-core/supabase/migrations/*.sql ./supabase/migrations/
```

**Migrations copied:**
- 20250117000000_core_schema.sql
- 20250117000001_rls_policies.sql
- 20250117000002_helper_functions.sql
- 20250117000003_database_functions.sql
- 20250117000004_triggers.sql
- 20250120000000_admin_users.sql
- 20250122000002_unified_authorization.sql
- (All other Playze Core migrations)



#### Review Migration Order

**Correct order:**

1. Playze Core migrations (create platform tables)
2. Merge migration (enhance organizations)
3. ValidAI registration (next task)

**Check migration files:**

```bash
ls -1 supabase/migrations/ | sort
```

**Should show:**
```
20250117000000_core_schema.sql
20250117000001_rls_policies.sql
20250117000002_helper_functions.sql
20250117000003_database_functions.sql
20250117000004_triggers.sql
20250120000000_admin_users.sql
20250122000002_unified_authorization.sql
20250123000000_rename_validai_tables.sql  (Phase 1)
20250123100000_merge_platform_schemas.sql  (Phase 2)
```

#### Apply Migrations

```bash
npx supabase db push
```

**Watch for errors:**
- Table already exists → Check if ValidAI tables conflicting
- Constraint violation → Check data integrity
- Permission denied → Check RLS policies

**Expected output:**
```
Applying migration 20250117000000_core_schema.sql...
Applying migration 20250117000001_rls_policies.sql...
...
Applying migration 20250123100000_merge_platform_schemas.sql...
NOTICE: Organizations table merge successful!
All migrations applied successfully.
```

#### Verify Database State

**Check all tables exist:**

```sql
SELECT tablename, schemaname
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Should show 21 tables total:**

**Platform tables (11):**
- admin_users
- app_role_permissions
- apps
- app_tiers
- invoices
- organization_app_subscriptions
- organization_invitations
- organization_members
- organizations (merged schema)
- profiles
- user_preferences

**ValidAI tables (10):**
- validai_documents
- validai_llm_global_settings
- validai_operation_results
- validai_operations
- validai_processors
- validai_runs
- validai_workbench_executions
- validai_operations
- validai_profiles
- validai_organization_members

**Check functions exist:**

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

**Should include:**
- get_user_authorization
- get_user_organizations
- get_organization_apps
- has_app_access
- user_organization_id
- is_playze_admin
- (15+ admin functions)

**Verify organizations data:**

```sql
SELECT
  id,
  name,
  slug,
  plan_type,
  is_active,
  CASE WHEN llm_configuration IS NOT NULL THEN 'configured' ELSE 'not configured' END as llm_config
FROM organizations;
```

**All organizations should have:**
- ✅ Unique slug
- ✅ plan_type (free/pro/enterprise)
- ✅ is_active = true

**Deliverable:** Platform tables added, schemas merged, no data loss

---

### Task 2.5: Register ValidAI as App (2 hours)

**Create migration:** `supabase/migrations/20250123200000_register_validai_app.sql`

```sql
-- =============================================================================
-- REGISTER VALIDAI AS PLATFORM APPLICATION
-- =============================================================================
-- Description: Register ValidAI in apps catalog with tiers and permissions
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Low (just data insertion)
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
-- MIGRATE EXISTING ORGANIZATIONS TO SUBSCRIPTIONS
-- -----------------------------------------------------------------------------

-- Create active subscriptions for all existing organizations
INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  tier_name,
  status,
  billing_period_start,
  billing_period_end,
  assigned_by,
  notes
)
SELECT
  o.id as organization_id,
  'validai' as app_id,
  (
    SELECT id FROM app_tiers
    WHERE app_id = 'validai'
      AND tier_name = COALESCE(o.plan_type, 'free')
    LIMIT 1
  ) as tier_id,
  COALESCE(o.plan_type, 'free') as tier_name,
  'active' as status,
  now() as billing_period_start,
  now() + interval '1 month' as billing_period_end,
  NULL as assigned_by,
  'Migrated from ValidAI standalone (plan_type: ' || COALESCE(o.plan_type, 'free') || ')' as notes
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_app_subscriptions oas
  WHERE oas.organization_id = o.id
    AND oas.app_id = 'validai'
);

-- -----------------------------------------------------------------------------
-- CREATE ROLE PERMISSIONS
-- -----------------------------------------------------------------------------

-- Owner permissions
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'owner',
  jsonb_build_object(
    'can_edit', true,
    'can_delete', true,
    'can_export', true,
    'can_manage_billing', true,
    'can_manage_members', true,
    'can_manage_settings', true,
    'can_view_analytics', true
  )
)
ON CONFLICT (app_id, role) DO NOTHING;

-- Admin permissions
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'admin',
  jsonb_build_object(
    'can_edit', true,
    'can_delete', true,
    'can_export', true,
    'can_manage_billing', false,
    'can_manage_members', true,
    'can_manage_settings', true,
    'can_view_analytics', true
  )
)
ON CONFLICT (app_id, role) DO NOTHING;

-- Member permissions
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'member',
  jsonb_build_object(
    'can_edit', true,
    'can_delete', false,
    'can_export', false,
    'can_manage_billing', false,
    'can_manage_members', false,
    'can_manage_settings', false,
    'can_view_analytics', false
  )
)
ON CONFLICT (app_id, role) DO NOTHING;

-- Viewer permissions
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'viewer',
  jsonb_build_object(
    'can_edit', false,
    'can_delete', false,
    'can_export', false,
    'can_manage_billing', false,
    'can_manage_members', false,
    'can_manage_settings', false,
    'can_view_analytics', false
  )
)
ON CONFLICT (app_id, role) DO NOTHING;

-- -----------------------------------------------------------------------------
-- VERIFY REGISTRATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  org_count INT;
  subscription_count INT;
BEGIN
  -- Check app registered
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM apps WHERE id = 'validai'
  )), 'ValidAI app not registered';

  -- Check tiers created
  ASSERT (SELECT COUNT(*) FROM app_tiers WHERE app_id = 'validai') = 3,
    'ValidAI should have 3 tiers';

  -- Check role permissions
  ASSERT (SELECT COUNT(*) FROM app_role_permissions WHERE app_id = 'validai') = 4,
    'ValidAI should have 4 role permissions';

  -- Check all orgs have subscriptions
  SELECT COUNT(*) INTO org_count FROM organizations;
  SELECT COUNT(*) INTO subscription_count
  FROM organization_app_subscriptions
  WHERE app_id = 'validai';

  ASSERT org_count = subscription_count,
    format('Organization count (%s) should match subscription count (%s)', org_count, subscription_count);

  RAISE NOTICE 'ValidAI registered successfully!';
  RAISE NOTICE '  - Tiers: %', (SELECT COUNT(*) FROM app_tiers WHERE app_id = 'validai');
  RAISE NOTICE '  - Subscriptions: %', subscription_count;
  RAISE NOTICE '  - Role permissions: %', (SELECT COUNT(*) FROM app_role_permissions WHERE app_id = 'validai');
END $$;
```

#### Apply Migration

```bash
npx supabase db push
```

**Expected output:**
```
Applying migration 20250123200000_register_validai_app.sql...
NOTICE: ValidAI registered successfully!
NOTICE:   - Tiers: 3
NOTICE:   - Subscriptions: <number-of-orgs>
NOTICE:   - Role permissions: 4
Migration applied successfully.
```

#### Verify ValidAI Registration

**Check app:**
```sql
SELECT * FROM apps WHERE id = 'validai';
```

**Check tiers:**
```sql
SELECT
  tier_name,
  display_name,
  features,
  limits,
  price_monthly
FROM app_tiers
WHERE app_id = 'validai'
ORDER BY price_monthly;
```

**Check subscriptions:**
```sql
SELECT
  o.name as organization,
  oas.tier_name,
  oas.status,
  oas.billing_period_end
FROM organization_app_subscriptions oas
JOIN organizations o ON o.id = oas.organization_id
WHERE oas.app_id = 'validai'
ORDER BY o.name;
```

**Check permissions:**
```sql
SELECT
  role,
  permissions
FROM app_role_permissions
WHERE app_id = 'validai'
ORDER BY
  CASE role
    WHEN 'owner' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'member' THEN 3
    WHEN 'viewer' THEN 4
  END;
```

**Deliverable:** ValidAI registered with tiers, subscriptions, permissions

---

### Task 2.6: Update ValidAI RLS Policies (2 hours)

**Create migration:** `supabase/migrations/20250123300000_validai_rls_with_app_access.sql`

```sql
-- =============================================================================
-- UPDATE VALIDAI RLS POLICIES WITH APP ACCESS CHECKS
-- =============================================================================
-- Description: Enhance RLS policies to verify app subscription
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Low (adding checks, not removing security)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VALIDAI_DOCUMENTS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access own org documents" ON validai_documents;

CREATE POLICY "Users access own org documents with app access"
  ON validai_documents
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- -----------------------------------------------------------------------------
-- VALIDAI_PROCESSORS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access own org processors" ON validai_processors;

CREATE POLICY "Users access own org processors with app access"
  ON validai_processors
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- -----------------------------------------------------------------------------
-- VALIDAI_OPERATIONS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access own org operations" ON validai_operations;

CREATE POLICY "Users access own org operations with app access"
  ON validai_operations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM validai_processors p
      WHERE p.id = validai_operations.processor_id
        AND p.organization_id = public.user_organization_id()
    )
    AND public.has_app_access('validai')
  );

-- -----------------------------------------------------------------------------
-- VALIDAI_RUNS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access own org runs" ON validai_runs;

CREATE POLICY "Users access own org runs with app access"
  ON validai_runs
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- -----------------------------------------------------------------------------
-- VALIDAI_OPERATION_RESULTS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access own org operation results" ON validai_operation_results;

CREATE POLICY "Users access own org operation results with app access"
  ON validai_operation_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM validai_runs r
      WHERE r.id = validai_operation_results.run_id
        AND r.organization_id = public.user_organization_id()
    )
    AND public.has_app_access('validai')
  );

-- -----------------------------------------------------------------------------
-- VALIDAI_WORKBENCH_EXECUTIONS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users access own org workbench" ON validai_workbench_executions;

CREATE POLICY "Users access own org workbench with app access"
  ON validai_workbench_executions
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- -----------------------------------------------------------------------------
-- VALIDAI_LLM_GLOBAL_SETTINGS
-- -----------------------------------------------------------------------------

-- This table might be global or org-specific
-- If global (all orgs see same models), use this policy:

DROP POLICY IF EXISTS "All authenticated users view llm settings" ON validai_llm_global_settings;

CREATE POLICY "All authenticated users view llm settings with app access"
  ON validai_llm_global_settings
  FOR SELECT
  USING (
    public.has_app_access('validai')
  );

-- If only admins should modify:
DROP POLICY IF EXISTS "Only admins manage llm settings" ON validai_llm_global_settings;

CREATE POLICY "Only admins manage llm settings"
  ON validai_llm_global_settings
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- VERIFY POLICIES
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- Verify each table has RLS enabled
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'validai_documents'),
    'RLS not enabled on validai_documents';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'validai_processors'),
    'RLS not enabled on validai_processors';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'validai_operations'),
    'RLS not enabled on validai_operations';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'validai_runs'),
    'RLS not enabled on validai_runs';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'validai_operation_results'),
    'RLS not enabled on validai_operation_results';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'validai_workbench_executions'),
    'RLS not enabled on validai_workbench_executions';

  RAISE NOTICE 'RLS policies updated successfully!';
END $$;
```

#### Apply Migration

```bash
npx supabase db push
```

#### Verify RLS Policies

```sql
-- Check policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename LIKE 'validai_%'
ORDER BY tablename, policyname;
```

**Should show policies with "app access" in names**

#### Test RLS (Important!)

**Create test user without ValidAI subscription:**

```sql
-- Temporarily remove subscription
UPDATE organization_app_subscriptions
SET status = 'inactive'
WHERE organization_id = (
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1
)
AND app_id = 'validai';
```

**Try to query ValidAI tables:**
```sql
SELECT * FROM validai_documents;  -- Should return 0 rows (access denied)
SELECT * FROM validai_processors; -- Should return 0 rows (access denied)
```

**Restore subscription:**
```sql
UPDATE organization_app_subscriptions
SET status = 'active'
WHERE organization_id = (
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1
)
AND app_id = 'validai';
```

**Query again:**
```sql
SELECT * FROM validai_documents;  -- Should return documents
SELECT * FROM validai_processors; -- Should return processors
```

✅ **If this works:** RLS policies correctly enforce app access

**Deliverable:** RLS policies enforce app subscription

---

### Task 2.7: Create Phase 2 Checkpoint (1 hour)

```bash
git add .
git commit -m "feat: Phase 2 complete - Playze Core imported, ValidAI registered

**Shared Packages (4):**
- @playze/shared-ui (19+ components + AuthGate, AppSwitcher, OrgSwitcher)
- @playze/shared-auth (9 hooks including useAuthorization)
- @playze/shared-types (database types + shortcuts)
- @playze/shared-config (ESLint, TypeScript, Tailwind)

**Apps (2 new):**
- apps/admin-portal (copied from Playze Core)
- apps/testapp (copied from Playze Core)

**Edge Functions (2 deployed):**
- switch-organization (updates JWT)
- create-organization (admin-only)

**Database Changes:**
- Applied 11 Playze Core migrations (platform tables)
- Merged organizations schema (Playze + ValidAI columns)
- Registered ValidAI as platform app
- Created 3 tiers (free, pro, enterprise)
- Created 4 role permissions (owner, admin, member, viewer)
- Migrated all orgs to subscription model
- Updated RLS policies with app access checks

**Tables:** 21 total (11 platform + 7 ValidAI + 3 shared)
**Functions:** 15+ (authorization, helpers, admin)
**Environment:** All apps use ValidAI Supabase project

Next: Phase 3 - MILESTONE Verification"

git tag phase2-complete
```

**Deliverable:** Phase 2 complete, ready for verification

---

## Phase 3: MILESTONE - Verify Independent Operation

**Duration:** 1 day (8 hours)
**Risk:** 🟢 Low (verification only)
**Objective:** Prove all apps functional before integration

**CRITICAL:** This phase catches issues early, before complex integration.

### Task 3.1: Test ValidAI App (3 hours)

#### Start ValidAI

```bash
cd /c/Dev/Validai
pnpm install  # Ensure all dependencies
turbo dev --filter=@playze/validai
```

**Or:**
```bash
cd apps/validai
pnpm dev
```

**Expected:** App starts on http://localhost:3000

#### Authentication Tests

**Test 1: Login**
- [ ] Navigate to http://localhost:3000/auth/login
- [ ] Enter credentials
- [ ] Click "Sign In"
- [ ] Should redirect to /dashboard
- [ ] User avatar/name shows in header

**Test 2: Session Persistence**
- [ ] Refresh page (F5)
- [ ] Should stay logged in
- [ ] Dashboard still shows

**Test 3: Logout**
- [ ] Click logout button
- [ ] Should clear session
- [ ] Redirect to /auth/login

#### Core Functionality Tests

**Test 4: Dashboard**
- [ ] Navigate to /dashboard
- [ ] Statistics cards display
- [ ] Recent activity shows
- [ ] Navigation works

**Test 5: Processors List**
- [ ] Navigate to /proc
- [ ] List of processors displays (queries validai_processors)
- [ ] Processor cards show correctly
- [ ] Can filter/search processors
- [ ] Pagination works (if applicable)

**Test 6: Processor Detail**
- [ ] Click processor to view detail
- [ ] Processor details load
- [ ] Operations list displays (queries validai_operations)
- [ ] Can see operation configuration

**Test 7: Create Processor**
- [ ] Click "Create Processor"
- [ ] Form displays
- [ ] Fill in name, description
- [ ] Submit form
- [ ] Processor created in validai_processors table
- [ ] Redirected to processor detail

**Test 8: Edit Processor**
- [ ] Click "Edit" on processor
- [ ] Form pre-filled with current values
- [ ] Change name
- [ ] Save changes
- [ ] Changes persist in database

**Test 9: Create Operation**
- [ ] Within processor, click "Add Operation"
- [ ] Operation form displays
- [ ] Select operation type (extraction/validation/etc.)
- [ ] Enter prompt
- [ ] Define output schema (JSON)
- [ ] Save operation
- [ ] Operation appears in list (validai_operations)

**Test 10: Edit Operation**
- [ ] Click edit on operation
- [ ] Form pre-filled
- [ ] Change prompt
- [ ] Save
- [ ] Changes persist

**Test 11: Drag-Drop Reorder**
- [ ] Drag operation to new position
- [ ] Operation reorders
- [ ] Position saved to database (validai_operations.position)

**Test 12: Documents**
- [ ] Navigate to documents page
- [ ] Document list displays (queries validai_documents)
- [ ] Click "Upload Document"
- [ ] Select file
- [ ] Upload
- [ ] Document appears in list
- [ ] Storage path correct

**Test 13: View Document**
- [ ] Click document to view
- [ ] Document metadata displays
- [ ] Can download document

**Test 14: Trigger Run**
- [ ] Select processor
- [ ] Select document
- [ ] Click "Run"
- [ ] Run created in validai_runs table
- [ ] Status updates (pending → processing → completed)

**Test 15: View Run Results**
- [ ] Navigate to run detail
- [ ] Results display (queries validai_operation_results)
- [ ] Structured output shows
- [ ] Charts render (if applicable)
- [ ] Token usage tracked

**Test 16: Workbench**
- [ ] Navigate to workbench
- [ ] Select processor
- [ ] Enter test prompt
- [ ] Execute
- [ ] Response displays
- [ ] Execution saved in validai_workbench_executions

**Test 17: Organization Switching**
- [ ] Organization selector shows current org
- [ ] If user has multiple orgs, can switch
- [ ] Data filters to new organization
- [ ] URL updates with org context

#### Record Test Results

**Create test report:**

```markdown
# ValidAI Phase 3 Test Results

**Tester:** [Your Name]
**Date:** 2025-01-23
**Duration:** 3 hours

## Test Summary
- Total Tests: 17
- Passed: __
- Failed: __
- Skipped: __

## Detailed Results

### Authentication
- [ ] ✅ Login
- [ ] ✅ Session Persistence
- [ ] ✅ Logout

### Core Functionality
- [ ] ✅ Dashboard
- [ ] ✅ Processors List
- [ ] ✅ Processor Detail
- [ ] ✅ Create Processor
- [ ] ✅ Edit Processor
- [ ] ✅ Create Operation
- [ ] ✅ Edit Operation
- [ ] ✅ Drag-Drop Reorder
- [ ] ✅ Documents List
- [ ] ✅ Upload Document
- [ ] ✅ View Document
- [ ] ✅ Trigger Run
- [ ] ✅ View Run Results
- [ ] ✅ Workbench
- [ ] ✅ Organization Switching

## Issues Found
1. [Issue description]
2. [Issue description]

## Notes
[Any observations]
```

**Deliverable:** ValidAI fully functional with prefixed tables

---

### Task 3.2: Test Admin Portal (2 hours)

#### Add Yourself as Admin

**First time only:**

```sql
INSERT INTO admin_users (email)
VALUES ('your-email@example.com')
ON CONFLICT (email) DO NOTHING;
```

Replace with your actual email address.

#### Start Admin Portal

```bash
turbo dev --filter=@playze/admin-portal
```

**Or:**
```bash
cd apps/admin-portal
pnpm dev
```

**Expected:** App starts on http://localhost:3001

#### Admin Portal Tests

**Test 1: Admin Login**
- [ ] Navigate to http://localhost:3001
- [ ] Login with admin email
- [ ] Should redirect to admin dashboard
- [ ] Admin check passes (is_playze_admin() returns true)

**Test 2: Dashboard**
- [ ] Admin dashboard loads
- [ ] Statistics display
- [ ] Navigation sidebar shows

**Test 3: Organizations List**
- [ ] Click "Organizations" in sidebar
- [ ] List of organizations displays (uses admin_list_organizations RPC)
- [ ] Shows all organizations (not just user's)
- [ ] Can search/filter organizations

**Test 4: Organization Detail**
- [ ] Click organization to view detail
- [ ] Organization details load (uses admin_get_organization RPC)
- [ ] Shows: name, slug, created_at, member count

**Test 5: Organization Members**
- [ ] Within org detail, view members tab
- [ ] List of members displays (uses admin_list_organization_members RPC)
- [ ] Shows: name, email, role, joined_at

**Test 6: Organization Subscriptions**
- [ ] View subscriptions tab
- [ ] Shows ValidAI subscription
- [ ] Shows: tier, status, billing period

**Test 7: Subscriptions Page**
- [ ] Navigate to "Subscriptions" in sidebar
- [ ] List of all subscriptions displays (uses admin_list_all_subscriptions RPC)
- [ ] Can filter by app (ValidAI)
- [ ] Can filter by tier (free/pro/enterprise)
- [ ] Can filter by status (active/past_due/canceled)

**Test 8: Users Page**
- [ ] Navigate to "Users" in sidebar
- [ ] List of all users displays (uses admin_list_all_users RPC)
- [ ] Shows: email, name, organizations count
- [ ] Can search users

**Test 9: User Detail**
- [ ] Click user to view detail
- [ ] User details load (uses admin_get_user RPC)
- [ ] Shows: profile, memberships

**Test 10: Non-Admin Access**
- [ ] Logout
- [ ] Login with non-admin email
- [ ] Should be denied access (is_playze_admin() returns false)
- [ ] Shows error message

#### Record Test Results

**Admin Portal Tests:**
- Total: 10
- Passed: __
- Failed: __

**Issues Found:**
1. [Issue description]

**Deliverable:** Admin portal functional

---

### Task 3.3: Test TestApp (1 hour)

#### Start TestApp

```bash
turbo dev --filter=@playze/testapp
```

**Or:**
```bash
cd apps/testapp
pnpm dev
```

**Expected:** App starts on http://localhost:3002

#### TestApp Tests

**Test 1: Login**
- [ ] Navigate to http://localhost:3002
- [ ] Login with credentials
- [ ] Redirected to dashboard

**Test 2: Dashboard**
- [ ] Dashboard loads
- [ ] Shows 3 authorization demo cards

**Test 3: Authorization Card 1**
- [ ] "Your Authorization" card displays
- [ ] Calls get_user_authorization('validai')
- [ ] Shows: tier_name, tier_display_name, user_role
- [ ] Shows tier features
- [ ] Shows role permissions

**Test 4: Authorization Card 2**
- [ ] "Feature Access" card displays
- [ ] Shows checkmarks for available features
- [ ] Shows upgrade prompt for restricted features

**Test 5: Authorization Card 3**
- [ ] "Your Organizations" card displays
- [ ] Lists user's organizations
- [ ] Shows role in each organization

**Test 6: Organization Switcher**
- [ ] Click organization switcher
- [ ] Lists user's organizations
- [ ] Can switch to another org
- [ ] Dashboard refreshes with new org context

**Test 7: App Switcher**
- [ ] Click app switcher
- [ ] Shows "ValidAI" (since user's org has ValidAI subscription)
- [ ] Click ValidAI
- [ ] Navigates to ValidAI app

#### Record Test Results

**TestApp Tests:**
- Total: 7
- Passed: __
- Failed: __

**Issues Found:**
1. [Issue description]

**Deliverable:** TestApp functional

---

### Task 3.4: Database Health Check (1 hour)

#### Verify Table Counts

```sql
-- Platform tables
SELECT 'apps' as table_name, COUNT(*) as rows FROM apps
UNION ALL
SELECT 'app_tiers', COUNT(*) FROM app_tiers
UNION ALL
SELECT 'organization_app_subscriptions', COUNT(*) FROM organization_app_subscriptions
UNION ALL
SELECT 'app_role_permissions', COUNT(*) FROM app_role_permissions
UNION ALL
SELECT 'admin_users', COUNT(*) FROM admin_users
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL
SELECT 'user_preferences', COUNT(*) FROM user_preferences
UNION ALL
SELECT 'organization_invitations', COUNT(*) FROM organization_invitations

UNION ALL

-- Shared tables
SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL
SELECT 'organization_members', COUNT(*) FROM organization_members
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles

UNION ALL

-- ValidAI tables
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
SELECT 'validai_workbench_executions', COUNT(*) FROM validai_workbench_executions
UNION ALL
SELECT 'validai_llm_global_settings', COUNT(*) FROM validai_llm_global_settings;
```

**Expected:**
- apps: 1 (validai)
- app_tiers: 3 (free, pro, enterprise)
- organization_app_subscriptions: [number of organizations]
- app_role_permissions: 4 (owner, admin, member, viewer)
- admin_users: [at least 1]
- All ValidAI tables: [data preserved from before migration]

#### Verify Functions

```sql
-- Test get_user_authorization
SELECT * FROM get_user_authorization(NULL, 'validai');
```

**Expected output:**
```
organization_id | organization_name | user_role | app_id | tier_name | tier_features | role_permissions | ...
----------------|-------------------|-----------|--------|-----------|---------------|------------------|-----
[uuid]          | [org name]        | owner     | validai| free      | {...}         | {...}            | ...
```

#### Verify RLS Policies

```sql
-- Check ValidAI table policies include app access
SELECT
  tablename,
  policyname,
  CASE WHEN policyname LIKE '%app access%' THEN '✓' ELSE '✗' END as has_app_check
FROM pg_policies
WHERE tablename LIKE 'validai_%'
ORDER BY tablename, policyname;
```

**All ValidAI tables should have "app access" in policy names.**

#### Verify Foreign Keys

```sql
-- Check foreign key integrity
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'validai_%'
ORDER BY tc.table_name, kcu.column_name;
```

**All foreign keys should reference correct tables.**

#### Verify Data Integrity

```sql
-- Check all organizations have subscriptions
SELECT
  o.id,
  o.name,
  CASE WHEN oas.id IS NOT NULL THEN '✓' ELSE '✗' END as has_subscription
FROM organizations o
LEFT JOIN organization_app_subscriptions oas
  ON oas.organization_id = o.id AND oas.app_id = 'validai'
ORDER BY o.name;
```

**All organizations should have subscriptions (✓).**

```sql
-- Check all members have valid roles
SELECT DISTINCT role FROM organization_members;
```

**Should only show:** owner, admin, member, viewer

```sql
-- Check all subscriptions have valid tiers
SELECT DISTINCT tier_name FROM organization_app_subscriptions WHERE app_id = 'validai';
```

**Should only show:** free, pro, enterprise

**Deliverable:** Database healthy, all checks pass

---

### Task 3.5: Create Phase 3 Checkpoint (1 hour)

#### Document Test Results

**Create file:** `docs/phase3-verification-report.md`

```markdown
# Phase 3 Verification Report

**Date:** 2025-01-23
**Objective:** Verify all 3 apps run independently before integration

---

## Summary

| App | Status | Tests Passed | Tests Failed | Notes |
|-----|--------|--------------|--------------|-------|
| ValidAI | ✅ Pass | 17/17 | 0 | Fully functional with prefixed tables |
| Admin Portal | ✅ Pass | 10/10 | 0 | All admin functions working |
| TestApp | ✅ Pass | 7/7 | 0 | Authorization demo working |

**Database Health:** ✅ All checks passed

---

## ValidAI Tests (17/17)

### Authentication ✅
- Login works
- Session persists
- Logout works

### Core Functionality ✅
- Dashboard loads
- Processors CRUD working
- Operations CRUD working
- Documents CRUD working
- Runs execute successfully
- Workbench functional
- Organization switching works

### Database Verification ✅
- Uses validai_documents (not documents)
- Uses validai_processors (not processors)
- All 7 ValidAI tables queried correctly
- RLS policies enforcing access

---

## Admin Portal Tests (10/10)

### Admin Access ✅
- Admin login works
- Non-admin denied access
- is_playze_admin() function working

### Admin Functions ✅
- Organizations list (admin_list_organizations)
- Organization detail (admin_get_organization)
- Members list (admin_list_organization_members)
- Subscriptions list (admin_list_all_subscriptions)
- Users list (admin_list_all_users)

---

## TestApp Tests (7/7)

### Authorization Demo ✅
- Dashboard loads
- get_user_authorization('validai') returns data
- Shows tier features correctly
- Shows role permissions correctly
- Organization switcher works
- App switcher shows ValidAI

---

## Database Health Check ✅

### Tables (21/21) ✅
- Platform: 11 tables
- ValidAI: 7 tables
- Shared: 3 tables

### Functions (15+) ✅
- get_user_authorization ✅
- has_app_access ✅
- is_playze_admin ✅
- All admin functions ✅

### Data Integrity ✅
- All orgs have subscriptions ✅
- All subscriptions have valid tiers ✅
- All members have valid roles ✅
- Foreign keys intact ✅

---

## Issues Found

[None / List any issues]

---

## Conclusion

✅ **MILESTONE ACHIEVED**

All 3 apps running independently:
- ValidAI: Functional with prefixed tables
- Admin Portal: Functional with admin operations
- TestApp: Functional with authorization demo

Database: Healthy, all tables and functions operational

**Ready to proceed to Phase 4: Integration**

---

**Sign-off:** [Your Name]
**Date:** 2025-01-23
```

#### Git Commit

```bash
git add .
git commit -m "test: Phase 3 MILESTONE complete - all apps verified

**Verification Results:**
- ValidAI: 17/17 tests passed ✅
- Admin Portal: 10/10 tests passed ✅
- TestApp: 7/7 tests passed ✅
- Database: All health checks passed ✅

**Apps Running Independently:**
- ValidAI uses local lib/supabase (not shared packages yet)
- ValidAI queries validai_* prefixed tables correctly
- Admin Portal manages platform via admin RPC functions
- TestApp demonstrates authorization system

**Database State:**
- 21 tables (11 platform + 7 ValidAI + 3 shared)
- 15+ functions (authorization, helpers, admin)
- All organizations have active ValidAI subscriptions
- RLS policies enforce app access

**Key Achievement:**
All infrastructure in place, apps functional BEFORE integration.
This milestone proves platform foundation is solid.

Next: Phase 4 - Integrate ValidAI with Playze packages"

git tag phase3-milestone-complete
```

**Deliverable:** Phase 3 MILESTONE complete, ready for integration

---

## Phase 4: Integrate ValidAI

**Duration:** 3-5 days (24-40 hours)
**Risk:** 🟡 Medium (many changes, but incremental)
**Objective:** ValidAI adopts Playze Core packages and features

**Strategy:** Incremental adoption, test after each step

### Task 4.1: Adopt Shared Types (4 hours)

#### Update apps/validai/package.json

Add dependency:

```json
{
  "dependencies": {
    "@playze/shared-types": "workspace:*",
    // ... existing dependencies
  }
}
```

Install:

```bash
cd apps/validai
pnpm install
```

#### Update Type Imports

**Find old imports:**

```bash
grep -r "from '@/lib/database.types'" --include="*.ts" --include="*.tsx"
```

**Replace with:**

```typescript
// OLD
import type { Database } from '@/lib/database.types'
type Processor = Database['public']['Tables']['validai_processors']['Row']

// NEW
import type { Database } from '@playze/shared-types'
// OR better, use shortcuts:
import type { Processor } from '@playze/shared-types'
```

**Common replacements:**

```typescript
// Processors
import type { Processor, ProcessorInsert, ProcessorUpdate } from '@playze/shared-types'

// Operations
import type { Operation, OperationInsert } from '@playze/shared-types'

// Runs
import type { Run, RunInsert } from '@playze/shared-types'

// Documents
import type { Document, DocumentInsert } from '@playze/shared-types'
```

#### Update apps/validai/lib/database.types.ts

**WAIT:** Don't delete yet - shared-types has Playze Core schema, not ValidAI schema.

**Action:** Regenerate shared-types from ValidAI database:

```bash
cd /c/Dev/Validai

# Generate types from ValidAI database
npx supabase gen types typescript --project-id xczippkxxdqlvaacjexj > packages/shared-types/src/database.types.ts

# Rebuild shared-types
turbo build --filter=@playze/shared-types
```

**Now ValidAI tables are in shared-types:**
- validai_documents
- validai_processors
- etc.

#### Update Shortcuts

Edit `packages/shared-types/src/shortcuts.ts`:

```typescript
import type { Database } from './database.types'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

// ValidAI types
export type Document = Tables<'validai_documents'>
export type Processor = Tables<'validai_processors'>
export type Operation = Tables<'validai_operations'>
export type Run = Tables<'validai_runs'>
export type OperationResult = Tables<'validai_operation_results'>
export type WorkbenchExecution = Tables<'validai_workbench_executions'>
export type LLMGlobalSetting = Tables<'validai_llm_global_settings'>

// Platform types
export type App = Tables<'apps'>
export type AppTier = Tables<'app_tiers'>
export type OrganizationAppSubscription = Tables<'organization_app_subscriptions'>
export type AppRolePermission = Tables<'app_role_permissions'>

// Shared types
export type Organization = Tables<'organizations'>
export type OrganizationMember = Tables<'organization_members'>
export type Profile = Tables<'profiles'>

// Insert types
export type ProcessorInsert = Database['public']['Tables']['validai_processors']['Insert']
export type OperationInsert = Database['public']['Tables']['validai_operations']['Insert']
export type RunInsert = Database['public']['Tables']['validai_runs']['Insert']
export type DocumentInsert = Database['public']['Tables']['validai_documents']['Insert']

// Update types
export type ProcessorUpdate = Database['public']['Tables']['validai_processors']['Update']
export type OperationUpdate = Database['public']['Tables']['validai_operations']['Update']
export type RunUpdate = Database['public']['Tables']['validai_runs']['Update']
```

Rebuild:

```bash
turbo build --filter=@playze/shared-types
```

#### Test TypeScript Compilation

```bash
cd apps/validai
pnpm typecheck
```

**Should pass with zero errors.**

#### Delete Old File

```bash
rm apps/validai/lib/database.types.ts
```

#### Test App

```bash
turbo dev --filter=@playze/validai
```

**Verify:**
- [ ] App starts
- [ ] No type errors
- [ ] Processors load
- [ ] Can create/edit processors
- [ ] Types resolve correctly

**Deliverable:** ValidAI uses @playze/shared-types

---

### Task 4.2: Adopt Shared Auth (6 hours)

#### Update apps/validai/package.json

```json
{
  "dependencies": {
    "@playze/shared-auth": "workspace:*",
    "@playze/shared-types": "workspace:*",
    // ... existing
  }
}
```

Install:

```bash
pnpm install
```

#### Update Client Imports

**Find old imports:**

```bash
grep -r "from '@/lib/supabase/client'" --include="*.ts" --include="*.tsx" -l
```

**Replace:**

```typescript
// OLD
import { createBrowserClient } from '@/lib/supabase/client'

// NEW
import { createBrowserClient } from '@playze/shared-auth/client'
```

**Files likely affected:**
- app/queries/*.ts (all query files)
- components/*.tsx (components using Supabase)

#### Update Server Imports

**Find:**

```bash
grep -r "from '@/lib/supabase/server'" --include="*.ts" --include="*.tsx" -l
```

**Replace:**

```typescript
// OLD
import { createServerClient } from '@/lib/supabase/server'

// NEW
import { createServerClient } from '@playze/shared-auth/server'
```

**Files likely affected:**
- app/*/page.tsx (server components)
- app/api/*/route.ts (API routes if any)

#### Update Middleware

**Edit apps/validai/middleware.ts:**

```typescript
// OLD
import { updateSession } from '@/lib/supabase/middleware'

// NEW
import { updateSession } from '@playze/shared-auth/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}
```

#### Automated Replacement

**PowerShell (Windows):**

```powershell
cd apps/validai

# Replace client imports
Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object {
  (Get-Content $_) -replace "@/lib/supabase/client", "@playze/shared-auth/client" | Set-Content $_
}

# Replace server imports
Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object {
  (Get-Content $_) -replace "@/lib/supabase/server", "@playze/shared-auth/server" | Set-Content $_
}

# Replace middleware imports
Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object {
  (Get-Content $_) -replace "@/lib/supabase/middleware", "@playze/shared-auth/middleware" | Set-Content $_
}
```

**Bash (Linux/Mac):**

```bash
cd apps/validai

find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s|@/lib/supabase/client|@playze/shared-auth/client|g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s|@/lib/supabase/server|@playze/shared-auth/server|g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s|@/lib/supabase/middleware|@playze/shared-auth/middleware|g" {} +
```

#### Verify No Old Imports Remain

```bash
grep -r "@/lib/supabase" apps/validai --include="*.ts" --include="*.tsx"
# Should return NO results
```

#### Delete Old Files

```bash
rm -rf apps/validai/lib/supabase/
```

#### Test TypeScript

```bash
cd apps/validai
pnpm typecheck
```

#### Test Authentication

**Critical authentication tests:**

1. **Login:**
   ```bash
   turbo dev --filter=@playze/validai
   # Navigate to /auth/login
   # Login with credentials
   # Should redirect to /dashboard
   ```

2. **Session persistence:**
   - Refresh page
   - Should stay logged in

3. **Protected routes:**
   - Try /proc without login
   - Should redirect to /auth/login

4. **Logout:**
   - Click logout
   - Session cleared
   - Redirected to login

5. **Organization context:**
   - User's organization ID in JWT
   - Queries filtered to user's org

**If authentication breaks:**
- Check middleware.ts imports
- Check environment variables (.env.local)
- Check Supabase client initialization
- Check browser console for errors

**Deliverable:** ValidAI uses @playze/shared-auth

---

### Task 4.3: Adopt Shared UI (8 hours)

#### Update apps/validai/package.json

```json
{
  "dependencies": {
    "@playze/shared-ui": "workspace:*",
    "@playze/shared-auth": "workspace:*",
    "@playze/shared-types": "workspace:*",
    // ... existing
  }
}
```

Install:

```bash
pnpm install
```

#### Update UI Component Imports

**Find old imports:**

```bash
grep -r "from '@/components/ui/" apps/validai --include="*.tsx" -l
```

**Example replacements:**

```typescript
// OLD
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// NEW (single import)
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '@playze/shared-ui'
```

#### Automated Replacement (Tricky)

**Manual replacement recommended** - each file may import multiple components.

**Strategy:**

1. List all files importing from components/ui:
   ```bash
   grep -r "from '@/components/ui/" apps/validai --include="*.tsx" -l > /tmp/files-to-update.txt
   ```

2. For each file, replace imports:
   ```typescript
   // Before (multiple imports)
   import { Button } from '@/components/ui/button'
   import { Card } from '@/components/ui/card'
   import { Input } from '@/components/ui/input'

   // After (single import)
   import { Button, Card, Input } from '@playze/shared-ui'
   ```

**PowerShell helper:**

```powershell
# Replace common single imports
Get-ChildItem -Recurse -Include *.tsx | ForEach-Object {
  $content = Get-Content $_ -Raw

  # Replace each UI component import
  $content = $content -replace "import \{ ([^}]+) \} from '@/components/ui/button'", "import { `$1 } from '@playze/shared-ui'"
  $content = $content -replace "import \{ ([^}]+) \} from '@/components/ui/card'", "import { `$1 } from '@playze/shared-ui'"
  $content = $content -replace "import \{ ([^}]+) \} from '@/components/ui/badge'", "import { `$1 } from '@playze/shared-ui'"
  # ... repeat for all UI components

  Set-Content $_ -Value $content
}
```

**Better approach:** Use IDE's "Find and Replace" feature with regex.

#### Consolidate Multiple Imports

**Files with multiple UI imports:**

```typescript
// Before
import { Button } from '@playze/shared-ui'
import { Card, CardHeader } from '@playze/shared-ui'
import { Input } from '@playze/shared-ui'

// After (consolidate)
import { Button, Card, CardHeader, Input } from '@playze/shared-ui'
```

#### Update cn() Utility Imports

```typescript
// OLD
import { cn } from '@/lib/utils'

// NEW
import { cn } from '@playze/shared-ui'
```

#### Verify No Old Imports Remain

```bash
grep -r "@/components/ui/" apps/validai --include="*.tsx"
# Should return NO results
```

#### Delete Old UI Directory

```bash
rm -rf apps/validai/components/ui/
```

**Keep app-specific components:**
- apps/validai/components/processor-form.tsx
- apps/validai/components/operation-card.tsx
- apps/validai/components/run-viewer.tsx
- etc.

#### Test UI Rendering

```bash
turbo dev --filter=@playze/validai
```

**Visual tests:**
- [ ] Dashboard renders correctly
- [ ] Buttons styled correctly
- [ ] Cards display properly
- [ ] Forms work (inputs, selects, etc.)
- [ ] Colors match theme
- [ ] No missing components

**If styling breaks:**
- Check Tailwind config
- Verify shared-ui built correctly
- Check global.css imports
- Inspect elements for class names

**Deliverable:** ValidAI uses @playze/shared-ui

---

### Task 4.4: Add AppSwitcher and OrgSwitcher (4 hours)

#### Update Layout Component

**Edit apps/validai/app/layout.tsx:**

```typescript
import { AppSwitcher, OrgSwitcher } from '@playze/shared-ui'

export default async function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="border-b">
              <div className="container flex h-16 items-center gap-4">
                <Logo />

                {/* Organization Switcher */}
                <OrgSwitcher />

                {/* App Switcher */}
                <AppSwitcher />

                <div className="ml-auto flex items-center gap-4">
                  <ThemeSwitcher />
                  <UserMenu />
                </div>
              </div>
            </header>

            <main className="flex-1">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
```

#### Test Organization Switching

**Start app:**

```bash
turbo dev --filter=@playze/validai
```

**Test OrgSwitcher:**
- [ ] Shows current organization name
- [ ] Shows current user's role
- [ ] If user has multiple orgs, dropdown shows all orgs
- [ ] Can switch to another organization
- [ ] Calls switch-organization Edge Function
- [ ] Page refreshes with new org context
- [ ] Data filtered to new organization
- [ ] ProcessORS list updates to new org's processors

**Test AppSwitcher:**
- [ ] Shows "ValidAI" app (since user has subscription)
- [ ] If user's org has other apps, they show in dropdown
- [ ] Click "ValidAI" - stays on current app
- [ ] (In future, clicking other apps navigates to them)

**Deliverable:** Platform navigation components added

---

### Task 4.5: Implement Authorization with AuthGate (12 hours)

**CRITICAL:** This implements tier-based and role-based access control.

#### Add Feature Gating (Export Reports)

**Create component:** `apps/validai/components/export-button.tsx`

```typescript
'use client'

import { AuthGate } from '@playze/shared-ui'
import { Button } from '@playze/shared-ui'
import { Download } from 'lucide-react'

interface ExportButtonProps {
  onExport: () => void
}

export function ExportButton({ onExport }: ExportButtonProps) {
  return (
    <AuthGate
      appId="validai"
      feature="export_reports"
      permission="can_export"
      requireAll={true}
    >
      <Button onClick={onExport}>
        <Download className="w-4 h-4 mr-2" />
        Export Report
      </Button>
    </AuthGate>
  )
}
```

**Use in run detail page:**

```typescript
// apps/validai/app/runs/[id]/page.tsx
import { ExportButton } from '@/components/export-button'

export default function RunDetailPage({ params }) {
  const handleExport = () => {
    // Export logic
  }

  return (
    <div>
      <RunViewer runId={params.id} />

      {/* Only shows for Pro/Enterprise tier + users with can_export permission */}
      <ExportButton onExport={handleExport} />
    </div>
  )
}
```

#### Add Custom Model Selection Gating

**Edit model selector:**

```typescript
// apps/validai/components/model-selector.tsx
import { AuthGate } from '@playze/shared-ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@playze/shared-ui'

export function ModelSelector({ value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {/* Default models (all tiers) */}
        <SelectItem value="claude-3-5-sonnet-20241022">
          Claude 3.5 Sonnet
        </SelectItem>

        {/* Custom models (Enterprise only) */}
        <AuthGate appId="validai" feature="custom_models">
          <SelectItem value="gpt-4">GPT-4</SelectItem>
          <SelectItem value="claude-opus-20240229">Claude Opus</SelectItem>
          <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
        </AuthGate>
      </SelectContent>
    </Select>
  )
}
```

#### Add Processor Limit Enforcement

**Edit processors page:**

```typescript
// apps/validai/app/proc/page.tsx
import { useAuthorization } from '@playze/shared-auth'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@playze/shared-ui'

export default function ProcessorsPage() {
  const { data: auth } = useAuthorization('validai')
  const { data: processors } = useProcessors()

  const processorCount = processors?.length ?? 0
  const processorLimit = auth?.tier_limits?.processors ?? 5
  const canCreateMore = processorCount < processorLimit

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1>Processors</h1>

        {canCreateMore ? (
          <Button onClick={handleCreate}>
            Create Processor
          </Button>
        ) : (
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-2">
              You've reached the limit of {processorLimit} processors on the {auth?.tier_display_name} plan.
            </p>
            <Button variant="outline" onClick={() => window.open('mailto:sales@validai.com?subject=Upgrade%20Request')}>
              Upgrade to Pro
            </Button>
          </div>
        )}
      </div>

      <div className="mb-4">
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span>Processors</span>
              <span className={processorCount >= processorLimit ? 'text-destructive' : ''}>
                {processorCount} / {processorLimit}
              </span>
            </div>
            <Progress value={(processorCount / processorLimit) * 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <ProcessorList processors={processors} />
    </div>
  )
}
```

#### Add Permission-Based Edit Controls

**Edit processor detail page:**

```typescript
// apps/validai/app/proc/[id]/page.tsx
import { AuthGate } from '@playze/shared-ui'
import { usePermission } from '@playze/shared-auth'

export default function ProcessorDetailPage({ params }) {
  const { data: canEdit } = usePermission('validai', 'can_edit')
  const { data: canDelete } = usePermission('validai', 'can_delete')

  return (
    <div>
      <ProcessorViewer processorId={params.id} />

      {/* Edit button (member/admin/owner only) */}
      <AuthGate appId="validai" permission="can_edit">
        <Button onClick={handleEdit}>Edit Processor</Button>
      </AuthGate>

      {/* Delete button (admin/owner only) */}
      <AuthGate appId="validai" permission="can_delete">
        <Button variant="destructive" onClick={handleDelete}>
          Delete Processor
        </Button>
      </AuthGate>

      {/* Show read-only message for viewers */}
      {!canEdit && (
        <p className="text-sm text-muted-foreground mt-4">
          You have view-only access to this processor.
        </p>
      )}
    </div>
  )
}
```

#### Add Run Limit Tracking (Optional)

**Edit run creation:**

```typescript
// apps/validai/app/queries/runs.ts
import { createBrowserClient } from '@playze/shared-auth/client'

export async function createRun(processorId: string, documentId: string, orgId: string) {
  const supabase = createBrowserClient()

  // Create run
  const { data: run, error } = await supabase
    .from('validai_runs')
    .insert({
      processor_id: processorId,
      document_id: documentId,
      organization_id: orgId,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error

  // Track usage
  await supabase.rpc('increment_app_usage', {
    org_id: orgId,
    app_id: 'validai',
    usage_type: 'runs',
    increment_by: 1
  })

  return run
}
```

**Display usage on dashboard:**

```typescript
// apps/validai/app/dashboard/page.tsx
import { useAuthorization, useOrganizationApps } from '@playze/shared-auth'

export default function Dashboard() {
  const { data: auth } = useAuthorization('validai')
  const { data: apps } = useOrganizationApps()

  const validaiApp = apps?.find(a => a.app_id === 'validai')
  const runsUsed = validaiApp?.current_usage?.runs ?? 0
  const runsLimit = auth?.tier_limits?.runs_per_month ?? 100

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Monthly Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span>Runs</span>
                <span>{runsUsed} / {runsLimit}</span>
              </div>
              <Progress value={(runsUsed / runsLimit) * 100} />
            </div>

            {runsUsed >= runsLimit * 0.9 && (
              <p className="text-sm text-destructive">
                You've used {Math.round((runsUsed / runsLimit) * 100)}% of your monthly run limit.
                Consider upgrading to Pro for {auth?.tier_limits?.runs_per_month === 100 ? '10,000' : 'unlimited'} runs per month.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

#### Test Authorization

**Test Free Tier:**
- [ ] Create test org with Free tier
- [ ] Login as member of Free tier org
- [ ] Can view processors ✅
- [ ] Can create up to 5 processors ✅
- [ ] Blocked from creating 6th processor ✅
- [ ] Export button shows upgrade prompt ✅
- [ ] Custom models hidden in selector ✅
- [ ] Can run up to 100 runs/month ✅

**Test Pro Tier:**
- [ ] Create test org with Pro tier (or upgrade Free org)
- [ ] Login as member
- [ ] Can create up to 50 processors ✅
- [ ] Export button works ✅
- [ ] Can export reports ✅
- [ ] Custom models still hidden (Enterprise only) ✅
- [ ] Can run up to 10,000 runs/month ✅

**Test Enterprise Tier:**
- [ ] Upgrade org to Enterprise tier
- [ ] Can create 999+ processors ✅
- [ ] Export works ✅
- [ ] Custom models available ✅
- [ ] Can select GPT-4, Claude Opus ✅
- [ ] Unlimited runs ✅

**Test Roles:**
- [ ] Login as viewer → cannot edit ✅
- [ ] Login as member → can edit, cannot delete ✅
- [ ] Login as admin → can edit and delete ✅
- [ ] Login as owner → full access ✅

**Deliverable:** Authorization fully implemented

---

### Task 4.6: Final Integration Testing (4 hours)

#### Complete User Journey Tests

**Journey 1: New Free User**
1. [ ] Admin creates organization (Free tier)
2. [ ] Admin invites user
3. [ ] User accepts invitation
4. [ ] User logs in to ValidAI
5. [ ] Dashboard shows Free tier
6. [ ] Creates processor (1/5)
7. [ ] Adds operations
8. [ ] Uploads document
9. [ ] Runs processor
10. [ ] Sees results
11. [ ] Tries to export → blocked, sees upgrade prompt
12. [ ] Tries to create 6th processor → blocked

**Journey 2: Pro User Upgrade**
1. [ ] Admin upgrades org to Pro
2. [ ] User refreshes page
3. [ ] Dashboard shows Pro tier
4. [ ] Can now export reports
5. [ ] Can create up to 50 processors
6. [ ] Export button works
7. [ ] Downloads report successfully

**Journey 3: Multi-Org User**
1. [ ] User belongs to 2 orgs (Free + Pro)
2. [ ] Logs in, sees Org A (Free)
3. [ ] Clicks org switcher
4. [ ] Switches to Org B (Pro)
5. [ ] Data filters to Org B
6. [ ] Sees Pro tier features
7. [ ] Switches back to Org A
8. [ ] Sees Free tier again
9. [ ] No data leakage between orgs

**Journey 4: Role Changes**
1. [ ] User starts as viewer
2. [ ] Can see processors, cannot edit
3. [ ] Admin changes role to member
4. [ ] User refreshes
5. [ ] Can now edit processors
6. [ ] Cannot delete (still need admin/owner)
7. [ ] Admin promotes to admin
8. [ ] Can now delete processors

#### Cross-App Navigation

**Test AppSwitcher:**
1. [ ] User in ValidAI
2. [ ] Clicks AppSwitcher
3. [ ] Sees "ValidAI" (current app)
4. [ ] Sees other apps if org has subscriptions
5. [ ] Clicking ValidAI stays on same app
6. [ ] (Future: clicking TestApp navigates to TestApp)

#### Performance Verification

**Measure authorization overhead:**

```typescript
// Add timing to authorization hook call
console.time('authorization')
const { data: auth } = useAuthorization('validai')
console.timeEnd('authorization')
```

**Expected:**
- First call: ~200-500ms (database query)
- Subsequent calls: <5ms (cached)

**Authorization query count:**
- Should be **1 query** per page load (get_user_authorization)
- NOT 3+ queries (tier check + role check + features check)

#### Error Handling

**Test edge cases:**
- [ ] Inactive subscription → denied access
- [ ] Expired subscription → denied access
- [ ] Removed from organization → denied access
- [ ] Invalid app_id → error message
- [ ] Network error → graceful fallback

#### Documentation

**Update README:**

```markdown
# ValidAI

Document processing and validation platform powered by AI.

Built on **Playze Core** framework.

## Features

### Free Tier
- 5 processors
- 100 runs per month
- 10 documents
- Basic processing

### Professional Tier ($49/month)
- 50 processors
- 10,000 runs per month
- 1,000 documents
- Export reports
- Advanced operations
- Priority support

### Enterprise Tier ($499/month)
- Unlimited processors
- Unlimited runs
- Unlimited documents
- Custom AI models
- API access
- Dedicated support

## Getting Started

1. Contact sales to create your organization
2. Accept invitation email
3. Log in to ValidAI
4. Create your first processor
5. Upload documents and start processing

## Authorization

ValidAI uses **role-based + tier-based authorization**:

**Roles:**
- Viewer: Read-only access
- Member: Can create and edit
- Admin: Can manage and delete
- Owner: Full control including billing

**Tiers:**
- Free: Basic features, limited usage
- Pro: Advanced features, higher limits
- Enterprise: All features, unlimited usage

## Support

- Email: support@validai.com
- Upgrades: sales@validai.com
```

**Deliverable:** ValidAI fully integrated with Playze Core

---

### Task 4.7: Create Phase 4 Completion Checkpoint (1 hour)

```bash
git add .
git commit -m "feat: Phase 4 complete - ValidAI fully integrated with Playze Core

**Shared Packages Adopted:**
- @playze/shared-types: All type imports migrated ✅
- @playze/shared-auth: Authentication fully migrated ✅
- @playze/shared-ui: All UI components migrated ✅

**Platform Features Implemented:**
- AppSwitcher: Shows ValidAI and other subscribed apps ✅
- OrgSwitcher: Multi-org support with seamless switching ✅
- AuthGate: Tier + role-based access control ✅

**Authorization Implemented:**
- Export feature: Pro tier + can_export permission ✅
- Custom models: Enterprise tier only ✅
- Processor limits: 5/50/999 per tier ✅
- Run limits: 100/10k/unlimited per tier ✅
- Permission checks: viewer/member/admin/owner ✅

**Testing Complete:**
- Free tier: Limits enforced, upgrade prompts shown ✅
- Pro tier: Export working, higher limits ✅
- Enterprise tier: Custom models, unlimited usage ✅
- Role-based: Viewer/member/admin/owner permissions working ✅
- Multi-org: Data isolation verified ✅
- Performance: 1-query authorization system working ✅

**Code Quality:**
- TypeScript: Zero errors ✅
- Linting: Passing ✅
- Build: Successful ✅
- All core journeys tested ✅

**Migration Complete:**
ValidAI is now the first application on Playze Core framework.
All platform infrastructure operational.
Ready for production deployment.

Duration: 7 days (actual) vs 15 days (original plan) = 53% faster
Risk: Lower (proven code vs custom implementation)
Quality: Higher (battle-tested Playze Core packages)

Next: Production deployment and user onboarding"

git tag migration-complete
```

**Deliverable:** ValidAI migration complete

---

## Success Criteria

### Phase 1: Structure Alignment ✅
- [x] ValidAI moved to apps/validai
- [x] ValidAI tables renamed with validai_ prefix
- [x] Monorepo root initialized
- [x] ValidAI functional with prefixed tables

### Phase 2: Import Playze Core ✅
- [x] 4 shared packages copied and building
- [x] admin-portal and testapp copied
- [x] Edge Functions deployed
- [x] Platform tables created (11 tables)
- [x] organizations schema merged (Playze + ValidAI columns)
- [x] ValidAI registered as app
- [x] 3 tiers created (free/pro/enterprise)
- [x] 4 role permissions created
- [x] All orgs have active subscriptions
- [x] RLS policies updated with app access checks

### Phase 3: MILESTONE Verification ✅
- [x] ValidAI runs independently (17/17 tests passed)
- [x] Admin portal runs (10/10 tests passed)
- [x] TestApp runs (7/7 tests passed)
- [x] Database healthy (21 tables, 15+ functions)
- [x] No data loss
- [x] All apps functional

### Phase 4: Integration ✅
- [x] ValidAI uses @playze/shared-types
- [x] ValidAI uses @playze/shared-auth
- [x] ValidAI uses @playze/shared-ui
- [x] AppSwitcher and OrgSwitcher added
- [x] Authorization implemented (AuthGate)
- [x] Tier restrictions enforced (Free/Pro/Enterprise)
- [x] Role permissions enforced (viewer/member/admin/owner)
- [x] Usage tracking working (runs per month)
- [x] Complete user journeys tested
- [x] Performance verified (1-query authorization)

---

## Risk Assessment

### Overall Risk: 🟡 Medium

**Risk Breakdown by Phase:**

| Phase | Risk | Mitigation | Actual Risk |
|-------|------|------------|-------------|
| Phase 1 | 🟡 Medium | Table rename tested, backup first | 🟢 Low (reversible) |
| Phase 2 | 🟡 Medium | Copy proven code, schema merge tested | 🟡 Medium (database changes) |
| Phase 3 | 🟢 Low | Just verification, no changes | 🟢 Low (no changes) |
| Phase 4 | 🟡 Medium | Incremental, test after each step | 🟡 Medium (many changes) |

**Critical Risks Mitigated:**
- ✅ Data loss: Backups + verification
- ✅ Schema conflicts: Merge strategy tested
- ✅ Auth breaks: Test after each change
- ✅ Performance regression: Benchmark before/after
- ✅ Integration failures: Milestone checkpoint in Phase 3

---

## Timeline & Comparison

### Actual Timeline

| Phase | Planned | Actual | Status |
|-------|---------|--------|--------|
| Phase 1 | 1 day (8h) | TBD | Pending |
| Phase 2 | 2-3 days (16-24h) | TBD | Pending |
| Phase 3 | 1 day (8h) | TBD | Pending |
| Phase 4 | 3-5 days (24-40h) | TBD | Pending |
| **Total** | **7-10 days** | **TBD** | **In Progress** |

### Comparison: This Plan vs Original Plan

| Aspect | Original Plan | This Plan | Improvement |
|--------|---------------|-----------|-------------|
| **Duration** | 15 days | 7-10 days | ⬇️ 47% faster |
| **Code Reuse** | Create custom packages | Import Playze Core | ⬆️ 90% reuse |
| **Risk** | High (new code) | Medium (proven code) | ⬇️ Lower risk |
| **Testing** | No checkpoint | Phase 3 milestone | ⬆️ Early verification |
| **Database Changes** | Optional table rename | Required prefix | ⚠️ Trade-off |
| **Integration** | Big-bang | Incremental | ⬆️ Controlled |
| **Quality** | Unknown (new code) | High (battle-tested) | ⬆️ Better quality |

---

## Appendix

### A. Environment Variables

**Root .env.local:**

```bash
# Supabase (ValidAI project)
NEXT_PUBLIC_SUPABASE_URL=https://xczippkxxdqlvaacjexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Optional: Playze Core access (for reference)
# PLAYZE_CORE_SUPABASE_URL=https://cgaajzhddfuxzsugjqkk.supabase.co
```

**Copy to all apps:**
```bash
cp .env.local apps/validai/.env.local
cp .env.local apps/admin-portal/.env.local
cp .env.local apps/testapp/.env.local
```

### B. Useful Commands

**Monorepo management:**
```bash
pnpm install              # Install all dependencies
turbo build               # Build all packages/apps
turbo dev                 # Start all dev servers
turbo lint                # Lint all packages/apps
turbo typecheck           # Type check all packages/apps
turbo clean               # Clean all build outputs
```

**Specific app commands:**
```bash
turbo dev --filter=@playze/validai        # Dev ValidAI only
turbo dev --filter=@playze/admin-portal   # Dev admin portal only
turbo build --filter=@playze/validai      # Build ValidAI only
```

**Database commands:**
```bash
npx supabase db push                      # Apply migrations
npx supabase db reset                     # Reset database (dev only!)
npx supabase gen types typescript         # Generate types
npx supabase functions deploy <name>      # Deploy Edge Function
```

**Shared package rebuild:**
```bash
turbo build --filter=@playze/shared-*     # Build all shared packages
turbo build --filter=@playze/shared-types # Build specific package
```

### C. Migration Rollback Plan

**If Phase 1 fails (table rename):**
```sql
-- Rollback: Rename tables back
ALTER TABLE validai_documents RENAME TO documents;
ALTER TABLE validai_processors RENAME TO processors;
-- ... etc for all tables
```

**If Phase 2 fails (Playze Core import):**
```bash
# Revert commits
git reset --hard phase1-complete

# Rollback database
npx supabase db reset
# Re-apply only Phase 1 migration
```

**If Phase 3 milestone fails:**
- Fix identified issues
- Re-run verification
- DO NOT proceed to Phase 4 until all tests pass

**If Phase 4 integration fails:**
```bash
# Revert code changes
git reset --hard phase3-milestone-complete

# Database unchanged (no rollback needed)
# ValidAI still functional from Phase 3
```

### D. Troubleshooting

**Issue: Table not found after rename**
```sql
-- Verify table exists
SELECT tablename FROM pg_tables WHERE tablename LIKE 'validai_%';

-- Check if migration applied
SELECT * FROM supabase_migrations.schema_migrations;
```

**Issue: Import errors after package adoption**
```bash
# Rebuild shared packages
turbo build --filter=@playze/shared-*

# Clear Next.js cache
rm -rf apps/validai/.next
```

**Issue: Authorization not working**
```sql
-- Test authorization function
SELECT * FROM get_user_authorization(NULL, 'validai');

-- Should return data, not error
```

**Issue: RLS blocking legitimate access**
```sql
-- Test app access check
SELECT public.has_app_access('validai');

-- Should return true for active subscription
```

### E. Next Steps After Migration

**Immediate (Week 1):**
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] User onboarding
- [ ] Documentation updates

**Short-term (Month 1):**
- [ ] Collect user feedback
- [ ] Performance optimization
- [ ] Feature requests
- [ ] Bug fixes

**Long-term (Months 2-3):**
- [ ] Consider adding second app (if desired)
- [ ] Implement billing integration (if needed)
- [ ] Advanced analytics
- [ ] API access for Enterprise tier

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-23 | Initial updated migration plan created |

---

**This migration plan supersedes:** `phase1-migration-plan.md`

**Approved by:** [Your Name]
**Status:** Ready for Implementation
**Next Action:** Begin Phase 1 - Structure Alignment & Table Rename

---

**End of Updated Migration Plan**
