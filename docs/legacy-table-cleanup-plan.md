# Complete Legacy Table Cleanup Plan

**Status:** PLAN APPROVED - Ready for execution
**Date:** 2025-11-03
**Estimated Time:** 2-3 hours for complete cleanup

---

## Executive Summary

ValidAI was migrated to the platform framework in phases, but **legacy tables still have active references**:
- **3 RLS policies** on `validai_organizations`
- **14 database functions** using legacy tables
- **3 legacy tables** with duplicate data

**Good News:**
- ✅ All data already exists in platform tables (0 missing records)
- ✅ No LLM config data to migrate (both tables NULL)
- ✅ No breaking changes (non-destructive migrations)

---

## Current State Inventory

### Legacy Tables Status

| Legacy Table | Rows | Platform Equivalent | Data Migrated | Foreign Keys |
|--------------|------|---------------------|---------------|--------------|
| `validai_organizations` | 1 | `organizations` | ✅ YES | 1 (from validai_org_members) |
| `validai_profiles` | 1 | `profiles` | ✅ YES | None |
| `validai_organization_members` | 2 | `organization_members` | ✅ YES | 1 (to organizations) |

### References Still Using Legacy Tables

#### RLS Policies (3 policies)
All on `validai_organizations` table:
1. **"Users can view organizations they belong to"** (SELECT)
2. **"Organization owners and admins can update"** (UPDATE)
3. **"Only organization owners can delete"** (DELETE)

**Impact:** Users like elin (only in platform table) cannot access legacy org table

#### Database Functions (14 functions, 12 unique)

**Using `validai_organization_members` (2 functions):**
1. `user_can_view_org_members` - ❌ NOT migrated in Phase 2
2. `validate_processor_ownership` - ✅ ALREADY migrated in Phase 2 (but listed due to code comments)

**Using `validai_organizations` (8 functions):**
1. `create_organization` - Creates orgs in legacy table
2. `generate_unique_org_slug` - Checks legacy table for slug uniqueness
3. `get_available_llm_models` - Reads LLM config from legacy
4. `get_llm_config_for_run` - Reads LLM config from legacy (appears twice in query)
5. `get_user_organizations_safe` - ✅ ALREADY migrated in Phase 2 (but listed)
6. `handle_new_user` - Creates profile/org in legacy tables
7. `set_organization_llm_config` - WRITES LLM config to legacy

**Using `validai_profiles` (4 functions):**
1. `get_organization_members` - ✅ ALREADY migrated in Phase 2 (but listed)
2. `get_processor_with_operations` - Joins with legacy profiles
3. `get_user_processors` - Joins with legacy profiles
4. `get_user_processors_debug` - Joins with legacy profiles

**Note:** Some functions appear multiple times in query results (overloaded functions or duplicate listings)

---

## Phased Cleanup Plan

### 📋 PHASE 1: Fix LLM Configuration Functions (Priority: CRITICAL)

**Migration:** `20251103150000_fix_llm_config_functions_use_platform_tables.sql`

**Changes:**
1. Update `get_available_llm_models` - Change 1 table reference
2. Update `get_llm_config_for_run` - Change 2 table references
3. Update `set_organization_llm_config` - Change 1 UPDATE statement
4. Copy any LLM config data from legacy → platform (currently both NULL)

**Functions Fixed:** 3
**Lines Changed:** ~6
**Risk:** LOW (no data loss, both tables NULL)
**Time:** 15 minutes

**Why First:** These functions WRITE data, so fixing them prevents future data divergence

---

### 📋 PHASE 2: Fix User/Profile Database Functions (Priority: HIGH)

**Migration:** `20251103151000_fix_profile_functions_use_platform_tables.sql`

**Changes:**
1. Update `handle_new_user` trigger function
   - Change: Creates `validai_profiles` → Creates `profiles`
   - Change: Creates `validai_organizations` → Creates `organizations`
   - Change: Creates `validai_organization_members` → Creates `organization_members`

2. Update `get_processor_with_operations`
   - Change: JOIN `validai_profiles` → JOIN `profiles`

3. Update `get_user_processors`
   - Change: JOIN `validai_profiles` → JOIN `profiles`

4. Update `get_user_processors_debug`
   - Change: JOIN `validai_profiles` → JOIN `profiles`

**Functions Fixed:** 4
**Lines Changed:** ~12
**Risk:** MEDIUM (handle_new_user is critical trigger)
**Time:** 30 minutes
**Testing:** Create test user to verify trigger works

---

### 📋 PHASE 3: Fix Organization Functions (Priority: HIGH)

**Migration:** `20251103152000_fix_organization_functions_use_platform_tables.sql`

**Changes:**
1. Update `create_organization` function
   - Change: INSERT INTO `validai_organizations` → `organizations`
   - Change: INSERT INTO `validai_organization_members` → `organization_members`

