# Sidebar Reloading Fix: Architecture Refactor Plan

## Background

### The Issue
When navigating between routes in the ValidAI application (e.g., from `/en/proc` to `/en/dashboard`), the **OrganizationSwitcher component reloads and re-fetches data from the database** even though the data hasn't changed and is already cached by TanStack Query. This causes:

- **Unnecessary network traffic** - Database queries fire on every navigation
- **Poor user experience** - Loading states flash unnecessarily
- **Performance degradation** - Multiple RPC calls to `get_current_organization()` and `get_user_organizations()`
- **Wasted resources** - Server processing duplicate requests

### Root Cause Analysis

The application currently uses **separate layout files for each major route**, each containing its own instance of `<SidebarProvider>` and `<AppSidebar />`:

```
app/[locale]/
├── dashboard/layout.tsx  → <SidebarProvider><AppSidebar /></SidebarProvider>  (Instance A)
├── proc/layout.tsx       → <SidebarProvider><AppSidebar /></SidebarProvider>  (Instance B)
└── account/layout.tsx    → <SidebarProvider><AppSidebar /></SidebarProvider>  (Instance C)
```

**What happens during navigation:**

1. User navigates from `/en/proc` → `/en/dashboard`
2. React **unmounts** `proc/layout.tsx` (including its `<AppSidebar />` component tree)
3. React **mounts** `dashboard/layout.tsx` (creating a NEW `<AppSidebar />` component tree)
4. The NEW `<OrganizationSwitcher />` component mounts
5. React hooks execute: `useCurrentOrganization()` and `useUserOrganizations()`
6. TanStack Query executes the query functions
7. **Database queries fire** via RPC: `get_current_organization()` and `get_user_organizations()`

**Why caching doesn't help:**

Even though TanStack Query has the data cached with `staleTime: 1000 * 60 * 2` (2 minutes for current org) and `staleTime: 1000 * 60 * 5` (5 minutes for user orgs), the **component mount triggers query execution**. While TanStack Query returns cached data quickly, it still initiates background refetches if the cache is stale, and the loading states still briefly appear.

### Why This Wasn't a Problem Before

This issue was **not introduced by the recent translation changes**. The translation refactor (moving from inline translations to translation keys) was architecturally correct but **revealed a pre-existing problem** that may have been masked by other factors (browser caching, fast local network, etc.).

The real issue is the **layout architecture** where each route creates its own sidebar instance.

---

## Solution: Route Group Pattern

### Architectural Approach

Use Next.js 13+ **route groups** to create a **shared layout for all authenticated routes** that contains ONE persistent sidebar instance.

**Route groups** (folders with parentheses like `(authenticated)`) don't create URL segments but allow grouping routes under a shared layout.

### Proposed Directory Structure

```
app/[locale]/
├── layout.tsx                          ← Existing: Providers, themes, i18n
│
├── (authenticated)/                    ← NEW: Route group (no URL segment created)
│   ├── layout.tsx                     ← NEW: Shared sidebar layout (ONE instance)
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                 ← MODIFIED: Breadcrumbs only (no sidebar)
│   │   └── page.tsx                   ← Unchanged
│   │
│   ├── proc/
│   │   ├── layout.tsx                 ← MODIFIED: Breadcrumbs only (no sidebar)
│   │   ├── page.tsx                   ← Unchanged
│   │   └── [id]/                      ← Unchanged
│   │       ├── page.tsx
│   │       ├── runs/
│   │       └── workbench/
│   │
│   └── account/
│       ├── layout.tsx                 ← MODIFIED: Breadcrumbs only (no sidebar)
│       └── page.tsx                   ← Unchanged
│
├── auth/                              ← STAYS HERE: No sidebar (full-screen)
│   ├── login/
│   ├── signup/
│   └── ...
│
├── no-access/                         ← STAYS HERE: No sidebar (full-screen)
│   └── page.tsx
│
└── page.tsx                           ← STAYS HERE: Landing page (no sidebar)
```

### Key Benefits

1. **No URL changes** - Route group `(authenticated)` doesn't create a URL segment
   - `/en/dashboard` stays `/en/dashboard`
   - `/en/proc/[id]` stays `/en/proc/[id]`
   - No links break, no redirects needed

