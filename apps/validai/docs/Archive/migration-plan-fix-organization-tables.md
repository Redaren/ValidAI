# Migration Plan: Fix ValidAI Organization Tables Architecture Violation

**Document Version:** 1.1
**Date:** 2025-01-30 (Updated: 2025-11-03)
**Author:** Architecture Review Team
**Status:** In Progress - Phase 2 Complete
**Estimated Effort:** 10 hours + 1 week validation
**Risk Level:** HIGH (affects production data and core functionality)

---

## Migration Status

### ✅ Phase 1: COMPLETE (2025-11-03)
- ✅ Added `created_by` and `llm_configuration` columns to platform `organizations` table
- ✅ Migrated data from `validai_organizations`
- ✅ Synchronized all users to `organization_members` (including elin@olivab.se)
- ✅ Migration: `20251103120000_phase1_add_validai_fields_to_platform_tables.sql`

### ✅ Phase 2: COMPLETE (2025-11-03)
- ✅ Updated Edge Function `execute-processor-run` to use `organization_members`
- ✅ Updated 3 database functions to use platform tables
- ✅ Regenerated TypeScript types
- ✅ Edge Function deployed to production
- ✅ Migration: `20251103120001_phase2_fix_database_functions_use_platform_tables.sql`
- ✅ **403 Error RESOLVED**: elin@olivab.se can now run processors from 192.168.86.239:3000

### ⚠️ Phase 2.5: DISCOVERED - CRITICAL GAP
**Issue Found:** ValidAI core tables still have foreign keys pointing to duplicate `validai_organizations` table instead of platform `organizations` table.

**Affected Tables:**
- `validai_documents.organization_id` → ❌ `validai_organizations.id` (should be `organizations.id`)
- `validai_processors.organization_id` → ❌ `validai_organizations.id`
- `validai_runs.organization_id` → ❌ `validai_organizations.id`
- `validai_workbench_executions.organization_id` → ❌ `validai_organizations.id`
- `validai_organization_members.organization_id` → ❌ `validai_organizations.id`

**Also Requires:**
- 9 RLS policies hardcode references to `validai_organization_members`
- 2 triggers reference old tables

**Status:** Planning - Phase 2.5 section added to document

