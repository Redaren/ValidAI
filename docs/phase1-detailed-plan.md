# Phase 1 Detailed Implementation Plan
# ValidAI Migration to Playze Core Framework

**Document Version:** 1.0
**Created:** 2025-01-23
**Phase Duration:** 1 day (8 hours)
**Risk Level:** 🟡 Medium (database changes)
**Parent Document:** [updated-migration-plan.md](./updated-migration-plan.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Task 1.1: Initialize Monorepo Structure](#task-11-initialize-monorepo-structure)
4. [Task 1.2: Move ValidAI to apps/](#task-12-move-validai-to-apps)
5. [Task 1.3: Rename ValidAI Tables](#task-13-rename-validai-tables)
6. [Verification & Testing](#verification--testing)
7. [Rollback Procedures](#rollback-procedures)
8. [Success Criteria](#success-criteria)

---

## Overview

### Objective

Transform ValidAI from a standalone Next.js application into the first app in a Playze Core-powered monorepo, preparing it for integration with the Playze Core framework.

### What Phase 1 Accomplishes

✅ **Monorepo Foundation:** Initialize pnpm workspace + Turborepo
✅ **Directory Structure:** Move ValidAI to `apps/validai`
✅ **Shared Supabase:** Move Supabase project to root level
✅ **Table Prefixing:** Rename all ValidAI tables with `validai_` prefix
✅ **Code Updates:** Update all `.from()` calls to use new table names
✅ **Verification:** Ensure ValidAI fully functional after changes

### What Phase 1 Does NOT Do

❌ Import Playze Core packages (Phase 2)
❌ Apply platform migrations (Phase 2)
❌ Integrate with @playze/shared-* (Phase 4)
❌ Add authorization features (Phase 4)

### Why This Matters

Phase 1 creates a **clean foundation** without platform dependencies. After Phase 1:

- ValidAI runs independently in monorepo structure
- Tables have `validai_` prefix (no conflicts with platform tables)
- Ready to import Playze Core packages without namespace collisions
- Clear rollback point if issues arise

---

## Prerequisites

### Required Access

- [ ] ValidAI Supabase project (ref: `xczippkxxdqlvaacjexj`)
- [ ] Database admin access (can apply migrations)
- [ ] Git repository access (can commit changes)
- [ ] Local development environment (Node.js 22+)

### Required Tools

- [ ] Node.js v22.0.0+ installed
- [ ] Git installed
- [ ] npm installed (will install pnpm in Task 1.1)
- [ ] VS Code or similar editor
- [ ] Access to Supabase dashboard

### Required Knowledge

- [ ] Understanding of ValidAI codebase structure
- [ ] Familiarity with SQL migrations
- [ ] Understanding of monorepo concepts (basic)
- [ ] Git workflow knowledge

### Pre-Migration Checks

**Run these commands BEFORE starting:**

```bash
# Verify current directory
cd /c/Dev/Validai
pwd  # Should show: /c/Dev/Validai

# Check git status (should be clean)
git status

# Verify ValidAI runs currently
cd validai-app
npm run dev
# Test: Can you log in? Does dashboard load? Can you view processors?
# Stop dev server: Ctrl+C

# Return to root
cd ..
```

**If any checks fail, STOP and resolve before proceeding.**

---

## Task 1.1: Initialize Monorepo Structure

**Duration:** 2 hours
**Risk:** 🟢 Low (no database changes)
**Dependencies:** None

### Step 1.1.1: Install pnpm

```bash
# Install pnpm globally
npm install -g pnpm@9.15.0

# Verify installation
pnpm --version
# Expected output: 9.15.0
```

**Why pnpm?**
- Faster than npm (3x faster installs)
- Better for monorepos (shared dependencies)
- Industry standard for monorepos (Turborepo, Nx recommend it)
- Playze Core uses pnpm

### Step 1.1.2: Create Root package.json

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

**Key points:**
- `private: true` - This package not published to npm
- `packageManager` - Enforces pnpm version
- `scripts` - All use Turborepo for parallel execution
- `devDependencies` - Only root-level dev tools

### Step 1.1.3: Create Workspace Configuration

Create `/pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**What this does:**
- Tells pnpm where to find workspace packages
- `apps/*` - All applications (validai, admin-portal, testapp)
- `packages/*` - All shared packages (shared-ui, shared-auth, etc.)

### Step 1.1.4: Create Turborepo Configuration

Create `/turbo.json`:

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

**What this does:**
- `build` - Builds packages in dependency order (shared packages first)
- `dev` - Runs development servers (not cached)
- `lint`, `typecheck`, `test` - Run checks across all packages
- `cache: false` for dev - Always run fresh (no stale servers)

### Step 1.1.5: Create Root TypeScript Configuration

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

**Key settings:**
- `strict: true` - All TypeScript strict checks enabled
- `moduleResolution: "bundler"` - For Next.js 15
- `jsx: "preserve"` - Let Next.js handle JSX transformation

### Step 1.1.6: Create Directory Structure

```bash
# Create directories
mkdir apps packages

# Verify structure
ls -la
# Should see:
# - apps/
# - packages/
# - validai-app/ (will move in next task)
# - package.json
# - pnpm-workspace.yaml
# - turbo.json
# - tsconfig.json
```

### Step 1.1.7: Install Root Dependencies

```bash
pnpm install
```

**Expected output:**
```
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +5
+++++
Done in 2.1s
```

**Verify installation:**
```bash
# Check turbo installed
npx turbo --version
# Expected: 2.3.3 or higher

# Check node_modules created
ls node_modules/turbo
```

### Deliverable 1.1

✅ **Monorepo root structure initialized**
- [ ] pnpm@9.15.0 installed and verified
- [ ] Root package.json created
- [ ] pnpm-workspace.yaml configured
- [ ] turbo.json configured
- [ ] Root tsconfig.json created
- [ ] apps/ and packages/ directories created
- [ ] Root dependencies installed

**Checkpoint commit:**
```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.json pnpm-lock.yaml apps/ packages/
git commit -m "chore: initialize monorepo structure (Task 1.1)

- Add root package.json with Turborepo scripts
- Configure pnpm workspace
- Add Turborepo configuration
- Create root TypeScript config
- Install pnpm@9.15.0 and turbo

Phase 1, Task 1.1 complete"
```

---

## Task 1.2: Move ValidAI to apps/

**Duration:** 1 hour
**Risk:** 🟢 Low (file moves, reversible)
**Dependencies:** Task 1.1

### Step 1.2.1: Move ValidAI Application

```bash
# From repository root
cd /c/Dev/Validai

# Move validai-app to apps/validai
mv validai-app apps/validai

# Verify move
ls apps/validai
# Should see: app/ components/ lib/ stores/ package.json etc.
```

**What moved:**
- All source code (`app/`, `components/`, `lib/`, `stores/`)
- Configuration files (`next.config.ts`, `tsconfig.json`, `tailwind.config.ts`)
- Dependencies (`package.json`, `package-lock.json`)
- Tests (`__tests__/`, `e2e/`)
- Documentation (`docs/`)

### Step 1.2.2: Move Supabase to Root

```bash
# Move Supabase project directory
mv apps/validai/supabase ./supabase

# Verify structure
ls supabase
# Should see: config.toml functions/ migrations/

ls supabase/migrations
# Should see ValidAI migration files
```

**Why move Supabase to root?**
- Supabase project is **shared** across all apps
- Platform tables (organizations, apps) serve ALL applications
- ValidAI tables (validai_*) are in the SAME database
- Edge Functions accessible to all apps

### Step 1.2.3: Update ValidAI package.json

Edit `apps/validai/package.json`:

**Change `name` field:**
```json
{
  "name": "@playze/validai",  // Changed from "validai-app"
  "version": "0.0.0",
  "private": true,
  // ... rest unchanged for now
}
```

**Why `@playze/validai`?**
- Matches workspace naming convention
- Consistent with `@playze/shared-ui`, `@playze/admin-portal`, etc.
- Makes imports clear: `import {} from '@playze/validai'`

### Step 1.2.4: Update ValidAI tsconfig.json

Edit `apps/validai/tsconfig.json`:

**Add `extends` at the top:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "dom", "dom.iterable"],
    "jsx": "preserve",
    "moduleResolution": "bundler",
    // ... existing compilerOptions
  }
}
```

**What this does:**
- Inherits strict mode and base settings from root
- Ensures consistency across all packages
- Reduces duplication

### Step 1.2.5: Update Import Paths (if needed)

**Check for absolute imports to Supabase:**

```bash
cd apps/validai
grep -r "supabase/" --include="*.ts" --include="*.tsx" | grep import
```

**If you see imports like:**
```typescript
import { createClient } from '../../supabase/...'
```

**Change to:**
```typescript
import { createClient } from '@/lib/supabase/...'
```

**Most likely OK:** ValidAI uses `@/lib/supabase/` path aliases (already correct)

### Step 1.2.6: Install Dependencies in Monorepo

```bash
# From root
cd /c/Dev/Validai

# Install all workspace dependencies
pnpm install
```

**What happens:**
- pnpm reads `apps/validai/package.json`
- Installs ValidAI dependencies
- Links workspace packages (when we add them in Phase 2)
- Creates `node_modules` in root and `apps/validai/`

**Expected output:**
```
Scope: all 1 workspace projects
Progress: resolved 500, reused 450, downloaded 50, added 500
Done in 15s
```

### Step 1.2.7: Test ValidAI Runs

```bash
# From root, using Turborepo
turbo dev --filter=@playze/validai

# Alternative: Direct run
cd apps/validai
pnpm dev
```

**Expected output:**
```
@playze/validai:dev: $ next dev
@playze/validai:dev: ▲ Next.js 15.0.3
@playze/validai:dev: - Local:        http://localhost:3000
```

**Critical tests:**
1. Navigate to `http://localhost:3000`
2. Can you access the login page?
3. Can you log in?
4. Does dashboard load?

**If tests pass:** ValidAI working in new location ✅
**If tests fail:** Check console errors, verify paths

**Stop dev server:** Ctrl+C

### Deliverable 1.2

✅ **ValidAI moved to monorepo structure**
- [ ] validai-app → apps/validai
- [ ] supabase → root level
- [ ] package.json updated to `@playze/validai`
- [ ] tsconfig.json extends root config
- [ ] Dependencies installed via pnpm
- [ ] ValidAI runs via `turbo dev --filter=@playze/validai`

**Checkpoint commit:**
```bash
git add apps/validai supabase
git rm -r validai-app
git commit -m "refactor: move ValidAI to monorepo structure (Task 1.2)

- Move validai-app → apps/validai
- Move supabase → root level (shared across apps)
- Update package.json name to @playze/validai
- Extend root tsconfig.json
- Install dependencies via pnpm workspace

Verified: ValidAI runs in new location

Phase 1, Task 1.2 complete"
```

---

## Task 1.3: Rename ValidAI Tables

**Duration:** 5 hours
**Risk:** 🟡 Medium (database schema changes)
**Dependencies:** Task 1.2

### Step 1.3.1: Pre-Migration Backup

**Critical: BACKUP BEFORE PROCEEDING**

#### Option 1: Supabase Dashboard Backup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/xczippkxxdqlvaacjexj)
2. Navigate to **Database → Backups**
3. Click **"Create backup"**
4. Name: `pre-table-rename-2025-01-23`
5. Wait for backup to complete (status: "Completed")

#### Option 2: CLI Backup

```bash
cd /c/Dev/Validai

# Dump entire database
npx supabase db dump -f backup-before-rename.sql

# Verify backup created
ls -lh backup-before-rename.sql
# Should be several MB
```

**VERIFY BACKUP EXISTS BEFORE PROCEEDING**

### Step 1.3.2: Document Current State

**Record table counts (for comparison after migration):**

```sql
-- Run in Supabase SQL Editor
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

**Save results to file:** `pre-migration-counts.txt`

Example:
```
table_name              | row_count
-----------------------|----------
documents              | 15
processors             | 8
operations             | 42
runs                   | 23
operation_results      | 161
workbench_executions   | 7
llm_global_settings    | 1
```

### Step 1.3.3: Create Migration File

**File:** `supabase/migrations/20250123000000_rename_validai_tables.sql`

```sql
-- =============================================================================
-- VALIDAI TABLE RENAME MIGRATION
-- =============================================================================
-- Description: Rename all ValidAI domain tables with validai_ prefix
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Medium (table renames, code changes required)
-- Rollback: Rename tables back to original names
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RENAME TABLES
-- -----------------------------------------------------------------------------

-- Core ValidAI domain tables
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
-- NOTES ON AUTOMATIC UPDATES
-- -----------------------------------------------------------------------------
-- PostgreSQL automatically updates:
-- - Foreign key constraints (table references)
-- - Indexes (table references)
-- - RLS policies (table references in USING/WITH CHECK clauses)
-- - Views (table references)
-- - Functions (if they use dynamic SQL, will fail - must update manually)
--
-- PostgreSQL does NOT update:
-- - Application code (.from('documents') calls)
-- - Hardcoded table names in functions (rare)
-- -----------------------------------------------------------------------------
```

### Step 1.3.4: Apply Migration

```bash
cd /c/Dev/Validai

# Apply migration to remote database
npx supabase db push
```

**Expected output:**
```
Applying migration 20250123000000_rename_validai_tables...
NOTICE:  All tables renamed successfully!
Migration 20250123000000_rename_validai_tables.sql applied.
```

**If you see errors:**
- Check error message carefully
- Verify backup exists
- DO NOT PROCEED until error resolved
- See [Rollback Procedures](#rollback-procedures)

### Step 1.3.5: Verify Migration Success

**Run verification queries:**

```sql
-- 1. Verify all tables renamed
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'validai_%'
ORDER BY tablename;

-- Expected results:
-- validai_documents
-- validai_llm_global_settings
-- validai_operation_results
-- validai_operations
-- validai_processors
-- validai_runs
-- validai_workbench_executions

-- 2. Verify row counts unchanged
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

-- 3. Compare with pre-migration counts (should be IDENTICAL)

-- 4. Verify old tables don't exist
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('documents', 'processors', 'operations', 'runs', 'operation_results', 'workbench_executions', 'llm_global_settings');

-- Should return 0 rows
```

**All checks MUST pass before proceeding.**

### Step 1.3.6: Update Application Code

**Strategy:** Find and replace all `.from('table_name')` calls

#### Automated Replacement (Windows PowerShell)

```powershell
# Navigate to ValidAI app
cd C:\Dev\Validai\apps\validai

# Replace table names in all TypeScript/TSX files
Get-ChildItem -Recurse -Include *.ts,*.tsx |
ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace "\.from\('documents'\)", ".from('validai_documents')"
    $content = $content -replace "\.from\('processors'\)", ".from('validai_processors')"
    $content = $content -replace "\.from\('operations'\)", ".from('validai_operations')"
    $content = $content -replace "\.from\('runs'\)", ".from('validai_runs')"
    $content = $content -replace "\.from\('operation_results'\)", ".from('validai_operation_results')"
    $content = $content -replace "\.from\('workbench_executions'\)", ".from('validai_workbench_executions')"
    $content = $content -replace "\.from\('llm_global_settings'\)", ".from('validai_llm_global_settings')"
    $content | Set-Content $_.FullName -NoNewline
}

# Also update RPC function calls if they reference table names
Get-ChildItem -Recurse -Include *.ts,*.tsx |
ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace "\.rpc\('", ".rpc('validai_" # If RPC functions have table-based names
    $content | Set-Content $_.FullName -NoNewline
}
```

#### Alternative: Linux/Mac bash

```bash
cd /c/Dev/Validai/apps/validai

# Find and replace in all TypeScript files
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('documents')/\.from('validai_documents')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('processors')/\.from('validai_processors')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('operations')/\.from('validai_operations')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('runs')/\.from('validai_runs')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('operation_results')/\.from('validai_operation_results')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('workbench_executions')/\.from('validai_workbench_executions')/g" {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s/\.from('llm_global_settings')/\.from('validai_llm_global_settings')/g" {} +
```

#### Verify Replacements

**Check for any remaining old table names:**

```bash
cd apps/validai

# Search for old table references
grep -r "\.from('documents')" --include="*.ts" --include="*.tsx"
grep -r "\.from('processors')" --include="*.ts" --include="*.tsx"
grep -r "\.from('operations')" --include="*.ts" --include="*.tsx"
grep -r "\.from('runs')" --include="*.ts" --include="*.tsx"
grep -r "\.from('operation_results')" --include="*.ts" --include="*.tsx"
grep -r "\.from('workbench_executions')" --include="*.ts" --include="*.tsx"
grep -r "\.from('llm_global_settings')" --include="*.ts" --include="*.tsx"

# Should return NO results for each search
```

**If any found:**
- Manually update remaining references
- Re-run verification

#### Files Most Likely Changed

Based on typical ValidAI structure:

- `app/queries/documents.ts` - Document queries
- `app/queries/processors.ts` - Processor queries
- `app/queries/operations.ts` - Operation queries
- `app/queries/runs.ts` - Run queries
- `app/queries/workbench.ts` - Workbench queries
- `app/queries/llm-settings.ts` - LLM settings queries
- Any component with direct Supabase calls

**Review git diff:**
```bash
git diff apps/validai
```

Verify changes look correct (only table names changed, no logic altered)

### Step 1.3.7: Update Database Type Definitions

**Regenerate types from updated schema:**

```bash
# From root
cd /c/Dev/Validai

# Generate updated types
npx supabase gen types typescript --project-id xczippkxxdqlvaacjexj > apps/validai/lib/database.types.ts
```

**Verify types updated:**
```typescript
// apps/validai/lib/database.types.ts should now show:
export interface Database {
  public: {
    Tables: {
      validai_documents: { ... }
      validai_processors: { ... }
      validai_operations: { ... }
      // etc.
    }
  }
}
```

### Deliverable 1.3

✅ **All ValidAI tables renamed with prefix**
- [ ] Database backup created and verified
- [ ] Pre-migration row counts recorded
- [ ] Migration file created
- [ ] Migration applied successfully
- [ ] Post-migration verification passed
- [ ] All application code updated
- [ ] No old table references remain
- [ ] Database types regenerated

**Checkpoint commit:**
```bash
git add supabase/migrations/20250123000000_rename_validai_tables.sql
git add apps/validai
git commit -m "refactor: rename all ValidAI tables with validai_ prefix (Task 1.3)

Database changes:
- documents → validai_documents
- processors → validai_processors
- operations → validai_operations
- runs → validai_runs
- operation_results → validai_operation_results
- workbench_executions → validai_workbench_executions
- llm_global_settings → validai_llm_global_settings

Code changes:
- Updated all .from() calls to use new table names
- Regenerated database type definitions
- Verified zero data loss (row counts match)

Verification: All tables renamed, RLS policies auto-updated, foreign keys preserved

Phase 1, Task 1.3 complete"
```

---

## Verification & Testing

**Duration:** 30 minutes
**Objective:** Ensure ValidAI fully functional after all Phase 1 changes

### Test Suite

Run ALL tests in order. Mark each ✅ or ❌.

#### Test 1: Application Starts

```bash
cd /c/Dev/Validai
turbo dev --filter=@playze/validai
```

**Expected:**
```
@playze/validai:dev: $ next dev
@playze/validai:dev: ▲ Next.js 15.0.3
@playze/validai:dev: - Local:        http://localhost:3000
@playze/validai:dev: - Ready in 2.5s
```

- [ ] ✅ Dev server starts without errors
- [ ] ✅ No TypeScript compilation errors
- [ ] ✅ No "table does not exist" errors

#### Test 2: Authentication

1. Navigate to `http://localhost:3000`
2. Click "Sign In" (if not logged in)
3. Enter credentials
4. Submit

**Expected:**
- [ ] ✅ Login page loads
- [ ] ✅ Can enter email/password
- [ ] ✅ Redirected to dashboard after login
- [ ] ✅ User session established

#### Test 3: Dashboard

**Expected:**
- [ ] ✅ Dashboard page loads
- [ ] ✅ Statistics display (uses validai_processors, validai_documents, etc.)
- [ ] ✅ No database query errors in console

#### Test 4: Processors (CRUD)

**List:**
1. Navigate to `/proc`
2. Verify processors list displays

**View:**
3. Click on a processor
4. Verify processor details load

**Edit:**
5. Click "Edit" on a processor
6. Change processor name
7. Click "Save"
8. Verify changes saved

**Create:**
9. Click "New Processor"
10. Fill in details
11. Click "Create"
12. Verify new processor appears

**Expected:**
- [ ] ✅ Processors list loads (validai_processors)
- [ ] ✅ Can view processor details
- [ ] ✅ Can edit and save processor
- [ ] ✅ Can create new processor
- [ ] ✅ No "table does not exist" errors

#### Test 5: Operations (within Processor)

**List:**
1. Open a processor
2. Verify operations list displays

**Create:**
3. Click "Add Operation"
4. Fill in operation details
5. Save operation

**Edit:**
6. Edit operation details
7. Save changes

**Expected:**
- [ ] ✅ Operations list loads (validai_operations)
- [ ] ✅ Can create new operation
- [ ] ✅ Can edit operation
- [ ] ✅ No database query errors

#### Test 6: Documents

**List:**
1. Navigate to `/documents`
2. Verify documents list displays

**Upload:**
3. Click "Upload Document"
4. Select file
5. Upload

**View:**
6. Click on document
7. Verify document loads

**Expected:**
- [ ] ✅ Documents list loads (validai_documents)
- [ ] ✅ Can upload document (storage + validai_documents row)
- [ ] ✅ Document appears in list
- [ ] ✅ Can view document details

#### Test 7: Runs & Results

**Create Run:**
1. Navigate to processor
2. Click "Run" or "Execute"
3. Select document
4. Start run

**View Results:**
5. Wait for run to complete
6. View run results
7. Check operation results

**Expected:**
- [ ] ✅ Can create run (validai_runs)
- [ ] ✅ Run executes
- [ ] ✅ Results save (validai_operation_results)
- [ ] ✅ Can view results
- [ ] ✅ Charts render correctly

#### Test 8: Workbench

**Execute Prompt:**
1. Navigate to `/workbench`
2. Enter prompt
3. Execute

**View History:**
4. Check execution history

**Expected:**
- [ ] ✅ Workbench loads
- [ ] ✅ Can execute prompt
- [ ] ✅ Response displays
- [ ] ✅ Execution saved (validai_workbench_executions)

#### Test 9: LLM Settings

**View Settings:**
1. Navigate to settings/LLM configuration
2. View current settings

**Update Settings:**
3. Change model or provider
4. Save changes

**Expected:**
- [ ] ✅ LLM settings load (validai_llm_global_settings)
- [ ] ✅ Can update settings
- [ ] ✅ Changes persist

### Test Summary

**All tests must pass (✅) before Phase 1 considered complete.**

**If any test fails (❌):**
1. Record exact error message
2. Check browser console
3. Check server logs
4. Identify root cause (table name? migration issue? code update missed?)
5. Fix issue
6. Re-run ALL tests

---

## Rollback Procedures

**If Phase 1 fails and needs rollback:**

### Rollback Step 1: Restore Database

**Using Supabase Dashboard:**
1. Go to Database → Backups
2. Find `pre-table-rename-2025-01-23` backup
3. Click "Restore"
4. Confirm restoration
5. Wait for completion

**Using CLI backup:**
```bash
# Restore from dump file
npx supabase db reset --db-url "postgresql://postgres:[password]@db.xczippkxxdqlvaacjexj.supabase.co:5432/postgres"
psql -h db.xczippkxxdqlvaacjexj.supabase.co -U postgres -d postgres < backup-before-rename.sql
```

### Rollback Step 2: Revert Code Changes

```bash
cd /c/Dev/Validai

# Reset to before Phase 1
git reset --hard <commit-before-phase1>

# Alternative: Revert specific commits
git revert <task-1.3-commit>
git revert <task-1.2-commit>
git revert <task-1.1-commit>
```

### Rollback Step 3: Restore Original Structure

```bash
# Move ValidAI back
mv apps/validai ./validai-app

# Move Supabase back
mv supabase validai-app/supabase

# Remove monorepo files
rm package.json pnpm-workspace.yaml turbo.json tsconfig.json pnpm-lock.yaml
rm -rf apps packages node_modules .turbo
```

### Rollback Step 4: Verify Original State

```bash
cd validai-app
npm install
npm run dev
```

**Test original ValidAI works.**

---

## Success Criteria

**Phase 1 is considered COMPLETE when:**

✅ **Structure:**
- [ ] Monorepo initialized (pnpm + Turborepo)
- [ ] ValidAI in `apps/validai` directory
- [ ] Supabase at root level
- [ ] Root package.json, pnpm-workspace.yaml, turbo.json exist

✅ **Database:**
- [ ] All 7 ValidAI tables renamed with `validai_` prefix
- [ ] Zero data loss (row counts verified)
- [ ] RLS policies updated automatically
- [ ] Foreign keys preserved

✅ **Code:**
- [ ] All `.from()` calls use new table names
- [ ] No references to old table names remain
- [ ] Database types regenerated
- [ ] TypeScript compiles without errors

✅ **Functionality:**
- [ ] ValidAI application runs
- [ ] All CRUD operations work
- [ ] Authentication works
- [ ] Documents, Processors, Operations, Runs, Workbench all functional
- [ ] No database query errors

✅ **Documentation:**
- [ ] All changes committed to git
- [ ] Clear commit messages
- [ ] Phase 1 tagged in git
- [ ] Backup created and verified

**When ALL criteria met → Phase 1 COMPLETE ✅**

**Ready to proceed to Phase 2: Import Playze Core**

---

## Final Checklist

Before declaring Phase 1 complete, verify:

- [ ] pnpm installed and working (`pnpm --version`)
- [ ] Turborepo installed and working (`turbo --version`)
- [ ] ValidAI in `apps/validai/` directory
- [ ] Supabase in root `supabase/` directory
- [ ] All 7 tables renamed in database
- [ ] All code updated to use new table names
- [ ] Database types regenerated
- [ ] All functional tests pass
- [ ] Database backup exists and verified
- [ ] All changes committed to git
- [ ] Git tag `phase1-complete` created

**Final commit:**
```bash
git tag -a phase1-complete -m "Phase 1 Complete: Structure Alignment & Table Rename

✅ Monorepo initialized (pnpm + Turborepo)
✅ ValidAI moved to apps/validai
✅ Supabase moved to root
✅ All ValidAI tables prefixed with validai_
✅ All code updated, zero data loss
✅ Full functionality verified

Duration: 1 day (8 hours)
Risk: Medium → Mitigated (backups, verification)

Ready for Phase 2: Import Playze Core"

git push
git push --tags
```

---

## Next Steps

**After Phase 1 completion:**

1. **Review Phase 1 results** with team
2. **Verify all success criteria** met
3. **Document any issues encountered** and resolutions
4. **Proceed to Phase 2:** Import Playze Core
   - Copy shared packages (@playze/shared-*)
   - Copy apps (admin-portal, testapp)
   - Apply platform migrations
   - Register ValidAI as platform app

**Estimated Phase 2 start:** Next business day after Phase 1 complete

---

## Appendix: File Checklist

### Files Created in Phase 1

**Root level:**
- `/package.json` - Root package with Turborepo scripts
- `/pnpm-workspace.yaml` - Workspace configuration
- `/turbo.json` - Turborepo configuration
- `/tsconfig.json` - Root TypeScript config
- `/pnpm-lock.yaml` - pnpm lockfile (auto-generated)

**Directories created:**
- `/apps/` - All applications
- `/packages/` - Shared packages (empty in Phase 1)

**Migrations:**
- `/supabase/migrations/20250123000000_rename_validai_tables.sql`

**Backups:**
- `/backup-before-rename.sql` (optional, via CLI)
- Supabase dashboard backup: `pre-table-rename-2025-01-23`

**Documentation:**
- `/pre-migration-counts.txt` - Row counts before migration

### Files Modified in Phase 1

**ValidAI app:**
- `apps/validai/package.json` - Changed name to `@playze/validai`
- `apps/validai/tsconfig.json` - Added `extends` to root config
- `apps/validai/lib/database.types.ts` - Regenerated with new table names
- `apps/validai/app/queries/*.ts` - All table references updated
- Any other files with `.from('table')` calls

### Files Moved in Phase 1

- `validai-app/` → `apps/validai/`
- `validai-app/supabase/` → `supabase/`

---

**End of Phase 1 Detailed Plan**