2. **Single sidebar instance** - Sidebar never unmounts during navigation between authenticated routes

3. **Persistent state** - TanStack Query cache stays active, no refetches

4. **Clean separation** - Auth routes (`/auth/login`) and error pages (`/no-access`) remain full-screen without sidebar

5. **Standard Next.js pattern** - Official recommended approach for shared layouts

---

## Implementation Plan

### Phase 1: Create Route Group and Shared Layout

#### Step 1.1: Create Route Group Directory
**Action:** Create new directory
```
app/[locale]/(authenticated)/
```

#### Step 1.2: Create Shared Sidebar Layout
**Action:** Create new file `app/[locale]/(authenticated)/layout.tsx`

**Content:**
```typescript
import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Purpose:** This layout wraps all authenticated routes with a single persistent sidebar instance.

---

### Phase 2: Move Route Directories

#### Step 2.1: Move Dashboard Route
**Action:** Move directory
```
FROM: app/[locale]/dashboard/
TO:   app/[locale]/(authenticated)/dashboard/
```

**Files affected:**
- `layout.tsx` (will be modified in Phase 3)
- `page.tsx` (unchanged)

#### Step 2.2: Move Processors Route
**Action:** Move directory
```
FROM: app/[locale]/proc/
TO:   app/[locale]/(authenticated)/proc/
```

**Files affected:**
- `layout.tsx` (will be modified in Phase 3)
- `page.tsx` (unchanged)
- `[id]/` subdirectories (unchanged)

#### Step 2.3: Move Account Route
**Action:** Move directory
```
FROM: app/[locale]/account/
TO:   app/[locale]/(authenticated)/account/
```

**Files affected:**
- `layout.tsx` (will be modified in Phase 3)
- `page.tsx` (unchanged)

---

### Phase 3: Update Child Layouts (Remove Sidebar Wrapper)

Each child layout currently contains the full sidebar setup. We need to remove the sidebar components and keep only the header/breadcrumb content.

#### Step 3.1: Update Dashboard Layout
**File:** `app/[locale]/(authenticated)/dashboard/layout.tsx`

**Changes:**
```diff
- import { AppSidebar } from "@/components/app-sidebar"
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "@/components/ui/breadcrumb"
  import { Separator } from "@/components/ui/separator"
  import {
-   SidebarInset,
-   SidebarProvider,
    SidebarTrigger,
  } from "@/components/ui/sidebar"
  import { APP_NAME } from "@/lib/constants/app"
  import { getTranslations } from 'next-intl/server'

  export default async function DashboardLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    const t = await getTranslations('nav')

    return (
-     <SidebarProvider>
-       <AppSidebar />
-       <SidebarInset>
+       <>
          <header className="flex h-16 shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/dashboard">
                      {APP_NAME}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{t('dashboard')}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
-       </SidebarInset>
-     </SidebarProvider>
+     </>
    )
  }
