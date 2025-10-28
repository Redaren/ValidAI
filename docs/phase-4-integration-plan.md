# Phase 4: ValidAI Integration with Core Framework

**Status:** In Progress (Task 1/8 Complete)
**Created:** 2025-01-28
**Last Updated:** 2025-01-28
**Prerequisites:** Phase 3 MILESTONE Complete (All apps verified running independently)
**Duration:** 23 hours (~3 days)
**Risk Level:** 🟡 Medium (Incremental, well-tested approach)

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Integration Gaps Identified](#integration-gaps-identified)
3. [Integration Tasks](#integration-tasks)
4. [Success Criteria](#success-criteria)
5. [Timeline & Risk Assessment](#timeline--risk-assessment)
6. [Rollback Plan](#rollback-plan)

---

## Current State Analysis

### ✅ **What's Working (Phase 3 Complete)**

- **ValidAI App:** Runs independently with local auth/org implementations
- **Admin Portal:** Fully functional with framework packages
- **TestApp:** Reference implementation demonstrating framework integration
- **Database:** 21 tables (11 platform + 7 ValidAI + 3 shared)
- **ValidAI Tables:** Renamed with `validai_` prefix for clean separation
- **Core Framework:** Packages available in monorepo (`@playze/shared-*`)

### 🎯 **Integration Goal**

Replace ValidAI's local implementations with shared framework packages to:
- **Eliminate code duplication** (auth clients, org hooks, UI components)
- **Enable platform features** (multi-org support, authorization framework)
- **Improve maintainability** (one codebase for auth/org logic)
- **Ensure consistency** (same UX patterns across all apps)

---

## Integration Gaps Identified

| Component | ValidAI (Local) | Core Framework | Status |
|-----------|----------------|----------------|---------|
| **Supabase Clients** | `lib/supabase/client.ts`<br>`lib/supabase/server.ts` | `@playze/shared-auth/client`<br>`@playze/shared-auth/server` | ❌ Not integrated |
| **Auth Middleware** | `lib/supabase/middleware.ts`<br>(custom JWT enrichment) | `@playze/shared-auth/middleware`<br>(standard session refresh) | ❌ Not integrated |
| **Organization Hooks** | `app/queries/organizations/use-organizations.ts`<br>(5 custom hooks) | `@playze/shared-auth/hooks`<br>(10 framework hooks) | ❌ Duplicated |
| **TypeScript Types** | `lib/database.types.ts`<br>`stores/organization-store.ts` types | `@playze/shared-types`<br>(Organization, UserOrganization) | ✅ Integrated (Task 1 Complete) |
| **UI Components** | `components/ui/*`<br>(25+ local shadcn components) | `@playze/shared-ui/components/ui/*`<br>(19+ shared components) | ❌ Duplicated |
| **Organization Switcher** | `components/organization-switcher.tsx`<br>(custom Sidebar-based design) | `@playze/shared-ui/platform/org-switcher.tsx`<br>(framework component) | ⚠️ Need to adapt framework component |
| **Authorization** | Basic role check:<br>`canManageOrganization()` in store | Full framework:<br>`useAuthorization('validai')`<br>`useFeatureAccess()`<br>`usePermission()`<br>`AuthGate` component | ❌ Missing features |
| **State Management** | Zustand store +<br>React Query | React Query only<br>(5-min cache) | ⚠️ Hybrid approach |

---

## Integration Tasks

### Task 1: Adopt Shared Types (2 hours) ✅ COMPLETE

**Priority:** 🔴 HIGH - Foundation for all other tasks
**Complexity:** 🟢 Low
**Risk:** 🟢 Low (TypeScript will catch issues)
**Status:** ✅ **COMPLETE** (2025-01-28)

#### **Objective**
Replace local type definitions with shared types from `@playze/shared-types`.

#### **Actions**

1. **Add dependency to package.json**
   ```bash
   # Already in workspace, just verify it's imported
   cd apps/validai
   # Check package.json has "@playze/shared-types": "workspace:*"
   ```

2. **Replace Organization type in store**

   **File:** `apps/validai/stores/organization-store.ts`
   ```typescript
   // Before
   export interface Organization {
     id: string
     name: string
     slug: string
     // ... local definition
   }

   // After
   import type { Organization } from '@playze/shared-types'
   // Remove local interface
   ```

3. **Update database types import**

   **File:** Multiple files importing from `lib/database.types.ts`
   ```typescript
   // Before
   import type { Database } from '@/lib/database.types'

   // After
   import type { Database } from '@playze/shared-types'
   ```

4. **Update query files**

   **File:** `apps/validai/app/queries/organizations/use-organizations.ts`
   ```typescript
   // Add import
   import type { Organization, UserOrganization } from '@playze/shared-types'
   ```

#### **Files to Modify**
- `apps/validai/stores/organization-store.ts` (import Organization type)
- `apps/validai/app/queries/organizations/use-organizations.ts` (type imports)
- All files importing from `@/lib/database.types` (~15-20 files)

#### **Verification Steps**
- [x] Run `pnpm --filter @playze/validai typecheck`
- [x] TypeScript compiles without errors (database type errors resolved)
- [x] No local Organization type definitions remain
- [x] All imports resolve correctly

#### **Completion Criteria**
✅ All TypeScript type errors resolved
✅ No local duplicate type definitions
✅ App builds successfully

#### **Completion Summary**

**Date Completed:** 2025-01-28

**Changes Made:**
1. ✅ Added `@playze/shared-types` dependency to [apps/validai/package.json](../apps/validai/package.json)
2. ✅ Fixed shared-types project ID (xczippkxxdqlvaacjexj) and regenerated types
3. ✅ Updated 16 files to import from `@playze/shared-types` instead of `@/lib/database.types`
4. ✅ Fixed table name references: `runs` → `validai_runs`, `operation_results` → `validai_operation_results` (14 occurrences across 10 files)

**Verification:**
- ✅ All database type errors resolved
- ✅ No remaining references to `@/lib/database.types`
- ✅ All ValidAI tables correctly use `validai_` prefix
- ⚠️ 4 pre-existing Zod/hookform resolver errors (unrelated to this task)

**Next:** Task 2 - Adopt Shared Auth (Clients & Middleware)

---

### Task 2: Adopt Shared Auth (Clients & Middleware) (4 hours)

**Priority:** 🔴 HIGH - Core infrastructure
**Complexity:** 🟡 Medium
**Risk:** 🟡 Medium (Auth is critical, test thoroughly)

#### **Objective**
Replace local Supabase client implementations with shared clients from `@playze/shared-auth`.

#### **Actions**

1. **Add dependency to package.json**
   ```json
   // apps/validai/package.json
   {
     "dependencies": {
       "@playze/shared-auth": "workspace:*"
     }
   }
   ```

2. **Replace browser client usage**

   **Find all files using:** `@/lib/supabase/client`
   ```bash
   # Search command
   grep -r "from '@/lib/supabase/client'" apps/validai
   ```

   **Replace with:**
   ```typescript
   // Before
   import { createClient } from '@/lib/supabase/client'
   const supabase = createClient()

   // After
   import { createBrowserClient } from '@playze/shared-auth/client'
   const supabase = createBrowserClient()
   ```

3. **Replace server client usage**

   **Find all files using:** `@/lib/supabase/server`
   ```bash
   grep -r "from '@/lib/supabase/server'" apps/validai
   ```

   **Replace with:**
   ```typescript
   // Before
   import { createClient } from '@/lib/supabase/server'
   const supabase = await createClient()

   // After
   import { createServerClient } from '@playze/shared-auth/server'
   const supabase = await createServerClient()
   ```

4. **Update middleware**

   **File:** `apps/validai/middleware.ts`

   **Current implementation:** Custom JWT enrichment with enrich-jwt Edge Function

   **Replace with:**
   ```typescript
   import { updateSession } from '@playze/shared-auth/middleware'
   import { type NextRequest } from 'next/server'

   export async function middleware(request: NextRequest) {
     return await updateSession(request)
   }

   export const config = {
     matcher: [
       "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
     ],
   }
   ```

   **Note:** Remove custom JWT enrichment logic. The framework uses `switch-organization` Edge Function for org switching instead.

5. **Delete local Supabase directory**
   ```bash
   # After verifying all imports updated
   rm -rf apps/validai/lib/supabase/
   ```

#### **Files to Modify**
- `apps/validai/package.json` (add dependency)
- `apps/validai/middleware.ts` (replace entire implementation)
- All files importing from `@/lib/supabase/*` (~50+ files estimated)

#### **Key Changes**
| Local Function | Shared Function | Notes |
|----------------|----------------|-------|
| `createClient()` (browser) | `createBrowserClient()` | Same API, typed |
| `createClient()` (server) | `createServerClient()` | Same API, async |
| `updateSession()` (middleware) | `updateSession()` from shared-auth | Standard implementation |

#### **Verification Steps**
- [ ] Run `pnpm --filter @playze/validai build`
- [ ] Login flow works (visit /auth/login)
- [ ] Session persists across page reloads
- [ ] Middleware redirects unauthenticated users to /auth/login
- [ ] Protected routes require authentication
- [ ] No console errors in browser

#### **Completion Criteria**
✅ All imports updated to `@playze/shared-auth`
✅ Login/logout functionality works
✅ Session management works correctly
✅ No local Supabase client files remain

---

### Task 3: Adopt Shared Auth Hooks (3 hours)

**Priority:** 🔴 HIGH - Remove duplication
**Complexity:** 🟡 Medium
**Risk:** 🟡 Medium (Data fetching patterns change)

#### **Objective**
Replace local organization query hooks with shared hooks from `@playze/shared-auth/hooks`.

#### **Actions**

1. **Understand the shared hooks API**

   **Framework provides:**
   ```typescript
   import {
     useAuth,                    // Get current user
     useCurrentOrganization,     // Get active organization
     useUserOrganizations,       // Get all user's orgs
     useSwitchOrganization,      // Switch org context
     useAuthorization,           // Get authorization context
     useFeatureAccess,           // Check tier-based feature
     usePermission,              // Check role-based permission
     useHasRole,                 // Check user's role
     useOrganizationApps         // Get org's app subscriptions
   } from '@playze/shared-auth'
   ```

2. **Hook Migration Map**

   | Local Hook (ValidAI) | Shared Hook (Framework) | Action |
   |----------------------|------------------------|--------|
   | `useCurrentOrganization()` | `useCurrentOrganization()` | ✅ Replace (same API) |
   | `useUserOrganizations()` | `useUserOrganizations()` | ✅ Replace (same API) |
   | `useSwitchOrganization()` | `useSwitchOrganization()` | ✅ Replace (same API) |
   | `useOrganizationMembers(orgId)` | N/A | ⚠️ Keep local (ValidAI-specific) |
   | `useCreateOrganization()` | N/A | ❌ Remove (admin-only in MVP) |
   | `useInviteUser()` | N/A | ❌ Remove (admin-only in MVP) |

3. **Update organization switcher component**

   **File:** `apps/validai/components/organization-switcher.tsx`

   **Current imports:**
   ```typescript
   import {
     useCurrentOrganization,
     useUserOrganizations,
     useSwitchOrganization
   } from "@/app/queries/organizations/use-organizations"
   ```

   **Replace with:**
   ```typescript
   import {
     useCurrentOrganization,
     useUserOrganizations,
     useSwitchOrganization
   } from '@playze/shared-auth'
   ```

   **Important:** Keep the existing component UI/UX as-is. The shared hooks have the same API, just replace the import source.

4. **Handle return type differences**

   **Shared hook returns:**
   ```typescript
   // useCurrentOrganization()
   const { data: org } = useCurrentOrganization()
   // org is Organization | null

   // useUserOrganizations()
   const { data: orgs } = useUserOrganizations()
   // orgs is UserOrganization[] (has organization_id, organization_name, user_role)
   ```

   **Update component logic if needed:**
   ```typescript
   // Local version returns: { organizations: [...] }
   const { data: userOrgsData } = useUserOrganizations()
   const userOrgs = userOrgsData?.organizations || []

   // Shared version returns: [...] directly
   const { data: userOrgs } = useUserOrganizations()
   // userOrgs is already the array
   ```

5. **Decide on organization-store.ts fate**

   **Option A (Recommended):** Remove entirely, rely on React Query caching
   - Shared hooks use TanStack Query with 2-5 minute stale time
   - No need for Zustand to duplicate this caching
   - Simpler architecture

   **Option B:** Keep for UI-only state
   - Remove `currentOrganization`, `userOrganizations` (duplicates React Query)
   - Keep `isSwitching` flag for loading indicators
   - Keep helper methods like `canManageOrganization()` if needed

   **Recommendation:** Choose Option A unless there's a strong reason for UI state management.

6. **Update all components using org hooks**

   **Search for usage:**
   ```bash
   grep -r "useCurrentOrganization\|useUserOrganizations\|useSwitchOrganization" apps/validai/components
   grep -r "useOrganizationStore" apps/validai/components
   ```

   **Update each component to:**
   - Import from `@playze/shared-auth`
   - Remove Zustand store usage (if going with Option A)
   - Update loading state handling

7. **Delete local organization queries**
   ```bash
   # After verifying all components updated
   rm -rf apps/validai/app/queries/organizations/

   # If choosing Option A
   rm apps/validai/stores/organization-store.ts
   # Update apps/validai/stores/index.ts to remove export
   ```

#### **Files to Modify**
- `apps/validai/components/organization-switcher.tsx` (update imports)
- `apps/validai/stores/organization-store.ts` (remove or refactor)
- `apps/validai/stores/index.ts` (remove export if deleted)
- All components using org hooks (~5-10 files)

#### **Verification Steps**
- [ ] Organization switcher renders correctly
- [ ] Current organization displays in sidebar
- [ ] User can switch between organizations
- [ ] Switching organizations:
  - [ ] Updates JWT metadata via Edge Function
  - [ ] Refreshes session
  - [ ] Reloads page with new context
  - [ ] All queries refetch with new org_id
- [ ] No duplicate network requests (check Network tab)
- [ ] React Query DevTools shows cached data

#### **Completion Criteria**
✅ All org hooks imported from `@playze/shared-auth`
✅ Organization switching works correctly
✅ No local `app/queries/organizations/` directory
✅ Store refactored or removed (based on chosen option)

---

### Task 4: Adopt Shared UI Components (4 hours)

**Priority:** 🟡 MEDIUM - Quality & consistency
**Complexity:** 🟢 Low-Medium
**Risk:** 🟢 Low (Visual changes, easy to revert)

#### **Objective**
Replace duplicate shadcn/ui components with shared components from `@playze/shared-ui`.

#### **Actions**

1. **Add dependency to package.json**
   ```json
   // apps/validai/package.json
   {
     "dependencies": {
       "@playze/shared-ui": "workspace:*"
     }
   }
   ```

2. **Identify overlapping components**

   **Shared UI provides (19+ components):**
   - Badge, Button, Card, Checkbox, Dropdown Menu
   - Input, Label, Alert, Table, Dialog
   - Select, Tabs, Textarea, Switch, Avatar
   - And more...

   **ValidAI has (25+ components in `components/ui/`):**
   - Same components as above (duplicates)
   - Plus app-specific: Progress, Chart, Slider, Collapsible, Sidebar, Accordion, Tooltip, Separator, Breadcrumb, Sheet, Skeleton, Dropzone

   **Strategy:**
   - ✅ Replace: Button, Card, Input, Label, Badge, Dialog, Dropdown Menu, Select, Checkbox, Switch, Textarea, Avatar, Table, Alert, Tabs
   - ⚠️ Evaluate: Progress, Chart, Slider, Tooltip, Separator (check if shared-ui has these)
   - ❌ Keep: ValidAI-specific components (if any customizations exist)

3. **Replace component imports systematically**

   **Example migration:**
   ```typescript
   // Before
   import { Button } from '@/components/ui/button'
   import { Card, CardContent, CardHeader } from '@/components/ui/card'
   import { Input } from '@/components/ui/input'

   // After
   import { Button } from '@playze/shared-ui'
   import { Card, CardContent, CardHeader } from '@playze/shared-ui'
   import { Input } from '@playze/shared-ui'
   ```

   **Batch replace strategy:**
   ```bash
   # Find all files importing UI components
   grep -r "from '@/components/ui/" apps/validai/components
   grep -r "from '@/components/ui/" apps/validai/app

   # Use find-and-replace in IDE for each component
   ```

4. **Check for style regressions**

   After replacing each component:
   - Run dev server: `pnpm --filter @playze/validai dev`
   - Visually check affected pages
   - Test interactive components (buttons, dialogs, forms)
   - Verify theme switching still works

5. **Update Tailwind configuration (if needed)**

   **File:** `apps/validai/tailwind.config.ts`

   Shared UI might require specific Tailwind theme configuration. Check if any adjustments needed.

6. **Delete duplicate UI component files**
   ```bash
   # Only delete components you've migrated and verified
   # Do NOT delete app-specific components

   # Example (after migration complete)
   rm apps/validai/components/ui/button.tsx
   rm apps/validai/components/ui/card.tsx
   rm apps/validai/components/ui/input.tsx
   # ... etc
   ```

#### **Files to Modify**
- `apps/validai/package.json` (add dependency)
- ~100+ files importing from `@/components/ui/*`
- `apps/validai/tailwind.config.ts` (possibly)

#### **Migration Priority Order**
1. **Phase 1:** Core components (Button, Input, Label) - test immediately
2. **Phase 2:** Layout components (Card, Dialog, Dropdown Menu)
3. **Phase 3:** Form components (Select, Checkbox, Switch, Textarea)
4. **Phase 4:** Data display (Table, Badge, Avatar)
5. **Phase 5:** Specialized (remaining components)

#### **Verification Steps**
- [ ] App renders with no visual regressions
- [ ] All interactive components work (clicks, hovers, focus)
- [ ] Forms still function correctly
- [ ] Theme switching works (light/dark mode)
- [ ] No TypeScript errors
- [ ] No console warnings/errors

#### **Completion Criteria**
✅ Core UI components imported from `@playze/shared-ui`
✅ Visual consistency maintained
✅ All interactions work correctly
✅ Duplicate files deleted (migrated components only)

---

### Task 5: Adapt OrgSwitcher Component (1 hour)

**Priority:** 🟡 MEDIUM - Platform consistency with ValidAI UX
**Complexity:** 🟢 Low
**Risk:** 🟢 Low

#### **Objective**
Use shared org hooks while maintaining ValidAI's current OrgSwitcher design and user experience.

#### **Current ValidAI Implementation**
- **Location:** `apps/validai/components/organization-switcher.tsx`
- **Design:** Sidebar-based dropdown with Building2 icon, org name, slogan
- **Features:** Switch orgs, create org, manage org settings
- **Dependencies:** Local hooks from `@/app/queries/organizations/use-organizations`

#### **Framework Implementation**
- **Location:** `@playze/shared-ui/platform/org-switcher.tsx`
- **Design:** Simple button-based dropdown
- **Features:** Switch orgs only (minimal)
- **Dependencies:** Shared hooks from `@playze/shared-auth`

#### **Strategy**
**Keep ValidAI's UI/UX, adopt shared hooks only.**

Do NOT replace the entire component. Instead, update the imports to use shared hooks.

#### **Actions**

1. **Update component imports**

   **File:** `apps/validai/components/organization-switcher.tsx`

   **Before:**
   ```typescript
   import {
     useCurrentOrganization,
     useUserOrganizations,
     useSwitchOrganization
   } from "@/app/queries/organizations/use-organizations"
   import { useOrganizationStore } from "@/stores"
   ```

   **After:**
   ```typescript
   import {
     useCurrentOrganization,
     useUserOrganizations,
     useSwitchOrganization
   } from '@playze/shared-auth'
   // Remove useOrganizationStore if store is deleted (Task 3)
   ```

2. **Handle return type differences**

   **Shared hooks return:**
   ```typescript
   // useCurrentOrganization() returns Organization | null directly
   const { data: currentOrg } = useCurrentOrganization()
   // Use: currentOrg?.name

   // useUserOrganizations() returns UserOrganization[] directly
   const { data: userOrgs } = useUserOrganizations()
   // Use: userOrgs?.map(org => org.organization_name)
   ```

   **Update component logic:**
   ```typescript
   // Before
   const { data: currentOrgData } = useCurrentOrganization()
   const currentOrg = currentOrgData?.organization

   const { data: userOrgsData } = useUserOrganizations()
   const userOrgs = userOrgsData?.organizations || []

   // After
   const { data: currentOrg } = useCurrentOrganization()
   const { data: userOrgs = [] } = useUserOrganizations()
   ```

3. **Update organization switching logic**

   **Shared hook expects:**
   ```typescript
   const switchOrg = useSwitchOrganization()

   // Call with: { organizationId: string }
   await switchOrg.mutateAsync({ organizationId: orgId })
   ```

   **Update existing handler:**
   ```typescript
   const handleSwitchOrganization = async (orgId: string) => {
     if (orgId === currentOrg?.id) return

     try {
       // Update to match shared hook signature
       await switchOrgMutation.mutateAsync({ organizationId: orgId })
     } catch (error) {
       console.error('Failed to switch organization:', error)
       // TODO: Show error notification
     }
   }
   ```

4. **Handle loading states**

   ```typescript
   // Shared hooks provide loading states
   const { data: currentOrg, isLoading: currentLoading } = useCurrentOrganization()
   const { data: userOrgs, isLoading: orgsLoading } = useUserOrganizations()
   const switchOrg = useSwitchOrganization()

   const isLoading = currentLoading || orgsLoading
   const isSwitching = switchOrg.isPending
   ```

5. **Keep existing UI structure**

   Maintain:
   - ✅ SidebarMenu/SidebarMenuItem wrapper
   - ✅ Building2 icon
   - ✅ Organization name + slogan display
   - ✅ "Create Organization" option (update link or remove if admin-only)
   - ✅ "Organization Settings" option
   - ✅ Active org indicator (dot)
   - ✅ Mobile/desktop layout handling

6. **Remove "Create Organization" if admin-only**

   In MVP, only platform admins can create organizations. Consider:
   - **Option A:** Remove "Create Organization" menu item
   - **Option B:** Show "Contact Admin" instead
   - **Option C:** Keep link but show access gate

#### **Files to Modify**
- `apps/validai/components/organization-switcher.tsx` (update imports and logic)

#### **Verification Steps**
- [ ] Org switcher renders in sidebar
- [ ] Current organization displays correctly
- [ ] Dropdown shows all user's organizations
- [ ] Switching organizations works:
  - [ ] Calls Edge Function
  - [ ] Updates JWT
  - [ ] Refreshes page
  - [ ] New org context applied
- [ ] Active org indicator shows correctly
- [ ] Loading states work
- [ ] Mobile layout works (if applicable)

#### **Completion Criteria**
✅ Component uses shared hooks
✅ Visual design unchanged
✅ All functionality works
✅ User experience preserved

---

### Task 6: Implement Authorization Framework (5 hours)

**Priority:** 🔴 HIGH - Security & feature gating
**Complexity:** 🔴 High
**Risk:** 🟡 Medium (New functionality, thorough testing required)

#### **Objective**
Implement tier-based feature gating and role-based permission system using the framework's authorization infrastructure.

#### **Background**

The framework provides a **dual authorization model**:

1. **Tier-based features** (subscription model)
   - Features controlled by organization's app subscription tier
   - Example: "export_reports" only available in Pro tier

2. **Role-based permissions** (user capability model)
   - Permissions controlled by user's role in the organization
   - Example: "can_edit" for admin/member, not viewer

**Benefits:**
- 🚀 ONE database query for all authorization checks (via `get_user_authorization()`)
- ♻️ 5-minute cache via TanStack Query
- 🔒 Dual gating: tier + role
- 📦 Clean separation: framework provides hooks, apps use them

#### **Actions**

##### **Step 1: Register ValidAI App in Database (30 min)**

**Check if already registered:**
```sql
SELECT * FROM apps WHERE id = 'validai';
```

**If not registered, create migration:**

**File:** `supabase/migrations/YYYYMMDD_register_validai_app.sql`

```sql
-- =============================================================================
-- VALIDAI APP REGISTRATION
-- =============================================================================
-- Description: Register ValidAI app with tiers and role permissions
-- Created: 2025-01-28
-- =============================================================================

-- Register ValidAI application
INSERT INTO apps (id, name, description, is_active)
VALUES (
  'validai',
  'ValidAI',
  'Document processing and AI validation platform',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Define subscription tiers
INSERT INTO app_tiers (app_id, tier_name, display_name, features, limits)
VALUES
  -- Free Tier
  (
    'validai',
    'free',
    'Free',
    jsonb_build_object(
      'basic_processing', true,
      'document_upload', true
    ),
    jsonb_build_object(
      'documents', 10,
      'processors', 3,
      'operations_per_processor', 5,
      'runs_per_month', 50
    )
  ),
  -- Pro Tier
  (
    'validai',
    'pro',
    'Professional',
    jsonb_build_object(
      'basic_processing', true,
      'document_upload', true,
      'advanced_ai', true,
      'export_reports', true,
      'batch_processing', true,
      'api_access', true
    ),
    jsonb_build_object(
      'documents', 500,
      'processors', 50,
      'operations_per_processor', 50,
      'runs_per_month', 5000
    )
  ),
  -- Enterprise Tier
  (
    'validai',
    'enterprise',
    'Enterprise',
    jsonb_build_object(
      'basic_processing', true,
      'document_upload', true,
      'advanced_ai', true,
      'export_reports', true,
      'batch_processing', true,
      'api_access', true,
      'custom_models', true,
      'dedicated_support', true,
      'sla_guarantee', true,
      'custom_integrations', true
    ),
    jsonb_build_object(
      'documents', -1,
      'processors', -1,
      'operations_per_processor', -1,
      'runs_per_month', -1
    )
  )
ON CONFLICT (app_id, tier_name) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  updated_at = now();

-- Define role-based permissions
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES
  -- Owner: Full control
  (
    'validai',
    'owner',
    jsonb_build_object(
      'can_view', true,
      'can_edit', true,
      'can_delete', true,
      'can_execute', true,
      'can_export', true,
      'can_manage_settings', true,
      'can_manage_members', true
    )
  ),
  -- Admin: Management without org deletion
  (
    'validai',
    'admin',
    jsonb_build_object(
      'can_view', true,
      'can_edit', true,
      'can_delete', true,
      'can_execute', true,
      'can_export', true,
      'can_manage_settings', true,
      'can_manage_members', false
    )
  ),
  -- Member: Standard operations
  (
    'validai',
    'member',
    jsonb_build_object(
      'can_view', true,
      'can_edit', true,
      'can_delete', false,
      'can_execute', true,
      'can_export', false,
      'can_manage_settings', false,
      'can_manage_members', false
    )
  ),
  -- Viewer: Read-only
  (
    'validai',
    'viewer',
    jsonb_build_object(
      'can_view', true,
      'can_edit', false,
      'can_delete', false,
      'can_execute', false,
      'can_export', false,
      'can_manage_settings', false,
      'can_manage_members', false
    )
  )
ON CONFLICT (app_id, role) DO UPDATE
SET
  permissions = EXCLUDED.permissions,
  updated_at = now();

-- Assign active subscription to existing organizations (if needed)
-- This gives all current orgs access to ValidAI Pro tier
INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  tier_name,
  status
)
SELECT
  o.id,
  'validai',
  (SELECT id FROM app_tiers WHERE app_id = 'validai' AND tier_name = 'pro'),
  'pro',
  'active'
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM organization_app_subscriptions
  WHERE organization_id = o.id AND app_id = 'validai'
);
```

**Apply migration:**
```bash
npx supabase db push
```

##### **Step 2: Update Middleware for App Access Check (30 min)**

**File:** `apps/validai/middleware.ts`

Add check to ensure user's organization has access to ValidAI.

```typescript
import { updateSession } from '@playze/shared-auth/middleware'
import { createServerClient } from '@playze/shared-auth/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // First, update session (handles auth)
  const response = await updateSession(request)

  // Skip access check for auth routes
  if (request.nextUrl.pathname.startsWith('/auth')) {
    return response
  }

  // Check if user has ValidAI access
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Call authorization function to check app access
    const { data: auth, error } = await supabase
      .rpc('get_user_authorization', {
        p_org_id: null, // Use current org from JWT
        p_app_id: 'validai'
      })
      .maybeSingle()

    if (error || !auth) {
      // User's organization doesn't have ValidAI access
      const url = request.nextUrl.clone()
      url.pathname = '/no-access'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|no-access|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

##### **Step 3: Create No Access Page (15 min)**

**File:** `apps/validai/app/no-access/page.tsx`

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@playze/shared-ui'
import { Button } from '@playze/shared-ui'
import { AlertCircle } from 'lucide-react'

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>No Access to ValidAI</CardTitle>
          </div>
          <CardDescription>
            Your organization doesn't have an active ValidAI subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ValidAI is available on Pro and Enterprise plans. Contact your organization
            administrator or platform support to upgrade your subscription.
          </p>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={() => window.location.href = 'mailto:support@example.com?subject=ValidAI Access Request'}
            >
              Contact Support
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = '/'}
            >
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

##### **Step 4: Implement Authorization Hooks in Components (2 hours)**

**Use the primary authorization hook:**

```typescript
import { useAuthorization } from '@playze/shared-auth'

function MyComponent() {
  const { data: auth, isLoading } = useAuthorization('validai')

  if (isLoading) return <div>Loading...</div>

  // Access all authorization context:
  auth.user_role           // 'owner' | 'admin' | 'member' | 'viewer'
  auth.tier_name           // 'free' | 'pro' | 'enterprise'
  auth.tier_features       // { advanced_ai: true, export_reports: true, ... }
  auth.role_permissions    // { can_edit: true, can_delete: false, ... }
  auth.tier_limits         // { documents: 500, processors: 50, ... }
  auth.current_usage       // { documents: 125, processors: 12, ... }
}
```

**Or use convenience hooks:**

```typescript
import { useFeatureAccess, usePermission, useHasRole } from '@playze/shared-auth'

// Check tier-based feature
const { data: hasAdvancedAI } = useFeatureAccess('validai', 'advanced_ai')

// Check role-based permission
const { data: canEdit } = usePermission('validai', 'can_edit')

// Check user's role
const { data: isAdmin } = useHasRole('validai', ['owner', 'admin'])
```

**Components to update:**

1. **Export functionality** (Pro tier feature)
2. **Advanced AI processing** (Pro tier feature)
3. **Batch processing** (Pro tier feature)
4. **Edit operations** (Member+ permission)
5. **Delete operations** (Admin+ permission)
6. **Settings management** (Admin+ permission)

##### **Step 5: Add AuthGate Components (2 hours)**

**Import:**
```typescript
import { AuthGate } from '@playze/shared-ui'
```

**Usage patterns:**

**Pattern 1: Tier-based feature gate**
```typescript
// Example: Export button (Pro tier only)
<AuthGate appId="validai" feature="export_reports">
  <Button onClick={handleExport}>
    <Download className="h-4 w-4 mr-2" />
    Export Report
  </Button>
</AuthGate>
```

**Pattern 2: Role-based permission gate**
```typescript
// Example: Edit button (requires can_edit permission)
<AuthGate appId="validai" permission="can_edit">
  <Button onClick={handleEdit}>
    <Edit className="h-4 w-4 mr-2" />
    Edit Processor
  </Button>
</AuthGate>
```

**Pattern 3: Role requirement**
```typescript
// Example: Settings panel (Admin+ only)
<AuthGate appId="validai" role={['owner', 'admin']}>
  <SettingsPanel />
</AuthGate>
```

**Pattern 4: Combined (tier + permission)**
```typescript
// Example: Advanced export (Pro tier + can_export permission)
<AuthGate
  appId="validai"
  feature="export_reports"
  permission="can_export"
  requireAll={true}
>
  <AdvancedExportDialog />
</AuthGate>
```

**Pattern 5: Custom fallback**
```typescript
<AuthGate
  appId="validai"
  feature="advanced_ai"
  fallback={
    <Card>
      <CardHeader>
        <CardTitle>Advanced AI Processing</CardTitle>
        <CardDescription>Available in Pro plan</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => window.location.href = 'mailto:support@example.com'}>
          Contact Sales
        </Button>
      </CardContent>
    </Card>
  }
>
  <AdvancedAIProcessor />
</AuthGate>
```

**Recommended locations for AuthGate:**

| Component | Gate Type | Condition |
|-----------|-----------|-----------|
| Export buttons | Feature | `feature="export_reports"` |
| Advanced AI toggle | Feature | `feature="advanced_ai"` |
| Batch processing | Feature | `feature="batch_processing"` |
| Edit processor dialog | Permission | `permission="can_edit"` |
| Delete processor button | Permission | `permission="can_delete"` |
| Settings page | Permission | `permission="can_manage_settings"` |
| Run processor button | Permission | `permission="can_execute"` |

#### **Files to Create**
- `supabase/migrations/YYYYMMDD_register_validai_app.sql`
- `apps/validai/app/no-access/page.tsx`

#### **Files to Modify**
- `apps/validai/middleware.ts` (add app access check)
- Protected feature components (add AuthGate wrapping)
- Settings/admin pages (add role checks)

#### **Verification Steps**
- [ ] ValidAI app registered in database
- [ ] Tiers defined (free, pro, enterprise)
- [ ] Role permissions defined (owner, admin, member, viewer)
- [ ] All orgs have active subscriptions
- [ ] Middleware checks app access
- [ ] No-access page displays for unauthorized users
- [ ] Free tier users see limited features
- [ ] Pro tier users see all features
- [ ] Viewers cannot edit/delete
- [ ] Members can edit but not delete
- [ ] Admins/owners see settings

#### **Testing Checklist**

**Tier-based testing:**
- [ ] Create test org with Free tier → limited features visible
- [ ] Upgrade to Pro tier → all features visible
- [ ] Downgrade to Free → features hidden again

**Role-based testing:**
- [ ] Viewer: Can view, cannot edit/execute/export
- [ ] Member: Can view/edit/execute, cannot delete/export
- [ ] Admin: Can do everything except manage members
- [ ] Owner: Full access

**Edge cases:**
- [ ] No subscription → redirect to no-access page
- [ ] Inactive subscription → redirect to no-access page
- [ ] User switches to org without ValidAI → redirect to no-access page

#### **Completion Criteria**
✅ ValidAI registered in app catalog
✅ Tiers and permissions configured
✅ Middleware enforces app access
✅ Feature gating works (tier-based)
✅ Permission gating works (role-based)
✅ All authorization checks use framework hooks

---

### Task 7: Update RLS Policies (2 hours)

**Priority:** 🔴 HIGH - Security
**Complexity:** 🟡 Medium
**Risk:** 🟡 Medium (Database security changes)

#### **Objective**
Ensure all ValidAI tables enforce app access via RLS policies using `has_app_access('validai')`.

#### **Background**

**Standard RLS pattern for app tables:**
```sql
CREATE POLICY "policy_name"
  ON app_table
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );
```

**This ensures:**
1. User can only access data from their current organization
2. User's organization must have an active ValidAI subscription

#### **Actions**

##### **Step 1: Audit Existing RLS Policies (30 min)**

**Check all ValidAI tables:**
```sql
-- List all ValidAI tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'validai_%';
```

**For each table, check RLS status:**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'validai_documents';

-- View existing policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'validai_%'
ORDER BY tablename, policyname;
```

##### **Step 2: Create Migration to Update Policies (1 hour)**

**File:** `supabase/migrations/YYYYMMDD_update_validai_rls_policies.sql`

```sql
-- =============================================================================
-- UPDATE VALIDAI RLS POLICIES WITH APP ACCESS CHECK
-- =============================================================================
-- Description: Add has_app_access('validai') check to all ValidAI table policies
-- Created: 2025-01-28
-- =============================================================================

-- Drop existing policies (will be recreated with app access check)
-- Note: Only drop if they exist

-- validai_documents
DROP POLICY IF EXISTS "Users access documents in their org" ON validai_documents;

CREATE POLICY "Users access documents in their org with app access"
  ON validai_documents
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- validai_processors
DROP POLICY IF EXISTS "Users access processors in their org" ON validai_processors;

CREATE POLICY "Users access processors in their org with app access"
  ON validai_processors
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- validai_operations
DROP POLICY IF EXISTS "Users access operations in their org" ON validai_operations;

CREATE POLICY "Users access operations in their org with app access"
  ON validai_operations
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- validai_runs
DROP POLICY IF EXISTS "Users access runs in their org" ON validai_runs;

CREATE POLICY "Users access runs in their org with app access"
  ON validai_runs
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- validai_operation_results
DROP POLICY IF EXISTS "Users access operation results in their org" ON validai_operation_results;

CREATE POLICY "Users access operation results in their org with app access"
  ON validai_operation_results
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- validai_workbench_executions
DROP POLICY IF EXISTS "Users access workbench executions in their org" ON validai_workbench_executions;

CREATE POLICY "Users access workbench executions in their org with app access"
  ON validai_workbench_executions
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- validai_llm_global_settings
DROP POLICY IF EXISTS "Users access LLM settings in their org" ON validai_llm_global_settings;

CREATE POLICY "Users access LLM settings in their org with app access"
  ON validai_llm_global_settings
  FOR ALL
  USING (
    organization_id = public.user_organization_id()
    AND public.has_app_access('validai')
  );

-- Verify all tables have RLS enabled
DO $$
BEGIN
  -- Enable RLS on all ValidAI tables (idempotent)
  ALTER TABLE validai_documents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE validai_processors ENABLE ROW LEVEL SECURITY;
  ALTER TABLE validai_operations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE validai_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE validai_operation_results ENABLE ROW LEVEL SECURITY;
  ALTER TABLE validai_workbench_executions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE validai_llm_global_settings ENABLE ROW LEVEL SECURITY;

  RAISE NOTICE 'All ValidAI tables have RLS enabled with app access check';
END $$;
```

**Apply migration:**
```bash
npx supabase db push
```

##### **Step 3: Test RLS Enforcement (30 min)**

**Test scenarios:**

1. **Multi-org data isolation**
   ```sql
   -- As user in Org A, try to access Org B's data
   -- Should return empty result set
   ```

2. **Subscription status enforcement**
   ```sql
   -- Deactivate subscription
   UPDATE organization_app_subscriptions
   SET status = 'inactive'
   WHERE organization_id = 'test-org-id' AND app_id = 'validai';

   -- Try to query ValidAI tables
   -- Should return empty result set or error
   ```

3. **Organization switching**
   ```sql
   -- Switch to different org
   -- Should see different data set
   ```

**Manual testing via app:**
- [ ] Log in as user in Org A
- [ ] Create a document
- [ ] Switch to Org B (if user belongs to multiple orgs)
- [ ] Verify Org A's document not visible
- [ ] Create a document in Org B
- [ ] Switch back to Org A
- [ ] Verify only Org A's documents visible

#### **Files to Create**
- `supabase/migrations/YYYYMMDD_update_validai_rls_policies.sql`

#### **Verification Steps**
- [ ] All ValidAI tables have RLS enabled
- [ ] All policies include `has_app_access('validai')` check
- [ ] All policies include `user_organization_id()` check
- [ ] Users can only see their org's data
- [ ] Users without active subscription cannot access data
- [ ] Organization switching updates data visibility
- [ ] No SQL errors in application

#### **Completion Criteria**
✅ All ValidAI tables protected by RLS
✅ App access check enforced in all policies
✅ Multi-org data isolation verified
✅ Subscription status enforcement verified

---

### Task 8: Clean Up & Documentation (2 hours)

**Priority:** 🟡 MEDIUM - Code quality
**Complexity:** 🟢 Low
**Risk:** 🟢 Low

#### **Objective**
Remove unused local implementations, update documentation, and create integration notes for the team.

#### **Actions**

##### **Step 1: Delete Unused Local Files (30 min)**

**Files/directories to delete:**

```bash
# Supabase client implementations (replaced by shared-auth)
rm -rf apps/validai/lib/supabase/

# Local database types (replaced by shared-types)
rm apps/validai/lib/database.types.ts

# Organization queries (replaced by shared-auth hooks)
rm -rf apps/validai/app/queries/organizations/

# Organization store (if removed in Task 3)
# Only delete if you chose Option A
rm apps/validai/stores/organization-store.ts

# Duplicate UI components (if migrated in Task 4)
# Only delete components you've actually migrated
# Example:
rm apps/validai/components/ui/button.tsx
rm apps/validai/components/ui/card.tsx
rm apps/validai/components/ui/input.tsx
# ... etc (delete only what you've migrated)
```

**Update store index:**
```typescript
// apps/validai/stores/index.ts
// Remove organization-store export if deleted
export { useUiStore } from './ui-store'
export { useNotificationStore } from './notification-store'
// export { useOrganizationStore } from './organization-store' // REMOVED
export { useWorkbenchStore } from './workbench-store'
```

##### **Step 2: Verify Import Cleanup (30 min)**

**Ensure no broken imports:**
```bash
# TypeScript check
pnpm --filter @playze/validai typecheck

# Build check
pnpm --filter @playze/validai build

# Lint check
pnpm --filter @playze/validai lint
```

**Search for any remaining local imports:**
```bash
# Should find zero results
grep -r "from '@/lib/supabase" apps/validai
grep -r "from '@/lib/database.types" apps/validai
grep -r "from '@/app/queries/organizations" apps/validai
```

##### **Step 3: Create Integration Documentation (1 hour)**

**File:** `apps/validai/INTEGRATION.md`

```markdown
# ValidAI Integration with Core Framework

**Status:** ✅ Phase 4 Complete
**Date:** 2025-01-28

---

## Overview

ValidAI is built on the **Playze Core Framework**, leveraging shared infrastructure for authentication, organization management, and multi-tenancy.

---

## Shared Dependencies

### 1. `@playze/shared-types`

Auto-generated TypeScript types from Supabase schema.

**Usage:**
\`\`\`typescript
import type { Database, Organization, UserOrganization } from '@playze/shared-types'
\`\`\`

**What we use:**
- `Organization` - Organization entity type
- `UserOrganization` - User's org membership with role
- `Database` - Full database schema types
- `TypedSupabaseClient` - Typed Supabase client

### 2. `@playze/shared-auth`

Authentication clients and organization hooks.

**Usage:**
\`\`\`typescript
// Clients
import { createBrowserClient } from '@playze/shared-auth/client'
import { createServerClient } from '@playze/shared-auth/server'

// Hooks
import {
  useAuth,
  useCurrentOrganization,
  useUserOrganizations,
  useSwitchOrganization,
  useAuthorization,
  useFeatureAccess,
  usePermission
} from '@playze/shared-auth'
\`\`\`

**What we use:**
- `createBrowserClient()` - Client-side Supabase client
- `createServerClient()` - Server-side Supabase client
- `useCurrentOrganization()` - Get active organization
- `useUserOrganizations()` - Get all user's organizations
- `useSwitchOrganization()` - Switch organization context
- `useAuthorization('validai')` - Get authorization context (tier + role)
- `useFeatureAccess('validai', 'feature_name')` - Check tier-based feature
- `usePermission('validai', 'permission_name')` - Check role-based permission

### 3. `@playze/shared-ui`

Shared React components and design system.

**Usage:**
\`\`\`typescript
// UI Primitives
import { Button, Card, Input, Dialog } from '@playze/shared-ui'

// Platform Components
import { AuthGate } from '@playze/shared-ui'
\`\`\`

**What we use:**
- UI Components: Button, Card, Input, Label, Dialog, Select, etc.
- Platform: AuthGate (feature/permission gating)

---

## App-Specific Code

### ValidAI-Specific Components

Located in `apps/validai/components/`:
- **Processors:** Processor management UI
- **Runs:** Run execution and results
- **Workbench:** AI testing workbench
- **Operations:** Operation configuration
- **Documents:** Document management

### ValidAI-Specific Hooks

Located in `apps/validai/hooks/`:
- `use-llm-config` - LLM configuration management
- `use-workbench-test` - Workbench testing logic

### ValidAI-Specific Queries

Located in `apps/validai/app/queries/`:
- `documents.ts` - Document queries
- `processors/` - Processor queries
- `operations/` - Operation queries
- `runs.ts` - Run queries

---

## Authorization Implementation

### Tier-Based Features

ValidAI has 3 subscription tiers:

| Tier | Features |
|------|----------|
| **Free** | Basic processing, document upload (10 docs, 3 processors) |
| **Pro** | + Advanced AI, export reports, batch processing, API access (500 docs, 50 processors) |
| **Enterprise** | + Custom models, dedicated support, SLA, custom integrations (unlimited) |

**Check feature access:**
\`\`\`typescript
const { data: canExport } = useFeatureAccess('validai', 'export_reports')

if (canExport) {
  // Show export button
}
\`\`\`

### Role-Based Permissions

ValidAI defines 4 organization roles:

| Role | Permissions |
|------|-------------|
| **Owner** | Full access + member management |
| **Admin** | Full access (no member management) |
| **Member** | View, edit, execute (no delete/export) |
| **Viewer** | Read-only |

**Check permission:**
\`\`\`typescript
const { data: canEdit } = usePermission('validai', 'can_edit')

if (canEdit) {
  // Show edit button
}
\`\`\`

### Using AuthGate

**Tier-based gating:**
\`\`\`typescript
<AuthGate appId="validai" feature="export_reports">
  <ExportButton />
</AuthGate>
\`\`\`

**Permission-based gating:**
\`\`\`typescript
<AuthGate appId="validai" permission="can_edit">
  <EditButton />
</AuthGate>
\`\`\`

**Combined gating:**
\`\`\`typescript
<AuthGate appId="validai" feature="advanced_ai" permission="can_execute" requireAll>
  <AdvancedAIProcessor />
</AuthGate>
\`\`\`

---

## Database Schema

### Platform Tables (Shared)

Managed by framework:
- `organizations` - Tenant organizations
- `organization_members` - Org memberships + roles
- `apps` - App catalog
- `app_tiers` - Subscription tiers per app
- `organization_app_subscriptions` - Org's app subscriptions
- `app_role_permissions` - Role permissions per app

### ValidAI Tables (App-Specific)

Owned by ValidAI app:
- `validai_documents` - Uploaded documents
- `validai_processors` - AI processors
- `validai_operations` - Processor operations
- `validai_runs` - Execution runs
- `validai_operation_results` - Run results
- `validai_workbench_executions` - Workbench test runs
- `validai_llm_global_settings` - LLM configuration

### RLS Policies

All ValidAI tables enforce:
1. **Organization isolation:** `organization_id = user_organization_id()`
2. **App access:** `has_app_access('validai')`

---

## Development Guidelines

### Import Patterns

\`\`\`typescript
// ✅ DO: Use shared packages
import { createBrowserClient } from '@playze/shared-auth/client'
import { useCurrentOrganization } from '@playze/shared-auth'
import { Button } from '@playze/shared-ui'
import type { Organization } from '@playze/shared-types'

// ❌ DON'T: Use local implementations
import { createClient } from '@/lib/supabase/client'  // Deleted
import { useCurrentOrganization } from '@/app/queries/organizations'  // Deleted
import type { Organization } from '@/stores/organization-store'  // Deleted
\`\`\`

### Authorization Pattern

\`\`\`typescript
// ✅ DO: Use framework authorization
import { AuthGate, useFeatureAccess, usePermission } from '@playze/shared-auth'

// ❌ DON'T: Implement custom authorization
// Custom role checks, tier checks, etc.
\`\`\`

---

## Testing Checklist

Before deploying:
- [ ] Login/logout works
- [ ] Organization switching works
- [ ] Multi-org users see correct data per org
- [ ] Free tier: Limited features visible
- [ ] Pro tier: All features visible
- [ ] Viewer role: Cannot edit/delete
- [ ] Member role: Can edit, cannot delete
- [ ] Admin role: Full access except member management
- [ ] Owner role: Full access
- [ ] No console errors
- [ ] TypeScript builds without errors

---

## Troubleshooting

### "No access to ValidAI" error
- Check organization has active subscription: `organization_app_subscriptions` table
- Verify app registered: `apps` table
- Check user's organization membership: `organization_members` table

### Data not visible after org switch
- Ensure `switch-organization` Edge Function completed successfully
- Check session refreshed (JWT updated)
- Verify RLS policies on ValidAI tables

### Authorization not working
- Check `get_user_authorization('validai')` returns data
- Verify app registered with tiers and permissions
- Check organization has active subscription

---

## Migration History

**Phase 1:** Monorepo structure, table rename
**Phase 2:** Framework import
**Phase 3:** Verify independent operation
**Phase 4:** Integration (this phase)

**Phase 4 Changes:**
- ✅ Adopted `@playze/shared-types`
- ✅ Adopted `@playze/shared-auth` (clients + middleware + hooks)
- ✅ Adopted `@playze/shared-ui` (components)
- ✅ Implemented authorization framework (tiers + permissions)
- ✅ Updated RLS policies with app access check
- ✅ Removed local implementations
\`\`\`

##### **Step 4: Update Main Documentation (30 min)**

**File:** `CLAUDE.md`

Update Phase 4 status:
```markdown
**Implementation Status:**
- ✅ **Phase 1 COMPLETE:** Monorepo Foundation (pnpm, Turborepo)
- ✅ **Phase 2 COMPLETE:** Framework Import (4 shared packages, admin-portal, testapp, migrations)
- ✅ **Phase 3 COMPLETE:** Verify Independent Operation (All apps verified running)
- ✅ **Phase 4 COMPLETE:** ValidAI Integration with Framework (User/org management, authorization)
```

Add note about ValidAI integration:
```markdown
> **ValidAI Integration Status:** ✅ Phase 4 COMPLETE (2025-01-28)
> ValidAI now fully leverages the core framework for authentication, organization management, and authorization.
> See [apps/validai/INTEGRATION.md](apps/validai/INTEGRATION.md) for details.
```

#### **Files to Create**
- `apps/validai/INTEGRATION.md`

#### **Files to Modify**
- `CLAUDE.md` (update Phase 4 status)
- `apps/validai/stores/index.ts` (remove org-store export if deleted)

#### **Files to Delete**
- `apps/validai/lib/supabase/` (entire directory)
- `apps/validai/lib/database.types.ts`
- `apps/validai/app/queries/organizations/` (entire directory)
- `apps/validai/stores/organization-store.ts` (if using Option A from Task 3)
- Migrated UI component files (only those replaced by shared-ui)

#### **Verification Steps**
- [ ] No broken imports
- [ ] TypeScript compiles
- [ ] App builds successfully
- [ ] All tests pass
- [ ] Documentation accurate and helpful

#### **Completion Criteria**
✅ All unused local files deleted
✅ Integration documentation created
✅ Main docs updated
✅ No broken imports or build errors

---

## Success Criteria

### Code Quality
- [ ] All ValidAI imports from `@playze/shared-*` packages
- [ ] No duplicate implementations of auth/org/UI code
- [ ] TypeScript builds without errors (`pnpm --filter @playze/validai typecheck`)
- [ ] App builds successfully (`pnpm --filter @playze/validai build`)
- [ ] Linting passes (`pnpm --filter @playze/validai lint`)
- [ ] No console errors in browser

### Functionality
- [ ] User login/logout works
- [ ] Organization switching works
- [ ] Current org displays correctly in UI
- [ ] Multi-org users can switch context
- [ ] Data filtering by organization works (RLS)
- [ ] Feature gating works (tier-based)
- [ ] Permission gating works (role-based)
- [ ] No-access page shows for unauthorized users

### Performance
- [ ] No duplicate network requests (check Network tab)
- [ ] React Query caching works (5-min stale time)
- [ ] Page load time similar to Phase 3 baseline
- [ ] No memory leaks (use React DevTools Profiler)

### Security
- [ ] RLS policies enforce org isolation
- [ ] App access check prevents unauthorized access
- [ ] JWT contains correct organization_id
- [ ] Switching orgs updates JWT metadata
- [ ] Session refresh works after org switch

---

## Timeline & Risk Assessment

### Estimated Timeline

| Task | Duration | Complexity | Risk |
|------|----------|-----------|------|
| 1. Shared Types | 2 hours | Low | Low |
| 2. Shared Auth Clients | 4 hours | Medium | Medium |
| 3. Shared Auth Hooks | 3 hours | Medium | Medium |
| 4. Shared UI Components | 4 hours | Low-Medium | Low |
| 5. OrgSwitcher Component | 1 hour | Low | Low |
| 6. Authorization Framework | 5 hours | High | Medium |
| 7. RLS Policy Updates | 2 hours | Medium | Medium |
| 8. Clean Up & Docs | 2 hours | Low | Low |
| **Total** | **23 hours** | **~3 days** | 🟡 Medium |

### Task Dependencies

```
Task 1 (Types)
    ↓
Task 2 (Auth Clients)
    ↓
Task 3 (Auth Hooks) ←→ Task 4 (UI Components)
    ↓                      ↓
Task 5 (OrgSwitcher)      ↓
    ↓                      ↓
Task 6 (Authorization) ←──┘
    ↓
Task 7 (RLS Policies)
    ↓
Task 8 (Clean Up)
```

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
**Can parallelize:** Tasks 4 and 5 can be done anytime after Task 2

### Risk Matrix

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|-----------|
| Breaking auth flow | 🔴 High | 🟡 Medium | Incremental testing, keep Phase 3 backup |
| Type mismatches | 🟡 Medium | 🟢 Low | Task 1 first (types foundation) |
| UI regressions | 🟡 Medium | 🟢 Low | Visual testing, rollback individual components |
| RLS policy errors | 🔴 High | 🟢 Low | Test thoroughly, have rollback migration ready |
| Performance degradation | 🟢 Low | 🟢 Low | React Query already used, monitor metrics |
| Missing features | 🟡 Medium | 🟡 Medium | Thorough authorization testing |

### Critical Success Factors

✅ **Incremental approach:** Complete tasks 1-3 (foundation) before 4-8
✅ **Test continuously:** Run app and verify functionality after each task
✅ **No breaking changes:** Phase 4 is additive, not destructive
✅ **Framework benefits:** Authorization, consistent UX, less code to maintain

---

## Rollback Plan

### If Any Task Fails

**Git-based rollback:**
```bash
# Revert all changes
git reset --hard phase3-milestone-complete

# Or revert specific commit
git revert <commit-hash>
```

**Selective rollback:**
- Individual files can be reverted without affecting others
- Database migrations can be rolled back if needed

### Database Rollback

**If Task 6 (app registration) needs rollback:**
```sql
-- Remove ValidAI app registration
DELETE FROM organization_app_subscriptions WHERE app_id = 'validai';
DELETE FROM app_role_permissions WHERE app_id = 'validai';
DELETE FROM app_tiers WHERE app_id = 'validai';
DELETE FROM apps WHERE id = 'validai';
```

**If Task 7 (RLS policies) needs rollback:**
```bash
# Revert to previous migration
npx supabase db reset
# Re-apply only up to last good migration
```

### Checkpoint Strategy

**Create checkpoints after each task:**
```bash
# After Task 1
git add .
git commit -m "feat(validai): Task 1 complete - Adopt shared types"
git tag phase4-task1-complete

# After Task 2
git add .
git commit -m "feat(validai): Task 2 complete - Adopt shared auth clients"
git tag phase4-task2-complete

# ... etc
```

**This allows targeted rollback:**
```bash
# Rollback to specific task
git reset --hard phase4-task3-complete
```

---

## Notes

### Key Decisions

1. **No AppSwitcher:** Scoped out of Phase 4. ValidAI remains single-app focused for now.
2. **OrgSwitcher Design:** Maintain ValidAI's current sidebar-based design, only adopt shared hooks.
3. **Zustand Store:** Recommended to remove organization-store entirely, rely on React Query caching.
4. **UI Components:** Migrate core components (Button, Card, etc.), keep ValidAI-specific components.

### Framework Benefits

- **Less code to maintain:** ~50% reduction in auth/org code
- **Consistent UX:** Same patterns across all platform apps
- **Unified authorization:** ONE query for all permission checks
- **Battle-tested code:** Framework code already proven in production
- **Future-proof:** Easy to add new apps on same infrastructure

### Post-Integration Tasks (Future)

- [ ] Add AppSwitcher component (when multi-app navigation needed)
- [ ] Implement usage tracking (document/processor limits)
- [ ] Add billing integration (when PSP connected)
- [ ] Implement team invitations (when self-service enabled)
- [ ] Add SSO/SAML support (enterprise feature)

---

**End of Phase 4 Integration Plan**