2. Update `generate_unique_org_slug`
   - Change: SELECT FROM `validai_organizations` → `organizations`

3. Update `user_can_view_org_members`
   - Change: SELECT FROM `validai_organization_members` → `organization_members`

**Functions Fixed:** 3
**Lines Changed:** ~8
**Risk:** MEDIUM (create_organization used by signup flow)
**Time:** 20 minutes
**Testing:** Test organization creation

---

### 📋 PHASE 4: Fix RLS Policies on Legacy Table (Priority: MEDIUM)

**Migration:** `20251103153000_fix_legacy_organization_rls_policies.sql`

**Changes:**
Update 3 RLS policies on `validai_organizations` table:

1. **"Users can view organizations they belong to"**
   - Change: Check `validai_organization_members` → `organization_members`

2. **"Organization owners and admins can update"**
   - Change: Check `validai_organization_members` → `organization_members`

3. **"Only organization owners can delete"**
   - Change: Check `validai_organization_members` → `organization_members`

**Policies Fixed:** 3
**Lines Changed:** ~25
**Risk:** LOW (these policies are on legacy table itself)
**Time:** 15 minutes

**Note:** These policies control access to the legacy `validai_organizations` table. Fixing them allows proper access control, but the goal is to stop using this table entirely.

---

### 📋 PHASE 5: Deprecate Legacy Tables (Priority: LOW)

**Migration:** `20251103154000_deprecate_legacy_tables.sql`

**Changes:**
1. Add database comments marking tables as DEPRECATED
2. Create database views as read-only facades (optional safety measure)
3. Add database triggers to PREVENT writes to legacy tables
4. Log all attempted accesses to legacy tables

**Example deprecation trigger:**
```sql
CREATE OR REPLACE FUNCTION prevent_legacy_writes()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is deprecated. Use platform tables instead.', TG_TABLE_NAME
    USING HINT = 'Use organizations, profiles, or organization_members tables';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_validai_organizations_writes
  BEFORE INSERT OR UPDATE OR DELETE ON validai_organizations
  FOR EACH ROW EXECUTE FUNCTION prevent_legacy_writes();
```

**Tables Affected:** 3
**Risk:** LOW (prevents future misuse)
**Time:** 20 minutes

---

### 📋 PHASE 6: Drop Legacy Tables (Priority: FUTURE)

**Migration:** `20251103155000_drop_legacy_tables.sql` (OPTIONAL - DO NOT RUN YET)

**⚠️ WAIT 2-4 WEEKS AFTER PHASE 5**

**Changes:**
1. Verify no production errors from Phase 5 triggers
2. Drop foreign key constraint: `validai_organization_members_organization_id_fkey`
3. DROP TABLE `validai_profiles` CASCADE
4. DROP TABLE `validai_organization_members` CASCADE
5. DROP TABLE `validai_organizations` CASCADE
6. Regenerate TypeScript types
7. Remove legacy table references from documentation

**Tables Dropped:** 3
**Risk:** HIGH (irreversible)
**Time:** 10 minutes + verification time

**Prerequisites:**
- ✅ Phases 1-4 completed and tested
- ✅ Phase 5 running in production for 2+ weeks
- ✅ Zero errors from deprecation triggers
- ✅ All stakeholders approve final removal

---

## Verification Checklist

After each phase, verify:

### Phase 1-3 (Functions)
```sql
-- Verify functions updated
SELECT
  routine_name,
  CASE
    WHEN routine_definition LIKE '%validai_organizations%' THEN '❌ STILL USES LEGACY'
    WHEN routine_definition LIKE '%validai_profiles%' THEN '❌ STILL USES LEGACY'
    WHEN routine_definition LIKE '%validai_organization_members%' THEN '❌ STILL USES LEGACY'
    ELSE '✅ USES PLATFORM TABLES'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_available_llm_models',
    'get_llm_config_for_run',
    'set_organization_llm_config',
    'handle_new_user',
    'get_processor_with_operations',
    'get_user_processors',
    'get_user_processors_debug',
    'create_organization',
    'generate_unique_org_slug',
    'user_can_view_org_members'
  )
ORDER BY status, routine_name;
```

### Phase 4 (RLS Policies)
```sql
-- Verify policies updated
SELECT
  tablename,
  policyname,
  CASE
    WHEN qual LIKE '%validai_organization_members%' THEN '❌ STILL USES LEGACY'
    ELSE '✅ USES PLATFORM TABLE'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'validai_organizations'
ORDER BY status, policyname;
```

### Phase 5 (Deprecation)
```sql
-- Try to insert into legacy table (should fail with helpful error)
INSERT INTO validai_organizations (name, created_by)
VALUES ('Test Org', auth.uid());
-- Expected: ERROR with message about deprecated table
```