```

**Summary:** Remove `<SidebarProvider>`, `<AppSidebar />`, and `<SidebarInset>` wrapper. Keep header with breadcrumbs and content wrapper.

#### Step 3.2: Update Processors Layout
**File:** `app/[locale]/(authenticated)/proc/layout.tsx`

**Changes:** Same pattern as dashboard - remove sidebar wrapper, keep header/breadcrumbs

**Specific considerations:**
- This layout is currently "use client" because it uses `usePathname()` and `useProcessorDetail()` hook
- Keep the client-side logic for breadcrumb generation
- Only remove the sidebar wrapper components

#### Step 3.3: Update Account Layout
**File:** `app/[locale]/(authenticated)/account/layout.tsx`

**Changes:** Same pattern - remove sidebar wrapper, keep header/breadcrumbs

---

### Phase 4: Verification & Testing

#### Step 4.1: TypeScript Compilation
**Action:** Run typecheck to ensure no TypeScript errors
```bash
pnpm --filter @playze/validai typecheck
```

#### Step 4.2: Manual Testing Checklist

1. **Navigation Testing**
   - [ ] Navigate from `/en/dashboard` → `/en/proc`
   - [ ] Navigate from `/en/proc` → `/en/account`
   - [ ] Navigate from `/en/account` → `/en/dashboard`
   - [ ] Verify OrganizationSwitcher does NOT reload/refetch
   - [ ] Verify sidebar state persists (open/closed state)

2. **Browser DevTools Network Tab**
   - [ ] Open Network tab
   - [ ] Filter for RPC calls (`get_current_organization`, `get_user_organizations`)
   - [ ] Navigate between routes
   - [ ] Verify NO additional RPC calls are made (except on initial load)

3. **Route Functionality**
   - [ ] Dashboard page loads correctly
   - [ ] Processor list page loads correctly
   - [ ] Processor detail page loads correctly
   - [ ] Processor workbench page loads correctly
   - [ ] Account page loads correctly

4. **Auth Routes (Should NOT have sidebar)**
   - [ ] `/en/auth/login` - Full-screen, no sidebar
   - [ ] `/en/auth/signup` - Full-screen, no sidebar
   - [ ] `/en/no-access` - Full-screen, no sidebar
   - [ ] Landing page `/en` - Full-screen, no sidebar

5. **Breadcrumbs**
   - [ ] Breadcrumbs display correctly on dashboard
   - [ ] Breadcrumbs display correctly on processor list
   - [ ] Breadcrumbs display correctly on processor detail
   - [ ] Breadcrumb navigation works correctly

6. **Language Switching**
   - [ ] Switch language from EN → SV
   - [ ] Verify sidebar items translate correctly
   - [ ] Verify OrganizationSwitcher still doesn't reload
   - [ ] Verify breadcrumbs translate correctly

#### Step 4.3: Build Test
**Action:** Run production build to ensure no build errors
```bash
pnpm --filter @playze/validai build
```

---

## Risk Assessment

### Low Risk
- **No URL changes** - Route groups don't affect URLs
- **No state management changes** - TanStack Query behavior unchanged
- **No component logic changes** - Just layout reorganization

### Medium Risk
- **Layout nesting** - Ensure all child routes properly render within new parent layout
- **Server vs Client components** - Ensure "use client" directives are in correct places

### Mitigation
- TypeScript compilation will catch any import errors
- Manual testing checklist covers all critical paths
- Changes are purely structural (no business logic changes)

---

## Success Criteria

1. ✅ **No database queries on navigation** - Verified in Network tab
2. ✅ **Sidebar persists across routes** - No unmount/remount
3. ✅ **All routes function correctly** - Dashboard, processors, account
4. ✅ **Auth routes remain full-screen** - No sidebar on login/signup
5. ✅ **No TypeScript errors** - Clean typecheck
6. ✅ **No build errors** - Production build succeeds
7. ✅ **Breadcrumbs work correctly** - Dynamic breadcrumbs still function
8. ✅ **Language switching works** - No regressions in i18n

---

## Rollback Plan

If issues arise after implementation:

1. **Quick rollback:** Move directories back to original locations
   ```bash
   mv app/[locale]/(authenticated)/dashboard app/[locale]/dashboard
   mv app/[locale]/(authenticated)/proc app/[locale]/proc
   mv app/[locale]/(authenticated)/account app/[locale]/account
   ```

2. **Restore layout files:** Revert changes to child layouts (restore sidebar wrappers)

3. **Delete route group:** Remove `app/[locale]/(authenticated)/` directory

Git will track all changes, making rollback straightforward.

---

## Timeline Estimate

- **Phase 1:** Create route group and shared layout - 5 minutes
- **Phase 2:** Move directories - 2 minutes
- **Phase 3:** Update child layouts - 10 minutes
- **Phase 4:** Testing and verification - 15 minutes

**Total estimated time:** ~30 minutes

---

## Conclusion

This refactor addresses the root cause of unnecessary database queries during navigation by ensuring the sidebar component persists across route changes. The solution follows Next.js best practices using route groups, requires no URL changes, and has minimal risk due to its structural nature. Upon completion, users will experience seamless navigation with no loading states or network traffic for cached organization data.