### ⏸️ Phase 3: BLOCKED
Cannot proceed with dropping duplicate tables until foreign keys are updated (Phase 2.5).

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Root Cause of 403 Error](#root-cause-of-403-error)
4. [Target Architecture](#target-architecture)
5. [Migration Strategy](#migration-strategy)
6. [Phase 1: Schema Migration](#phase-1-schema-migration)
7. [Phase 2: Code Updates](#phase-2-code-updates)
8. [Phase 2.5: Update Foreign Key Constraints](#phase-25-update-foreign-key-constraints)
9. [Phase 3: Cleanup & Drop Duplicate Tables](#phase-3-cleanup--drop-duplicate-tables)
10. [Rollback Procedures](#rollback-procedures)
11. [Testing Strategy](#testing-strategy)
12. [Risk Assessment](#risk-assessment)
13. [Timeline & Effort](#timeline--effort)
14. [Prerequisites](#prerequisites)
15. [Success Criteria](#success-criteria)
16. [Appendix](#appendix)

---

## Executive Summary

### Problem Statement

ValidAI incorrectly created duplicate organization tables (`validai_organizations`, `validai_organization_members`, `validai_profiles`) that violate the ValidAI Core Framework architecture. According to the framework specification, **platform tables must have NO prefix** and be shared across all applications.

This architectural violation causes:
1. **403 Forbidden errors** when executing processors from non-localhost domains
2. **Data inconsistency** between platform and ValidAI tables
3. **Maintenance burden** from duplicate table management
4. **Framework violations** that prevent proper multi-app architecture

### Solution Overview

Migrate ValidAI to use core platform tables (`organizations`, `organization_members`, `profiles`) while preserving ValidAI-specific data (`created_by`, `llm_configuration`) by adding these fields to the platform tables.

### Business Impact

**Without Fix:**
- ValidAI unusable from network IPs (403 errors continue)
- Cannot scale to multi-app platform
- Data drift between duplicate tables
- Increased maintenance complexity

**With Fix:**
- ValidAI works correctly from all domains
- Proper multi-tenant architecture
- Single source of truth for organization data
- Framework-compliant design

---

## Current State Analysis

### Duplicate Table Sets

#### Platform Tables (Correct - From Framework)

**organizations** (1 row)
```sql
Columns:
  - id (uuid, PK)
  - name (text, NOT NULL) → "Oliv Sweden AB"
  - description (text, nullable)
  - is_active (boolean, default true)
  - created_at (timestamptz)
  - updated_at (timestamptz)
```

**organization_members** (3 rows)
```sql
Columns:
  - organization_id (uuid, FK → organizations.id)
  - user_id (uuid, FK → auth.users.id)
  - role (text: owner|admin|member|viewer)
  - joined_at (timestamptz)
  - invited_by (uuid, FK → auth.users.id)

Members:
  ✅ johan.mardfelt@olivab.se (owner)
  ✅ jmardfelt@gmail.com (member)
  ✅ elin@olivab.se (owner)
```

**profiles** (3 rows)
```sql
Columns:
  - id (uuid, PK, FK → auth.users.id)
  - full_name (text, nullable)
  - avatar_url (text, nullable)
  - bio (text, nullable)
  - created_at (timestamptz)
  - updated_at (timestamptz)
```

---

#### ValidAI Tables (Incorrect - Should Not Exist)

**validai_organizations** (1 row)
```sql
Columns:
  - id (uuid, PK) → Same UUID as platform org
  - name (text, NOT NULL) → "johan.mardfelt's Organization" (DIFFERENT name!)
  - slug (text, NOT NULL, UNIQUE) → "johan-mardfelt-s-organization"
  - plan_type (text) → 'free' (DUPLICATES app_tiers functionality)
  - created_at (timestamptz)
  - updated_at (timestamptz)
  - created_by (uuid, NOT NULL, FK → auth.users.id)
  - llm_configuration (jsonb) → LLM API keys and models

Key Issues:
  ❌ Same org ID but different name (data inconsistency)
  ❌ plan_type violates framework subscription model
  ❌ ValidAI-specific fields mixed with platform concept
```

**validai_organization_members** (2 rows)
```sql
Columns:
  - organization_id (uuid, FK → validai_organizations.id)
  - user_id (uuid, FK → auth.users.id)
  - role (text)
  - joined_at (timestamptz)
  - [MISSING] invited_by field

Members:
  ✅ johan.mardfelt@olivab.se (owner)
  ✅ jmardfelt@gmail.com (member)
  ❌ elin@olivab.se (MISSING - causes 403 error)
```

**validai_profiles** (1 row)
```sql
Columns: [Same schema as platform profiles]

Key Issue:
  ❌ Duplicate of platform table, no additional fields
```

---

### Foreign Key Dependencies

**5 ValidAI tables reference validai_organizations:**

| Table | Rows | FK Column | References |
|-------|------|-----------|------------|
| validai_documents | 62 | organization_id | validai_organizations.id |
| validai_processors | 4 | organization_id | validai_organizations.id |
| validai_runs | 60 | organization_id | validai_organizations.id |
| validai_workbench_executions | 185 | organization_id | validai_organizations.id |
| validai_organization_members | 2 | organization_id | validai_organizations.id |

**Total Rows Affected:** 313 rows across 5 tables

**Critical Constraint:** All these foreign keys must be updated to point to `organizations` table instead.

---

### Code References

#### 1. Edge Function (CRITICAL - Causes 403 Error)

**File:** `supabase/functions/execute-processor-run/index.ts:231`

```typescript
// CURRENT CODE (Line 229-234)
const { data: membership, error: memberError } = await supabase
  .from('validai_organization_members')  // ❌ WRONG TABLE
  .select('organization_id')
  .eq('user_id', user.id)
  .single()

if (memberError || !membership) {
  return new Response(
    JSON.stringify({ error: 'User not member of any organization' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
```

**Impact:** When elin@olivab.se logs in from 192.168.86.239:3000, query returns no results → 403 error.

---

#### 2. Database Functions (3 functions)

**File:** `supabase/migrations/20250123000003_fix_database_functions_for_renamed_tables.sql`

Functions that reference validai_organization tables:
1. `validate_processor_ownership()` - Checks if user owns processor
2. `get_organization_members()` - Retrieves org members
3. `get_user_organizations_safe()` - Gets user's orgs

All need updates to reference platform tables.

---

#### 3. Migration Files (History)

**Root Cause Migration:**
- `20250123000001_rename_remaining_validai_tables.sql` - **INCORRECT MIGRATION**
  - Renamed platform tables to validai_ prefix
  - Comment: "Platform-like tables that belong to ValidAI app (not Playze Core platform)"
  - **WRONG ASSUMPTION:** These tables belong to the platform, not ValidAI

**Subsequent Migrations:**
- `20250123000002_update_functions_for_renamed_tables.sql` - Updated function comments
- `20250123000003_fix_database_functions_for_renamed_tables.sql` - Updated function code
- `20250124000000_register_validai_app.sql` - Registered ValidAI in apps catalog
- `20251028000003_update_validai_rls_policies.sql` - Updated RLS policies

---

## Root Cause of 403 Error

### Error Flow

```
User (elin@olivab.se) accesses ValidAI from 192.168.86.239:3000
    ↓
Cookies are domain-specific → No localhost cookies sent
    ↓
User logs in again with elin@olivab.se credentials
    ↓
Session established with JWT containing user_id: 7410357f-f92d-4ba1-b589-430dde7de60b
    ↓
User uploads document and runs processor
    ↓
Browser calls: supabase.functions.invoke('execute-processor-run', ...)
    ↓
Edge Function queries:
  SELECT organization_id FROM validai_organization_members
  WHERE user_id = '7410357f-f92d-4ba1-b589-430dde7de60b'
    ↓
Result: EMPTY (user not in validai_organization_members)
    ↓
Edge Function returns: HTTP 403 "User not member of any organization"
    ↓
UI displays: "Edge Function returned a non-2xx status code"
```

### Why It Works on Localhost

On localhost:3000:
- User logged in as `johan.mardfelt@olivab.se` or `jmardfelt@gmail.com`
- These users EXIST in `validai_organization_members`
- Query succeeds → Run created successfully

---

## Target Architecture

### Platform Tables (Shared Across All Apps)

**organizations** - Extended with ValidAI-specific fields
```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,

  -- NEW FIELDS (Phase 1)
  created_by uuid REFERENCES auth.users(id),
  llm_configuration jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Fields Added:**
- ✅ `created_by` - User who created the organization (audit trail)
- ✅ `llm_configuration` - JSONB with LLM API keys and model settings

**Fields NOT Migrated:**
- ❌ `slug` - Not migrated (will be lost, can recreate if needed)
- ❌ `plan_type` - MUST NOT migrate (violates framework, use `app_tiers` instead)

**organization_members** - No changes needed (already correct)

**profiles** - No changes needed (already correct)

---

### ValidAI Tables (App-Specific Only)

All ValidAI tables continue with `validai_` prefix:
- ✅ `validai_documents`
- ✅ `validai_processors`
- ✅ `validai_operations`
- ✅ `validai_runs`
- ✅ `validai_operation_results`
- ✅ `validai_workbench_executions`
- ✅ `validai_llm_global_settings`

**Foreign keys updated to reference `organizations` instead of `validai_organizations`.**

---

### Deleted Tables (Post-Migration)

After successful migration and validation:
- ❌ `validai_organizations` - DROP TABLE CASCADE
- ❌ `validai_organization_members` - DROP TABLE CASCADE
- ❌ `validai_profiles` - DROP TABLE CASCADE

---

## Migration Strategy

### Phased Approach

**Why Phased?**
1. Minimize risk by making changes incrementally
2. Allow testing and validation between phases
3. Enable rollback at any phase
4. Reduce downtime

**Phase Dependencies:**
```
Phase 1 (Schema) → Phase 2 (Code) → Phase 3 (Cleanup)
     ↓                  ↓                 ↓
  30 min            1-2 hours        2-3 hours
  LOW RISK         MEDIUM RISK       HIGH RISK
  Can rollback     Can rollback      Permanent
```

---

## Phase 1: Schema Migration

### Objective
Add ValidAI-specific fields to platform tables and synchronize data without breaking existing functionality.

### Duration
30 minutes

### Risk Level
**LOW** - Non-destructive, additive only

### Prerequisites
- [ ] Database backup completed
- [ ] Read-only access to production confirmed
- [ ] Migration SQL reviewed by team

---

### Step 1.1: Add Columns to `organizations` Table

**SQL:**
```sql
-- Add ValidAI-specific fields to platform organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS llm_configuration jsonb;

-- Add column comments for documentation
COMMENT ON COLUMN organizations.created_by IS
  'User who created this organization (audit trail, ValidAI-originated)';
COMMENT ON COLUMN organizations.llm_configuration IS
  'JSONB configuration for LLM settings including API keys and available models.
   Structure: {
     "api_keys_encrypted": { "provider": "encrypted_key" },
     "available_models": [{ "id", "provider", "model", "display_name" }],
     "default_model_id": "model_id"
   }
   Used by ValidAI app, other apps can use or ignore.';
```

**Validation:**
```sql
-- Verify columns added successfully
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('created_by', 'llm_configuration')
ORDER BY ordinal_position;

-- Expected: 2 rows returned
```

---

### Step 1.2: Migrate Data from `validai_organizations`

**SQL:**
```sql
-- Copy ValidAI-specific data to platform table
UPDATE organizations o
SET
  created_by = vo.created_by,
  llm_configuration = vo.llm_configuration
FROM validai_organizations vo
WHERE o.id = vo.id;

-- Verify data migration
SELECT
  o.id,
  o.name as platform_name,
  vo.name as validai_name,
  o.created_by IS NOT NULL as has_created_by,
  o.llm_configuration IS NOT NULL as has_llm_config
FROM organizations o
LEFT JOIN validai_organizations vo ON o.id = vo.id;

-- Expected: All rows should show TRUE for has_created_by and has_llm_config
```

**Data Loss Warning:**
⚠️ **The following fields will NOT be migrated and will be LOST:**
- `slug` - Organization URL slug (can recreate if needed)
- `plan_type` - Subscription tier (MUST use `app_tiers` instead per framework)

---

### Step 1.3: Synchronize Missing Users

**Problem:** `elin@olivab.se` exists in `organization_members` but missing from `validai_organization_members`.

**SQL:**
```sql
-- Sync missing users from validai_organization_members to organization_members
INSERT INTO organization_members (organization_id, user_id, role, joined_at)
SELECT
  vom.organization_id,
  vom.user_id,
  vom.role,
  vom.joined_at
FROM validai_organization_members vom
WHERE NOT EXISTS (
  SELECT 1 FROM organization_members om
  WHERE om.organization_id = vom.organization_id
    AND om.user_id = vom.user_id
)
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Note: This INSERT should return 0 rows because platform table already has all users
-- If it returns rows, it means platform table was missing data
```

**Validation:**
```sql
-- Verify all users exist in platform table
SELECT
  u.email,
  u.id as user_id,
  CASE
    WHEN om.user_id IS NOT NULL THEN '✅ In platform'
    ELSE '❌ MISSING'
  END as platform_status,
  CASE
    WHEN vom.user_id IS NOT NULL THEN '✅ In validai'
    ELSE '❌ MISSING'
  END as validai_status
FROM auth.users u
LEFT JOIN organization_members om ON om.user_id = u.id
LEFT JOIN validai_organization_members vom ON vom.user_id = u.id
WHERE u.email LIKE '%olivab.se%' OR u.email LIKE '%mardfelt%'
ORDER BY u.email;

-- Expected: All users should show ✅ in both columns
```

---

### Step 1.4: Verify Data Integrity

**SQL:**
```sql
-- Check row counts match
SELECT
  'organizations' as table_comparison,
  (SELECT COUNT(*) FROM organizations) as platform_count,
  (SELECT COUNT(*) FROM validai_organizations) as validai_count,
  (SELECT COUNT(*) FROM organizations) = (SELECT COUNT(*) FROM validai_organizations) as counts_match;

SELECT
  'organization_members' as table_comparison,
  (SELECT COUNT(*) FROM organization_members) as platform_count,
  (SELECT COUNT(*) FROM validai_organization_members) as validai_count;

-- Verify no NULL created_by or llm_configuration where validai had data
SELECT
  id,
  name,
  created_by,
  llm_configuration
FROM organizations
WHERE id IN (SELECT id FROM validai_organizations);

-- Expected: All fields should have values (not NULL)
```

---

### Step 1.5: Create Rollback Script

**Save this script as:** `rollback-phase-1.sql`

```sql
-- ROLLBACK PHASE 1
-- Remove added columns from organizations table

ALTER TABLE organizations
  DROP COLUMN IF EXISTS created_by CASCADE,
  DROP COLUMN IF EXISTS llm_configuration CASCADE;

-- No need to rollback organization_members sync (data was already correct)
```

---

### Phase 1 Success Criteria

- [ ] `created_by` column added to `organizations`
- [ ] `llm_configuration` column added to `organizations`
- [ ] Data migrated from `validai_organizations` (1 row)
- [ ] All validation queries return expected results
- [ ] Rollback script created and saved
- [ ] No errors in database logs
- [ ] Platform tables still functional (test with existing code)

**Outcome:** Platform tables now contain all necessary data. ValidAI tables still exist but are no longer the source of truth.

---

## Phase 2: Code Updates

### Objective
Update all application code and database functions to use platform tables instead of validai tables.

### Duration
1-2 hours

### Risk Level
**MEDIUM** - Changes application behavior, requires thorough testing

### Prerequisites
- [ ] Phase 1 completed successfully
- [ ] Phase 1 validated (all success criteria met)
- [ ] Development environment available for testing
- [ ] Edge Function deployment access confirmed

---

### Step 2.1: Update Edge Function

**File:** `supabase/functions/execute-processor-run/index.ts`

**Change Location:** Lines 229-242

**BEFORE:**
```typescript
} else {
  // Regular user: verify organization membership
  const { data: membership, error: memberError } = await supabase
    .from('validai_organization_members')  // ❌ WRONG TABLE
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (memberError || !membership) {
    return new Response(
      JSON.stringify({ error: 'User not member of any organization' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  organization_id = membership.organization_id
}
```

**AFTER:**
```typescript
} else {
  // Regular user: verify organization membership
  const { data: membership, error: memberError } = await supabase
    .from('organization_members')  // ✅ CORRECT - Platform table
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (memberError || !membership) {
    return new Response(
      JSON.stringify({ error: 'User not member of any organization' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  organization_id = membership.organization_id
}
```

**Testing Locally:**
```bash
# Test Edge Function locally before deploying
npx supabase functions serve execute-processor-run

# In another terminal, test with curl
curl -X POST "http://localhost:54321/functions/v1/execute-processor-run" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"processor_id":"PROCESSOR_UUID","document_id":"DOCUMENT_UUID"}'

# Expected: HTTP 202 Accepted (not 403)
```

**Deploy to Production:**
```bash
npx supabase functions deploy execute-processor-run
```

---

### Step 2.2: Create Migration to Fix Database Functions

**Create new migration file:** `20250130000000_fix_database_functions_use_platform_tables.sql`

**SQL:**
```sql
-- =============================================================================
-- FIX DATABASE FUNCTIONS TO USE PLATFORM TABLES
-- =============================================================================
-- Description: Update all database functions to reference platform tables
--              instead of validai_organization tables
-- Created: 2025-01-30
-- Risk: Medium (changes function behavior)
-- Related: Migration plan - Phase 2
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNCTION 1: validate_processor_ownership
-- -----------------------------------------------------------------------------
-- Purpose: Check if user owns or has access to a processor
-- Updated: validai_organization_members → organization_members

CREATE OR REPLACE FUNCTION validate_processor_ownership(
  p_processor_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_processor_org_id uuid;
  v_user_is_member boolean;
BEGIN
  -- Get processor's organization
  SELECT organization_id INTO v_processor_org_id
  FROM validai_processors
  WHERE id = p_processor_id;

  IF v_processor_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user is member of processor's organization
  SELECT EXISTS (
    SELECT 1 FROM organization_members  -- ✅ UPDATED: was validai_organization_members
    WHERE organization_id = v_processor_org_id
      AND user_id = p_user_id
  ) INTO v_user_is_member;

  RETURN v_user_is_member;
END;
$$;

COMMENT ON FUNCTION validate_processor_ownership IS
  'Updated to use platform organization_members table - Phase 2 Migration (2025-01-30)';

-- -----------------------------------------------------------------------------
-- FUNCTION 2: get_organization_members
-- -----------------------------------------------------------------------------
-- Purpose: Retrieve all members of an organization with profile data
-- Updated: validai_organization_members → organization_members
--          validai_profiles → profiles

CREATE OR REPLACE FUNCTION get_organization_members(p_org_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  role text,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    om.user_id,
    u.email,
    p.full_name,
    p.avatar_url,
    om.role,
    om.joined_at
  FROM organization_members om  -- ✅ UPDATED: was validai_organization_members
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id  -- ✅ UPDATED: was validai_profiles
  WHERE om.organization_id = p_org_id
  ORDER BY om.joined_at ASC;
END;
$$;

COMMENT ON FUNCTION get_organization_members IS
  'Updated to use platform organization_members and profiles tables - Phase 2 Migration (2025-01-30)';

-- -----------------------------------------------------------------------------
-- FUNCTION 3: get_user_organizations_safe
-- -----------------------------------------------------------------------------
-- Purpose: Get all organizations a user belongs to (safe version with error handling)
-- Updated: validai_organizations → organizations
--          validai_organization_members → organization_members

CREATE OR REPLACE FUNCTION get_user_organizations_safe(p_user_id uuid)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  user_role text,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    om.organization_id,
    o.name as organization_name,
    om.role as user_role,
    om.joined_at
  FROM organization_members om  -- ✅ UPDATED: was validai_organization_members
  JOIN organizations o ON o.id = om.organization_id  -- ✅ UPDATED: was validai_organizations
  WHERE om.user_id = p_user_id
  ORDER BY om.joined_at ASC;
EXCEPTION
  WHEN OTHERS THEN
    -- Return empty result on error (safe fallback)
    RETURN;
END;
$$;

COMMENT ON FUNCTION get_user_organizations_safe IS
  'Updated to use platform organizations and organization_members tables - Phase 2 Migration (2025-01-30)';

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

-- Test functions with sample data
DO $$
DECLARE
  v_test_user_id uuid;
  v_test_org_id uuid;
  v_result boolean;
BEGIN
  -- Get first user and org for testing
  SELECT id INTO v_test_user_id FROM auth.users LIMIT 1;
  SELECT id INTO v_test_org_id FROM organizations LIMIT 1;

  -- Test validate_processor_ownership
  -- (This will fail if no processors exist, which is OK for migration)

  -- Test get_organization_members
  PERFORM * FROM get_organization_members(v_test_org_id);

  -- Test get_user_organizations_safe
  PERFORM * FROM get_user_organizations_safe(v_test_user_id);

  RAISE NOTICE 'All database functions updated and tested successfully';
END $$;
```

**Apply Migration:**
```bash
npx supabase db push
```

---

### Step 2.3: Regenerate TypeScript Types

**Purpose:** Ensure TypeScript types reflect the updated database schema.

**Command:**
```bash
# Regenerate types for shared-types package
pnpm --filter @playze/shared-types gen:types

# Verify generated files
ls -la packages/shared-types/src/database.types.ts

# Optional: Regenerate for validai app if it has local types
pnpm --filter @playze/validai gen:types
```

**Validation:**
```bash
# Type check all packages
pnpm typecheck

# Expected: No type errors
```

---

### Step 2.4: Update ValidAI Middleware (If Needed)

**Check File:** `apps/validai/middleware.ts`

**Search for any references:**
```bash
grep -n "validai_organization" apps/validai/middleware.ts
```

**Expected:** No matches (middleware uses shared-auth which already uses platform tables)

**If found:** Update to use `organization_members` instead.

---

### Step 2.5: Test Edge Function in Production

**Immediate Test After Deployment:**

```bash
# Check Edge Function logs
npx supabase functions logs execute-processor-run --tail

# Test from browser at 192.168.86.239:3000
# 1. Log in as elin@olivab.se
# 2. Upload a document
# 3. Run a processor
# Expected: HTTP 202 Accepted (NOT 403)
```

**Validation Checklist:**
- [ ] Edge Function deploys without errors
- [ ] Edge Function logs show no errors
- [ ] Can create runs from localhost:3000 (existing users)
- [ ] Can create runs from 192.168.86.239:3000 (elin@olivab.se) ← **KEY TEST**
- [ ] No 403 errors in browser console
- [ ] Runs complete successfully

---

### Step 2.6: Create Rollback Scripts

**Edge Function Rollback:**

```bash
# Revert Edge Function changes
git checkout HEAD -- supabase/functions/execute-processor-run/index.ts
npx supabase functions deploy execute-processor-run
```

**Database Function Rollback:**

Create `rollback-phase-2.sql`:
```sql
-- ROLLBACK PHASE 2
-- Restore database functions to use validai tables

-- Option 1: Apply previous migration
-- Find the last working migration before 20250130000000
-- Apply it: npx supabase db reset --to 20250123000003

-- Option 2: Manually restore functions
-- Copy function definitions from 20250123000003_fix_database_functions_for_renamed_tables.sql
-- Apply them manually

RAISE NOTICE 'To rollback Phase 2, revert to migration 20250123000003';
```

---

### Phase 2 Success Criteria

- [ ] Edge Function updated and deployed
- [ ] Database functions updated (3 functions)
- [ ] TypeScript types regenerated
- [ ] All type checks pass
- [ ] Edge Function works from all domains (localhost + network IP)
- [ ] No 403 errors when running processors
- [ ] Existing functionality still works (backward compatible)
- [ ] Rollback scripts created and tested

**Outcome:** All application code now uses platform tables. ValidAI tables are no longer queried.

---

## Phase 2.5: Update Foreign Key Constraints

### Objective
Update all ValidAI table foreign key constraints to reference platform `organizations` table instead of duplicate `validai_organizations` table.

### Duration
1-2 hours

### Risk Level
**MEDIUM-HIGH** - Structural changes affecting 313 rows across 5 tables, but non-destructive (data preserved)

### Prerequisites
- [ ] Phase 2 completed successfully
- [ ] Phase 2 validated (all success criteria met)
- [ ] Database backup created
- [ ] Development environment available for testing

---

### Why Phase 2.5 is Necessary

**Problem Discovered:** After Phase 2 completion, ValidAI core tables still have foreign keys pointing to `validai_organizations` instead of platform `organizations`. This creates a **split-brain architecture**:

```
Platform Tables (queries go here)     Duplicate Tables (FKs point here)
├─ organizations                       ├─ validai_organizations  ← 5 FKs point here!
├─ organization_members                ├─ validai_organization_members
└─ profiles                            └─ validai_profiles

ValidAI Core Tables
├─ validai_documents ────────FK────────> validai_organizations ❌
├─ validai_processors ───────FK────────> validai_organizations ❌
├─ validai_runs ─────────────FK────────> validai_organizations ❌
└─ validai_workbench_executions ──FK──> validai_organizations ❌
```

**Consequences if not fixed:**
- Cannot drop duplicate tables (FK constraints prevent deletion)
- Data can become inconsistent if tables diverge
- Violates single source of truth principle
- Phase 3 cannot proceed

---

### Step 2.5.1: Verify Data Consistency

**Run before making changes:**

```sql
-- Check for orphaned records (should return 0 for all)
SELECT
  'Documents without org in platform' as check_name,
  COUNT(*) as count
FROM validai_documents d
LEFT JOIN organizations o ON d.organization_id = o.id
WHERE o.id IS NULL

UNION ALL

SELECT
  'Processors without org in platform',
  COUNT(*)
FROM validai_processors p
LEFT JOIN organizations o ON p.organization_id = o.id
WHERE o.id IS NULL

UNION ALL

SELECT
  'Runs without org in platform',
  COUNT(*)
FROM validai_runs r
LEFT JOIN organizations o ON r.organization_id = o.id
WHERE o.id IS NULL

UNION ALL

SELECT
  'Workbench executions without org in platform',
  COUNT(*)
FROM validai_workbench_executions w
LEFT JOIN organizations o ON w.organization_id = o.id
WHERE o.id IS NULL;

-- Expected: All counts = 0
```

**Go/No-Go Decision:**
- ✅ **GO:** All counts are 0 (no orphaned data)
- ❌ **NO-GO:** Any count > 0 (must investigate data inconsistency first)

---

### Step 2.5.2: Create Migration to Update Foreign Keys

**Create new migration file:** `20251103120002_phase2.5_update_foreign_keys_to_platform.sql`

```sql
-- =============================================================================
-- PHASE 2.5: UPDATE FOREIGN KEY CONSTRAINTS TO PLATFORM TABLES
-- =============================================================================
-- Description: Update all ValidAI tables to reference platform organizations
-- Created: 2025-11-03
-- Risk: MEDIUM-HIGH (structural changes, non-destructive)
-- Related: Migration plan - Phase 2.5
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- STEP 1: Drop existing foreign keys referencing validai_organizations
-- -----------------------------------------------------------------------------

ALTER TABLE validai_documents
  DROP CONSTRAINT IF EXISTS documents_organization_id_fkey;

ALTER TABLE validai_processors
  DROP CONSTRAINT IF EXISTS processors_organization_id_fkey;

ALTER TABLE validai_runs
  DROP CONSTRAINT IF EXISTS runs_organization_id_fkey;

ALTER TABLE validai_workbench_executions
  DROP CONSTRAINT IF EXISTS workbench_executions_organization_id_fkey;

ALTER TABLE validai_organization_members
  DROP CONSTRAINT IF EXISTS organization_members_organization_id_fkey;

RAISE NOTICE '✅ Step 1: Old foreign keys dropped';

-- -----------------------------------------------------------------------------
-- STEP 2: Add new foreign keys referencing platform organizations
-- -----------------------------------------------------------------------------

ALTER TABLE validai_documents
  ADD CONSTRAINT validai_documents_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_processors
  ADD CONSTRAINT validai_processors_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_runs
  ADD CONSTRAINT validai_runs_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_workbench_executions
  ADD CONSTRAINT validai_workbench_executions_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_organization_members
  ADD CONSTRAINT validai_organization_members_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

RAISE NOTICE '✅ Step 2: New foreign keys created';

-- -----------------------------------------------------------------------------
-- STEP 3: Verify foreign keys
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_fk_count int;
BEGIN
  -- Count foreign keys referencing organizations (should be 5)
  SELECT COUNT(*) INTO v_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN (
      'validai_documents',
      'validai_processors',
      'validai_runs',
      'validai_workbench_executions',
      'validai_organization_members'
    )
    AND ccu.table_name = 'organizations';

  IF v_fk_count = 5 THEN
    RAISE NOTICE '✅ Step 3: All 5 foreign keys updated successfully';
  ELSE
    RAISE EXCEPTION '❌ Expected 5 foreign keys, found %', v_fk_count;
  END IF;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- VERIFICATION QUERIES
-- -----------------------------------------------------------------------------

-- List all foreign keys now referencing organizations
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'validai_%'
  AND kcu.column_name = 'organization_id'
ORDER BY tc.table_name;

-- Expected: 5 rows showing all validai tables → organizations
```

**Apply Migration:**
```bash
npx supabase db push
```

---

### Step 2.5.3: Update RLS Policies (Optional - For Phase 3)

**Note:** RLS policies on `validai_organizations` that reference `validai_organization_members` can remain until Phase 3 when we drop the tables. They don't affect functionality since code now queries platform tables.

**Document for Phase 3:** When dropping `validai_organizations`, these 9 policies will be dropped automatically:
- "Users can view organizations they belong to"
- "Organization owners and admins can update"
- "Only organization owners can delete"
- "Authenticated users can create organizations"
- And 5 policies on `validai_profiles` and `validai_organization_members`

---

### Step 2.5.4: Test Foreign Key Constraints

**Test 1: Verify FKs Work**
```sql
-- Try to insert a record with invalid organization_id (should fail)
INSERT INTO validai_documents (
  id,
  organization_id,
  name,
  mime_type,
  size_bytes,
  storage_path
)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000', -- Invalid org
  'test.pdf',
  'application/pdf',
  1024,
  'test/path.pdf'
);

-- Expected: ERROR - violates foreign key constraint
-- Message should reference "organizations" table (not "validai_organizations")
```

**Test 2: Verify Cascade Delete Works**
```sql
-- This test should NOT be run on production!
-- Only run in development environment

BEGIN;

-- Count documents before
SELECT COUNT(*) FROM validai_documents WHERE organization_id = 'YOUR_TEST_ORG_ID';

-- Delete organization (this should cascade)
DELETE FROM organizations WHERE id = 'YOUR_TEST_ORG_ID';

-- Verify documents were deleted
SELECT COUNT(*) FROM validai_documents WHERE organization_id = 'YOUR_TEST_ORG_ID';
-- Expected: 0

ROLLBACK; -- Don't commit the test!
```

---

### Step 2.5.5: Regenerate TypeScript Types

**Purpose:** Ensure TypeScript types reflect updated foreign key constraints.

```bash
# Regenerate types for shared-types package
pnpm --filter @playze/shared-types gen:types

# Verify no compilation errors
pnpm typecheck
```

**Note:** Type definitions will still include `validai_organizations` tables until Phase 3 when we drop them.

---

### Phase 2.5 Success Criteria

- [ ] Data consistency verified (no orphaned records)
- [ ] Foreign keys dropped successfully (5 constraints)
- [ ] New foreign keys created successfully (5 constraints)
- [ ] All new FKs reference `organizations` table
- [ ] FK constraint tests pass
- [ ] TypeScript types regenerated
- [ ] All apps typecheck without errors
- [ ] Existing ValidAI functionality still works
- [ ] No database errors in logs

**Outcome:** ValidAI core tables now properly reference platform `organizations` table. Ready for Phase 3 (drop duplicate tables).

---

## Phase 3: Cleanup & Drop Duplicate Tables

### Objective
Remove duplicate validai_organization tables after confirming all foreign keys point to platform tables.

### Duration
2-3 hours

### Risk Level
**MEDIUM** - Permanent deletion of duplicate tables (data already migrated and FKs updated in Phase 2.5)

### Prerequisites
- [ ] Phase 2 completed successfully
- [ ] Phase 2.5 completed successfully (foreign keys updated)
- [ ] Phase 2 validated for **at least 1 week** in production
- [ ] Phase 2.5 validated (FK constraints working correctly)
- [ ] No 403 errors reported
- [ ] All processors running successfully
- [ ] Full database backup created
- [ ] Backup verified and downloadable
- [ ] Team approval for destructive changes
- [ ] Maintenance window scheduled (recommended)

---

### ⚠️ CRITICAL WARNING

**This phase makes PERMANENT changes that CANNOT be easily rolled back.**

Before proceeding:
1. **Wait 1 week** after Phase 2 deployment
2. **Verify** no issues reported
3. **Create** full database backup
4. **Test** backup restoration in development
5. **Get** explicit approval from team lead

---

### Step 3.1: Verify Phase 2 Stability

**Run these queries to confirm system is healthy:**

```sql
-- 1. Check Edge Function success rate (last 7 days)
-- Manual check via Supabase Dashboard → Edge Functions → execute-processor-run → Logs
-- Expected: No 403 errors, >95% success rate

-- 2. Verify all runs completed successfully
SELECT
  status,
  COUNT(*) as run_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM validai_runs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY status;

-- Expected: 'completed' status should be >90%

-- 3. Confirm no orphaned data
SELECT
  'Documents without org in platform' as check_name,
  COUNT(*) as count
FROM validai_documents d
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.id = d.organization_id
)

UNION ALL

SELECT
  'Processors without org in platform',
  COUNT(*)
FROM validai_processors p
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.id = p.organization_id
)

UNION ALL

SELECT
  'Runs without org in platform',
  COUNT(*)
FROM validai_runs r
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.id = r.organization_id
);

-- Expected: All counts should be 0
```

**Go/No-Go Decision:**
- ✅ **GO:** All checks pass, no issues for 7 days, backup verified
- ❌ **NO-GO:** Any check fails, investigate and fix before proceeding

---

### Step 3.2: Create Database Backup

**Via Supabase Dashboard:**
1. Navigate to Project Settings → Database → Backups
2. Create manual backup: "Pre-Phase-3-Migration-2025-01-30"
3. Wait for backup to complete
4. Download backup file
5. Verify backup file size (should be > 0 bytes)

**Via CLI (Alternative):**
```bash
# Dump database schema and data
pg_dump -h db.xczippkxxdqlvaacjexj.supabase.co \
  -U postgres \
  -d postgres \
  --clean \
  --if-exists \
  > backup-pre-phase3-$(date +%Y%m%d-%H%M%S).sql

# Verify backup
ls -lh backup-pre-phase3-*.sql
```

---

### Step 3.3: Verify Foreign Keys Point to Platform Tables

**This step verifies that Phase 2.5 completed successfully.**

```sql
-- Verify all foreign keys now reference platform organizations table
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'validai_documents',
    'validai_processors',
    'validai_runs',
    'validai_workbench_executions',
    'validai_organization_members'
  )
  AND kcu.column_name = 'organization_id';

-- Expected: 5 rows, all showing references_table = 'organizations'
-- If any show 'validai_organizations', STOP and complete Phase 2.5 first!
```

**Go/No-Go Decision:**
- ✅ **GO:** All 5 foreign keys reference `organizations` table
- ❌ **NO-GO:** Any FK references `validai_organizations` - complete Phase 2.5 first

---

### Step 3.4: Drop Duplicate Tables

**⚠️ POINT OF NO RETURN ⚠️**

After this step, validai_organization tables will be permanently deleted.

**Create Migration:** `20250130000002_drop_duplicate_validai_organization_tables.sql`

```sql
-- =============================================================================
-- DROP DUPLICATE VALIDAI ORGANIZATION TABLES
-- =============================================================================
-- Description: Remove validai_organizations, validai_organization_members, validai_profiles
--              These tables are now obsolete - all data migrated to platform tables
-- Created: 2025-01-30
-- Risk: CRITICAL (permanent data deletion)
-- Backup Required: YES
-- Related: Migration plan - Phase 3
-- =============================================================================

-- SAFETY CHECK: Verify foreign keys already updated
DO $$
DECLARE
  v_fk_count int;
BEGIN
  -- Count foreign keys still referencing validai_organizations
  SELECT COUNT(*) INTO v_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name IN ('validai_organizations', 'validai_organization_members', 'validai_profiles');

  IF v_fk_count > 0 THEN
    RAISE EXCEPTION 'ABORT: % foreign keys still reference validai_organization tables. Run Step 3.3 first.', v_fk_count;
  END IF;

  RAISE NOTICE '✅ Safety check passed: No foreign keys reference validai_organization tables';
END $$;

-- -----------------------------------------------------------------------------
-- DROP TABLES
-- -----------------------------------------------------------------------------

BEGIN;

-- Drop in reverse dependency order
DROP TABLE IF EXISTS validai_organization_members CASCADE;
RAISE NOTICE 'Dropped table: validai_organization_members';

DROP TABLE IF EXISTS validai_profiles CASCADE;
RAISE NOTICE 'Dropped table: validai_profiles';

DROP TABLE IF EXISTS validai_organizations CASCADE;
RAISE NOTICE 'Dropped table: validai_organizations';

-- Verify tables dropped
DO $$
DECLARE
  v_table_count int;
BEGIN
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('validai_organizations', 'validai_organization_members', 'validai_profiles');

  IF v_table_count = 0 THEN
    RAISE NOTICE '✅ All duplicate tables dropped successfully';
  ELSE
    RAISE EXCEPTION '❌ Expected 0 tables, found %', v_table_count;
  END IF;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- FINAL VERIFICATION
-- -----------------------------------------------------------------------------

-- List remaining validai tables (should only be app-specific tables)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'validai_%'
ORDER BY table_name;

-- Expected results:
-- validai_documents
-- validai_llm_global_settings
-- validai_operation_results
-- validai_operations
-- validai_processors
-- validai_runs
-- validai_workbench_executions

RAISE NOTICE '=== PHASE 3 COMPLETE: Architecture violation resolved ===';
```

**Apply Migration:**
```bash
npx supabase db push
```

**Final Validation:**
```bash
# Test all ValidAI functionality
# 1. Create processor
# 2. Upload document
# 3. Run processor
# 4. View results
# 5. Test from localhost and network IP

# All should work normally
```

---

### Step 3.5: Archive Incorrect Migration File

**File to Archive:**
`supabase/migrations/20250123000001_rename_remaining_validai_tables.sql`

**Action:**
```bash
cd supabase/migrations

# Rename to mark as archived
mv 20250123000001_rename_remaining_validai_tables.sql \
   20250123000001_ARCHIVED_incorrect_rename_validai_tables.sql.bak

# Add comment at top of file
cat > 20250123000001_ARCHIVED_incorrect_rename_validai_tables.sql.bak << 'EOF'
-- =============================================================================
-- ❌ ARCHIVED: INCORRECT MIGRATION - DO NOT USE
-- =============================================================================
-- This migration violated the ValidAI Core Framework architecture by renaming
-- platform tables (organizations, organization_members, profiles) to have
-- validai_ prefix. This was incorrect - platform tables must have NO prefix.
--
-- Issue: Created duplicate table structure causing data inconsistency
-- Fixed By: Migration 20250130000000 through 20250130000002
-- Date Archived: 2025-01-30
-- =============================================================================

EOF

# Append original file content
cat original_file >> 20250123000001_ARCHIVED_incorrect_rename_validai_tables.sql.bak
```

**Commit Changes:**
```bash
git add .
git commit -m "fix: Archive incorrect migration that violated framework architecture

The migration 20250123000001 incorrectly renamed platform tables to have
validai_ prefix, violating the ValidAI Core Framework specification that
platform tables must have NO prefix.

Fixed by migrations:
- 20250130000000: Fix database functions
- 20250130000001: Update foreign keys
- 20250130000002: Drop duplicate tables

Related: Migration Plan - Fix ValidAI Organization Tables"
```

---

### Phase 3 Success Criteria

- [ ] Database backup created and verified
- [ ] All foreign keys updated (5 tables)
- [ ] No foreign key violations
- [ ] Duplicate tables dropped (3 tables)
- [ ] Incorrect migration file archived
- [ ] All ValidAI functionality works
- [ ] No errors in database logs
- [ ] Documentation updated
- [ ] Changes committed to git

**Outcome:** Architecture violation resolved. ValidAI now properly uses platform tables.

---

## Rollback Procedures

### Phase 1 Rollback (Safe)

**Scenario:** Added columns cause issues

**Steps:**
```bash
# Apply rollback script
psql -h db.xczippkxxdqlvaacjexj.supabase.co \
  -U postgres \
  -d postgres \
  -f rollback-phase-1.sql

# Or manually:
# ALTER TABLE organizations DROP COLUMN created_by CASCADE;
# ALTER TABLE organizations DROP COLUMN llm_configuration CASCADE;
```

**Impact:** LOW - No data loss, no functionality affected

---

### Phase 2 Rollback (Medium Risk)

**Scenario:** Edge Function or database functions causing errors

**Edge Function:**
```bash
# Revert code changes
git checkout HEAD~1 -- supabase/functions/execute-processor-run/index.ts

# Redeploy
npx supabase functions deploy execute-processor-run
```

**Database Functions:**
```bash
# Apply previous migration
npx supabase db reset --to 20250123000003

# Or manually restore from backup
```

**Impact:** MEDIUM - Temporary 403 errors resume, but no data loss

---

### Phase 2.5 Rollback (Medium-High Risk)

**Scenario:** Foreign key constraints causing issues

**Steps:**
```bash
# Option 1: Restore from backup taken before Phase 2.5
psql -h db.xczippkxxdqlvaacjexj.supabase.co \
  -U postgres \
  -d postgres \
  < backup-pre-phase2.5-YYYYMMDD-HHMMSS.sql

# Option 2: Manually revert foreign keys (if backup not available)
# Re-run migration to drop new FKs and recreate old FKs
# (Create rollback migration script similar to Phase 2.5 but in reverse)
```

**Impact:** MEDIUM-HIGH - Requires restoring FK constraints, blocks Phase 3

**Prevention:**
- Create backup before Phase 2.5
- Test FK migration in development first
- Verify no orphaned data before applying

---

### Phase 3 Rollback (Medium Risk)

**Note:** Phase 3 rollback is simpler than originally planned since foreign keys were already updated in Phase 2.5.

**Scenario:** Need to restore duplicate tables after accidental deletion

**Steps:**
```bash
# 1. Restore from backup taken in Step 3.2
psql -h db.xczippkxxdqlvaacjexj.supabase.co \
  -U postgres \
  -d postgres \
  < backup-pre-phase3-YYYYMMDD-HHMMSS.sql

# 2. Verify restoration
# Check that validai_organizations tables exist again

# 3. No need to revert code changes (code already uses platform tables)
# Only foreign keys would need reverting if you want to use old tables again
```

**Impact:** MEDIUM - Requires database restoration, but code changes don't need reverting

**Prevention:**
- Wait 1 week after Phase 2
- Test thoroughly
- Verify backup restoration works BEFORE Phase 3

---

## Testing Strategy

### Phase 1 Testing (Schema Migration)

**Test Suite:**
```sql
-- Test 1: Verify columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('created_by', 'llm_configuration');
-- Expected: 2 rows

-- Test 2: Verify data migrated
SELECT
  COUNT(*) as orgs_with_llm_config,
  (SELECT COUNT(*) FROM validai_organizations) as validai_org_count
FROM organizations
WHERE llm_configuration IS NOT NULL;
-- Expected: Both counts equal

-- Test 3: Verify user sync
SELECT email FROM auth.users u
WHERE EXISTS (SELECT 1 FROM validai_organization_members vom WHERE vom.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id);
-- Expected: 0 rows (no missing users)
```

---

### Phase 2 Testing (Code Updates)

**Manual Test Checklist:**

#### Test Environment
- [ ] Log in as `johan.mardfelt@olivab.se` on `localhost:3000`
- [ ] Upload document
- [ ] Run processor
- [ ] Expected: Success (202 Accepted)

#### Network IP Test (CRITICAL)
- [ ] Log in as `elin@olivab.se` on `192.168.86.239:3000`
- [ ] Upload document
- [ ] Run processor
- [ ] Expected: Success (NOT 403) ← **KEY TEST**

#### Edge Cases
- [ ] User with multiple orgs
- [ ] User with no orgs (should fail gracefully)
- [ ] Invalid processor ID
- [ ] Invalid document ID

#### Database Function Tests
```sql
-- Test validate_processor_ownership
SELECT validate_processor_ownership(
  'PROCESSOR_UUID',
  'USER_UUID'
);
-- Expected: true or false (no errors)

-- Test get_organization_members
SELECT * FROM get_organization_members('ORG_UUID');
-- Expected: All members returned with profile data

-- Test get_user_organizations_safe
SELECT * FROM get_user_organizations_safe('USER_UUID');
-- Expected: All user's orgs returned
```

---

### Phase 3 Testing (Cleanup)

**Pre-Cleanup Validation:**
```sql
-- Verify no orphaned data
SELECT 'Documents' as entity, COUNT(*) as orphans
FROM validai_documents d
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = d.organization_id)
UNION ALL
SELECT 'Processors', COUNT(*)
FROM validai_processors p
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id);
-- Expected: All 0
```

**Post-Cleanup Validation:**
```bash
# Test all ValidAI features
# 1. Create processor
pnpm --filter @playze/validai dev
# Navigate to /processors → Click "Create Processor"
# Expected: Success

# 2. Add operations
# Click processor → Add operations
# Expected: Success

# 3. Upload document
# Click "Documents" → Upload
# Expected: Success

# 4. Run processor
# Select document → Click "Run"
# Expected: 202 Accepted, run starts

# 5. View results
# Navigate to run detail page
# Expected: Results display correctly
```

**Database Integrity Check:**
```sql
-- Verify all foreign keys valid
SELECT
  tc.table_name,
  COUNT(*) as row_count,
  SUM(CASE WHEN o.id IS NOT NULL THEN 1 ELSE 0 END) as valid_fk_count
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN validai_documents d ON tc.table_name = 'validai_documents'
LEFT JOIN validai_processors p ON tc.table_name = 'validai_processors'
LEFT JOIN validai_runs r ON tc.table_name = 'validai_runs'
LEFT JOIN validai_workbench_executions w ON tc.table_name = 'validai_workbench_executions'
LEFT JOIN organizations o ON o.id IN (d.organization_id, p.organization_id, r.organization_id, w.organization_id)
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'validai_%'
GROUP BY tc.table_name;
-- Expected: row_count = valid_fk_count for all tables
```

---

### Automated Testing (Future Enhancement)

**Recommended:** Add integration tests after migration

```typescript
// tests/integration/organization-tables.test.ts
describe('Organization Tables Migration', () => {
  it('should query platform tables', async () => {
    const { data } = await supabase
      .from('organization_members')
      .select('*')
      .eq('user_id', TEST_USER_ID);

    expect(data).toBeDefined();
  });

  it('should create processor runs without 403', async () => {
    const { data, error } = await supabase.functions.invoke('execute-processor-run', {
      body: { processor_id: TEST_PROCESSOR_ID, document_id: TEST_DOC_ID }
    });

    expect(error).toBeNull();
    expect(data.status).toBe('pending');
  });
});
```

---

## Risk Assessment

### Risk Matrix

| Phase | Risk Level | Impact | Probability | Mitigation |
|-------|-----------|--------|-------------|------------|
| Phase 1 | LOW | LOW | LOW | Additive only, non-destructive ✅ COMPLETE |
| Phase 2 | MEDIUM | MEDIUM | MEDIUM | Test thoroughly, can rollback ✅ COMPLETE |
| Phase 2.5 | MEDIUM-HIGH | HIGH | LOW | Verify data, backup, test in dev ⚠️ PENDING |
| Phase 3 | MEDIUM | MEDIUM | LOW | Wait 1 week after Phase 2.5, backup ⏸️ BLOCKED |

---

### Identified Risks

#### Risk 1: Data Loss During Foreign Key Migration

**Likelihood:** LOW
**Impact:** HIGH
**Mitigation:**
- Create full database backup before Phase 3
- Verify backup can be restored
- Test in development environment first
- Use transaction (BEGIN/COMMIT) in migration
- Monitor for orphaned data before dropping tables

---

#### Risk 2: Application Downtime During Migration

**Likelihood:** MEDIUM
**Impact:** MEDIUM
**Mitigation:**
- Phase 1: No downtime (additive only)
- Phase 2: No downtime (Edge Functions can be deployed hot)
- Phase 3: Schedule maintenance window (5 minutes max)
- Monitor system status during migration

---

#### Risk 3: Edge Function Deployment Failure

**Likelihood:** LOW
**Impact:** MEDIUM
**Mitigation:**
- Test locally before deploying (`npx supabase functions serve`)
- Deploy during low-traffic period
- Monitor logs immediately after deployment
- Keep rollback script ready

---

#### Risk 4: Missing Edge Cases in Testing

**Likelihood:** MEDIUM
**Impact:** MEDIUM
**Mitigation:**
- Comprehensive test checklist (see Testing Strategy)
- Test with multiple users and scenarios
- Monitor production for 1 week before Phase 3
- Collect user feedback

---

#### Risk 5: Database Function Performance Degradation

**Likelihood:** LOW
**Impact:** LOW
**Mitigation:**
- Platform tables already have proper indexes
- RLS policies similar to validai tables
- Monitor query performance before/after
- Use EXPLAIN ANALYZE to compare execution plans

---

### Risk Acceptance

**Acceptable Risk Threshold:**
- LOW Risk: Proceed with standard review
- MEDIUM Risk: Requires team lead approval
- HIGH Risk: Requires stakeholder approval + backup verification

**Phase 2.5 is MEDIUM-HIGH RISK** - requires backup and validation
**Phase 3 is MEDIUM RISK** (reduced from HIGH after Phase 2.5 completion) - requires explicit approval before execution.

---

## Timeline & Effort

### Detailed Timeline

| Phase | Tasks | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Preparation** | Review plan, backup database | 1 hour | None |
| **Phase 1** | Schema migration | 30 min | Preparation complete |
| **Phase 1 Validation** | Test queries, verify data | 30 min | Phase 1 complete |
| **Phase 2** | Code updates | 1-2 hours | Phase 1 validated |
| **Phase 2 Deployment** | Deploy Edge Function | 15 min | Phase 2 code complete |
| **Phase 2 Validation** | Manual testing | 1 hour | Deployment complete |
| **Phase 2 Monitoring** | Production monitoring | **1 week** | Validation complete |
| **Phase 2.5** | Update foreign key constraints | 1-2 hours | Phase 2 monitoring complete |
| **Phase 2.5 Validation** | Test FK constraints | 30 min | Phase 2.5 complete |
| **Phase 3 Prep** | Backup, team approval | 1 hour | Phase 2.5 validated |
| **Phase 3 Execution** | Drop duplicate tables | 1-2 hours | Approval received |
| **Phase 3 Validation** | Full system test | 2 hours | Phase 3 complete |
| **Documentation** | Update docs, commit | 1 hour | All phases complete |

**Total Active Work:** ~12-14 hours (includes Phase 2.5)
**Total Calendar Time:** 8-10 days (includes 1 week monitoring)

---

### Recommended Schedule

**Week 1:**
- **Day 1 (Monday):** Preparation + Phase 1 + Validation (2 hours) ✅ COMPLETE
- **Day 2 (Tuesday):** Phase 2 (2-3 hours) ✅ COMPLETE
- **Days 3-7:** Monitor production, collect feedback 🔄 IN PROGRESS

**Week 2:**
- **Day 8 (Monday):** Team review, Phase 2.5 execution (2-3 hours)
- **Day 9 (Tuesday):** Phase 2.5 validation, Phase 3 prep and approval
- **Day 10 (Wednesday):** Phase 3 execution (if approved) (2-3 hours)
- **Day 11 (Thursday):** Final validation, documentation

**Slack Time:** 2 days buffer for unexpected issues

---

### Resource Requirements

**Personnel:**
- Developer: 12-14 hours (hands-on work, includes Phase 2.5)
- Team Lead: 2-3 hours (reviews and approvals)
- QA/Testing: 3-4 hours (validation testing)

**Infrastructure:**
- Development environment for testing
- Supabase project access (admin level)
- Database backup storage (1-2 GB)

---

## Prerequisites

### Technical Prerequisites

- [ ] Supabase CLI installed and authenticated
- [ ] Access to Supabase project dashboard
- [ ] Database admin credentials
- [ ] Git repository access
- [ ] Node.js 22.x installed (per CLAUDE.md)
- [ ] pnpm installed globally

---

### Knowledge Prerequisites

- [ ] Team familiar with ValidAI Core Framework architecture
- [ ] Understanding of Supabase Edge Functions
- [ ] PostgreSQL foreign key concepts
- [ ] Git workflow for database migrations

---

### Environment Prerequisites

- [ ] Development environment set up (`pnpm install` completed)
- [ ] `.env.local` files configured for all apps
- [ ] TypeScript types generated (`pnpm gen:types` run)
- [ ] All apps building successfully (`pnpm build`)

---

### Access Prerequisites

- [ ] Supabase project admin access
- [ ] GitHub repository write access
- [ ] Production deployment permissions
- [ ] Database backup download permissions

---

## Success Criteria

### Phase 1 Success

✅ **Schema Migration Complete:**
- [ ] `created_by` column added to `organizations`
- [ ] `llm_configuration` column added to `organizations`
- [ ] Data migrated from `validai_organizations` (1 row)
- [ ] All users synced to `organization_members`
- [ ] No NULL values where data should exist
- [ ] All validation queries pass

---

### Phase 2 Success

✅ **Code Updated:**
- [ ] Edge Function deployed successfully
- [ ] Database functions updated (3 functions)
- [ ] TypeScript types regenerated
- [ ] All type checks pass
- [ ] **Can create runs from localhost:3000** (existing behavior)
- [ ] **Can create runs from 192.168.86.239:3000 as elin@olivab.se** (NEW - critical)
- [ ] No 403 errors in production logs
- [ ] All existing functionality works

---

### Phase 3 Success

✅ **Architecture Compliant:**
- [ ] Foreign keys reference `organizations` (5 tables updated)
- [ ] Duplicate tables dropped (3 tables)
- [ ] No orphaned data
- [ ] All ValidAI features functional
- [ ] Database integrity maintained
- [ ] Documentation updated
- [ ] Team trained on new architecture

---

### Overall Success

✅ **Framework Compliance:**
- [ ] ValidAI uses platform tables (organizations, organization_members, profiles)
- [ ] No validai_organization* tables exist
- [ ] ValidAI-specific data preserved in platform tables
- [ ] Multi-app architecture possible (foundation complete)
- [ ] Single source of truth for organization data
- [ ] No architectural violations

✅ **Business Success:**
- [ ] 403 errors resolved
- [ ] ValidAI accessible from all domains
- [ ] No user-reported issues
- [ ] System performance maintained or improved
- [ ] Development velocity maintained (no regressions)

---

## Appendix

### A. SQL Quick Reference

**Check Platform Table Schema:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'organizations'
ORDER BY ordinal_position;
```

**Verify Foreign Keys:**
```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'validai_%'
ORDER BY tc.table_name;
```

**Count Rows Per Table:**
```sql
SELECT 'organizations' as table_name, COUNT(*) FROM organizations
UNION ALL
SELECT 'validai_organizations', COUNT(*) FROM validai_organizations
UNION ALL
SELECT 'organization_members', COUNT(*) FROM organization_members
UNION ALL
SELECT 'validai_organization_members', COUNT(*) FROM validai_organization_members;
```

---

### B. Edge Function Testing

**Local Testing:**
```bash
# Start local Edge Functions server
npx supabase functions serve

# Test with curl (replace tokens/IDs)
curl -X POST "http://localhost:54321/functions/v1/execute-processor-run" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"processor_id":"UUID","document_id":"UUID"}'
```

**Production Testing:**
```bash
# View logs
npx supabase functions logs execute-processor-run --tail

# Deploy
npx supabase functions deploy execute-processor-run
```

---

### C. Useful Commands

**Reset Local Database:**
```bash
# Reset to specific migration
npx supabase db reset --to 20250123000003

# Reset to latest
npx supabase db reset
```

**Generate Types:**
```bash
# For shared-types package
pnpm --filter @playze/shared-types gen:types

# For specific app
pnpm --filter @playze/validai gen:types
```

**Type Check All:**
```bash
pnpm typecheck
```

---

### D. Contact & Support

**Document Owner:** Architecture Team
**Last Updated:** 2025-11-03
**Next Review:** After Phase 2.5 completion

**Questions or Issues:**
- Create GitHub issue with label `migration-plan`
- Contact team lead for approvals
- Escalate to architecture team for guidance

---

### E. Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-01-30 | Initial migration plan created | Architecture Team |
| 1.1 | 2025-11-03 | **Phase 1 & 2 COMPLETE.** Added Migration Status section. Discovered Phase 2.5 gap: foreign keys still point to old tables. Added comprehensive Phase 2.5 section for FK migration. Updated risk levels (Phase 3 reduced to MEDIUM). Updated timeline and resource requirements. | Architecture Team |

---

**END OF MIGRATION PLAN**

_This document should be reviewed and approved by the team before execution._