---

## Risk Assessment

### Overall Risk: LOW-MEDIUM

| Phase | Risk Level | Rollback Strategy |
|-------|-----------|-------------------|
| Phase 1 (LLM Functions) | **LOW** | Revert function to legacy table |
| Phase 2 (Profile Functions) | **MEDIUM** | Revert function + test user creation |
| Phase 3 (Org Functions) | **MEDIUM** | Revert function + test org creation |
| Phase 4 (RLS Policies) | **LOW** | Revert policy definitions |
| Phase 5 (Deprecation) | **LOW** | Drop triggers, remove comments |
| Phase 6 (Drop Tables) | **HIGH** | Cannot rollback - backup required |

### Mitigations

1. **Non-destructive migrations** - All phases except Phase 6 can be rolled back
2. **All data already migrated** - No risk of data loss
3. **Phased approach** - Can pause between phases if issues arise
4. **Verification steps** - Each phase includes SQL verification
5. **Deprecation period** - 2-4 week buffer before table deletion

---

## Execution Timeline

### Immediate (Today)
- ✅ **Phase 1** - Fix LLM config functions (CRITICAL - prevents data divergence)
- ✅ **Phase 2** - Fix profile functions (HIGH - affects user creation)
- ✅ **Phase 3** - Fix organization functions (HIGH - affects org creation)

### This Week
- ✅ **Phase 4** - Fix RLS policies (MEDIUM - improves access control)
- ✅ **Phase 5** - Deprecate tables (LOW - prevents future misuse)

### In 2-4 Weeks (After verification)
- ⏸️ **Phase 6** - Drop legacy tables (OPTIONAL - final cleanup)

---

## Success Criteria

### Phase 1-4 Complete When:
- ✅ Zero database functions reference legacy tables
- ✅ Zero RLS policies reference legacy tables (except policies ON legacy tables)
- ✅ All tests pass (user creation, org creation, LLM config)
- ✅ Elin can access all ValidAI features
- ✅ New users work correctly

### Phase 5 Complete When:
- ✅ Deprecation triggers in place
- ✅ Database comments added
- ✅ No production errors for 2 weeks

### Phase 6 Complete When:
- ✅ Legacy tables dropped
- ✅ TypeScript types regenerated
- ✅ No references in codebase
- ✅ All tests still pass

---

## Dependencies

### Before Starting:
- [x] Phase 2 migration (`20251103120001`) applied - 3 functions already migrated
- [x] Recent RLS fix (`20251103140000`) applied - 10 policies already fixed
- [x] All data migrated from legacy to platform tables

### External Dependencies:
- None - all changes are database-level
- No application code changes required
- TypeScript types regeneration only needed after Phase 6

---

## Notes

1. **Some functions already migrated** - Phase 2 migration (`20251103120001_phase2_fix_database_functions_use_platform_tables.sql`) already updated:
   - `validate_processor_ownership` ✅
   - `get_organization_members` ✅
   - `get_user_organizations_safe` ✅

2. **No data to migrate** - All data already exists in platform tables (verified)

3. **LLM config is NULL** - Both legacy and platform tables have NULL LLM configuration, so no risk of data inconsistency

4. **Conservative approach** - 6 phases with verification at each step, can pause anytime

5. **Rollback safety** - All phases except Phase 6 can be rolled back without data loss

---

## Appendix: Function Reference Counts

| Function Name | Legacy Table Referenced | Times Listed | Actually Needs Fix |
|--------------|------------------------|--------------|-------------------|
| `user_can_view_org_members` | validai_organization_members | 1 | ✅ YES |
| `validate_processor_ownership` | validai_organization_members | 1 | ❌ Already fixed Phase 2 |
| `create_organization` | validai_organizations | 1 | ✅ YES |
| `generate_unique_org_slug` | validai_organizations | 1 | ✅ YES |
| `get_available_llm_models` | validai_organizations | 1 | ✅ YES |
| `get_llm_config_for_run` | validai_organizations | 2 | ✅ YES (duplicate listing) |
| `get_user_organizations_safe` | validai_organizations | 1 | ❌ Already fixed Phase 2 |
| `handle_new_user` | validai_organizations | 1 | ✅ YES |
| `set_organization_llm_config` | validai_organizations | 1 | ✅ YES |
| `get_organization_members` | validai_profiles | 1 | ❌ Already fixed Phase 2 |
| `get_processor_with_operations` | validai_profiles | 1 | ✅ YES |
| `get_user_processors` | validai_profiles | 1 | ✅ YES |
| `get_user_processors_debug` | validai_profiles | 1 | ✅ YES |

**Total functions to fix in this cleanup:** 10 unique functions

---

**End of Plan**
