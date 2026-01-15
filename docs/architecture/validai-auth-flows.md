# ValidAI Core - Authentication Flows

This document describes all authentication flows supported by ValidAI Core Framework, showing what is provided by shared functionality (`@playze/shared-auth`, `@playze/shared-ui`, Edge Functions) versus what each app implements locally.

**Related Documentation:**
- [ValidAI Core Architecture](./architecture/validai-core-architecture.md) - Framework architecture
- [Supabase Auth Configuration](../apps/admin-portal/docs/supabase-auth-configuration.md) - Auth setup

---

## Auth Flow Summary

| Flow | Shared Components | App-Specific |
|------|-------------------|--------------|
| **Login (Magic Link)** | `createBrowserClient()`, `handleAuthCallback()`, UI components | Login page, branding |
| **Auth Callback** | `handleAuthCallback()` | Redirect paths, error pages |
| **Logout** | `supabase.auth.signOut()` | Logout button placement, redirect |
| **Switch Organization** | `useSwitchOrganization()`, `OrgSwitcher`, Edge Function | UI placement |
| **Switch App** | `AppSwitcher`, `useUserAppsWithAdmin()` | Sidebar/header placement |
| **Session Refresh / Middleware** | `createAppMiddleware()` factory | App ID, public routes config |
| **Invite Members** | Full stack (hooks, UI, Edge Function, RPC) | Button placement only |
| **Accept Invitation** | `accept-invitation` Edge Function, callback handler | Accept page (optional) |
| **Member Management** | Full stack (hooks, UI components, RPCs) | Page layout only |
| **Authorization / Feature Gating** | `useAuthorization()`, `AuthGate` | Gate placement, custom fallbacks |

---

## 1. Login Flow (Magic Link)

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `createBrowserClient()` - Browser Supabase client for calling `signInWithOtp()`
- `handleAuthCallback()` - Server-side callback handler that:
  - Exchanges auth code for session
  - Processes pending invitations automatically
  - Handles multi-org routing (0, 1, or 2+ orgs)
  - Auto-switches org for single-org users

**From `@playze/shared-ui`:**
- `OrgPickerLogin` - Complete org selection UI for multi-org users
- `Button`, `Input`, `Label`, `Card` - Form UI components

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **Login Page** (`app/login/page.tsx`) | Layout, branding, app icon |
| **Login Form** | Email input, submit handler, error display |
| **Magic Link Call** | `supabase.auth.signInWithOtp({ email })` |
| **Redirect Paths** | Configure `handleAuthCallback()` redirects |

### Login Flow Diagram

```
User enters email on Login Page (APP)
         │
         ▼
signInWithOtp() via createBrowserClient() (SHARED)
         │
         ▼
Supabase sends magic link email (SUPABASE)
         │
         ▼
User clicks link → /auth/callback (APP route)
         │
         ▼
handleAuthCallback() processes (SHARED)
  ├─ Exchanges code for session
  ├─ If invitation_id in metadata → accept-invitation Edge Function
  ├─ Gets user organizations
  └─ Redirects based on org count:
       ├─ 0 orgs → /auth/no-organization (error)
       ├─ 1 org → auto-switch → /dashboard
       └─ 2+ orgs → /auth/select-org (org picker)
         │
         ▼
Middleware checks app access (SHARED factory)
         │
         ▼
Dashboard loads with org context
```

### Files by App

| App | Login Page | Auth Callback | Middleware |
|-----|------------|---------------|------------|
| **admin-portal** | `app/login/page.tsx` | `app/auth/callback/route.ts` (custom admin) | `middleware.ts` (custom admin check) |
| **validai** | `app/login/page.tsx` | `app/auth/callback/route.ts` | `middleware.ts` (shared factory) |
| **testapp** | `app/login/page.tsx` | `app/auth/callback/route.ts` (shared) | `middleware.ts` (shared factory) |

---

## 2. Logout Flow

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `createBrowserClient()` - Client for calling `signOut()`
- `useAuth()` - Hook to get current user state

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **Logout Button** | Placement in header/sidebar/menu |
| **signOut() Call** | `supabase.auth.signOut()` |
| **Post-Logout Redirect** | Navigate to `/login` |
| **State Cleanup** | Clear local stores if needed |

### Logout Flow Diagram

```
User clicks Logout button (APP UI)
         │
         ▼
supabase.auth.signOut() via createBrowserClient() (SHARED client)
         │
         ▼
Supabase clears session cookies (SUPABASE)
         │
         ▼
App redirects to /login (APP)
         │
         ▼
Middleware blocks protected routes (SHARED factory)
```

---

## 3. Switch Organization Flow

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `useSwitchOrganization()` - Mutation hook that calls Edge Function
- `useUserOrganizations()` - Hook to list user's orgs
- `useCurrentOrganization()` - Hook to get active org

**From `@playze/shared-ui`:**
- `OrgSwitcher` - Complete dropdown UI (3 modes: default, sidebar, external)

**Edge Function:**
- `switch-organization` (v12) - Updates JWT `app_metadata.organization_id`
  - Returns `defaultAppUrl` for external mode navigation
  - Validates `org.is_active` before switch
  - Uses `get_org_accessible_apps` RPC

**Database:**
- `get_user_organizations()` - RPC to list user's orgs with roles
- `get_org_accessible_apps()` - RPC to get org's subscribed apps

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **OrgSwitcher Placement** | Where in sidebar/header to render |
| **Mode Selection** | `default`, `sidebar`, or `external` mode |
| **Post-Switch Action** | `router.refresh()` to reload data |

### OrgSwitcher Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `default` | Switches org, reloads current app | Single-app users |
| `sidebar` | Chevron appears on hover, compact | Sidebar navigation |
| `external` | Opens org's default app in new tab | Cross-app navigation |

### Switch Organization Flow Diagram

```
User clicks OrgSwitcher dropdown (SHARED UI)
         │
         ▼
useUserOrganizations() fetches org list (SHARED hook → RPC)
         │
         ▼
User selects different organization
         │
         ▼
useSwitchOrganization().mutateAsync(orgId) (SHARED hook)
         │
         ▼
switch-organization Edge Function (SHARED)
  ├─ Validates user is member of target org
  ├─ Verifies org is active
  ├─ Gets accessible apps for new org
  └─ Updates JWT app_metadata:
       ├─ organization_id = new org
       └─ accessible_apps = [app list]
         │
         ▼
Returns new session + defaultAppUrl
         │
         ▼
Hook invalidates queries (organization, auth)
         │
         ▼
App calls router.refresh() OR navigates to defaultAppUrl (APP)
         │
         ▼
All RLS-filtered data now shows new org's data
```

---

## 4. Switch App Flow

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `useUserAppsWithAdmin()` - Hook to get accessible apps + admin portal access

**From `@playze/shared-ui`:**
- `AppSwitcher` - Complete dropdown UI (2 modes: default, sidebar)

**Database:**
- `get_user_apps_with_admin()` - RPC that returns subscribed apps + admin flag + app URLs

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **AppSwitcher Placement** | Where in sidebar/header to render |
| **currentApp Prop** | Pass current app ID to highlight |

### Switch App Flow Diagram

```
User clicks AppSwitcher dropdown (SHARED UI)
         │
         ▼
useUserAppsWithAdmin() fetches app list (SHARED hook → RPC)
  ├─ Gets org's active subscriptions with app_url
  └─ Checks if user is platform admin → adds Admin Portal
         │
         ▼
User selects different app
         │
         ▼
Browser navigates to app's URL (SHARED - reads app_url from database)
         │
         ▼
Target app's middleware validates access (SHARED factory)
         │
         ▼
Session already contains correct org context (no switch needed)
```

---

## 5. Session Refresh / Middleware

### What Shared Functionality Provides

**From `@playze/shared-auth/middleware`:**
- `createAppMiddleware(options)` - Factory function that creates middleware for user apps

The factory handles:
1. Session refresh on each request
2. Public route bypass
3. Unauthenticated redirect to `/login`
4. App access check via JWT `accessible_apps`
5. Cookie preservation on redirects

### What Apps Implement Locally

Apps configure the factory with app-specific options:

```typescript
// apps/validai/middleware.ts
import { createAppMiddleware } from '@playze/shared-auth/middleware'

export const middleware = createAppMiddleware({
  appId: 'validai',
  additionalPublicRoutes: ['/auth/accept-invite'],
  authenticatedRedirect: '/',
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appId` | `string` | Required | App ID to check in JWT `accessible_apps` |
| `additionalPublicRoutes` | `string[]` | `[]` | Routes to add beyond defaults |
| `authenticatedRedirect` | `string` | `'/'` | Where to redirect authenticated users from `/login` |

**Default Public Routes:** `/login`, `/auth/callback`, `/unauthorized`

### App-Specific Configurations

| App | App ID | Additional Public Routes | Auth Redirect |
|-----|--------|--------------------------|---------------|
| **validai** | `'validai'` | `/auth/accept-invite` | `/` |
| **testapp** | `'testapp'` | `/auth/accept-invite` | `/dashboard` |

### Admin Portal Exception

Admin Portal does NOT use the shared factory - it has custom middleware that checks the `admin_users` table instead of JWT `accessible_apps`.

### Middleware Flow Diagram

```
Request to protected route
         │
         ▼
createAppMiddleware() intercepts (SHARED factory)
         │
         ▼
Is public route? (/login, /auth/callback, /unauthorized, + custom)
         │
    ┌────┴────┐
    ▼         ▼
  YES        NO
    │         │
    ▼         ▼
  Return    Get user via supabase.auth.getUser()
  response         │
              ┌────┴────┐
              ▼         ▼
           HAS USER   NO USER
              │         │
              ▼         ▼
           Check      Redirect
           accessible_apps    to /login
              │
         ┌────┴────┐
         ▼         ▼
      HAS APP   NO APP
         │         │
         ▼         ▼
      Continue   Redirect to
      to page    /unauthorized
```

---

## 6. Invite Members Flow (Self-Service)

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `useCanInvite(appId)` - Check role permission + tier feature
- `useInviteMembers()` - Mutation to send invitations
- `useOrgInvitations(orgId)` - List pending invitations
- `useCancelInvitation()` - Cancel pending invitation

**From `@playze/shared-ui`:**
- `InviteMembersButton` - Auto-hides if no permission
- `InviteMembersDialog` - Full dialog with email parsing, role selection
- `OrgInvitationsTable` - Table of pending invitations with cancel

**Edge Function:**
- `user-invite-member` (v1) - Bulk invitation with email sending

**Database:**
- `user_invite_member()` - RPC with full validation (role hierarchy, tier check)
- `user_get_org_invitations()` - RPC to list invitations
- `user_cancel_invitation()` - RPC to cancel invitation

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **Button Placement** | Where to show InviteMembersButton |
| **Page Layout** | Settings/members page structure |
| **appId Prop** | Pass current app ID for tier checks |

### Invite Members Flow Diagram

```
User clicks InviteMembersButton (SHARED UI)
         │
         ▼
useCanInvite() checks (SHARED hook)
  ├─ role_permissions.can_invite (owner/admin)
  └─ tier_features.can_invite_members (pro/enterprise)
         │
    ┌────┴────┐
    ▼         ▼
  PASS      FAIL → Button hidden
    │
    ▼
InviteMembersDialog opens (SHARED UI)
         │
         ▼
User pastes emails, selects role
         │
         ▼
useInviteMembers().mutateAsync() (SHARED hook)
         │
         ▼
user-invite-member Edge Function (SHARED)
  ├─ Creates user client (preserves auth.uid() context)
  ├─ Calls user_invite_member() RPC per email
  │    ├─ Validates org membership
  │    ├─ Validates can_invite permission
  │    ├─ Validates can_invite_members tier feature
  │    ├─ Validates role hierarchy (can't assign higher)
  │    └─ Creates invitation record
  └─ Sends email per invitation:
       ├─ Existing user → signInWithOtp (magic link)
       └─ New user → inviteUserByEmail (signup link)
         │
         ▼
Results shown in dialog (SHARED UI)
```

---

## 7. Accept Invitation Flow

### What Shared Functionality Provides

**From `@playze/shared-auth/lib`:**
- `handleAuthCallback()` - Auto-processes invitations from user_metadata

**Edge Function:**
- `accept-invitation` (v1) - Full invitation acceptance:
  - Creates profile/preferences for new users
  - Adds user to organization
  - Updates JWT with new org context
  - Cleans up invitation metadata

**Database:**
- `handle_existing_user_invitation()` - RPC to validate and accept

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **Accept Page** (optional) | `/auth/accept-invite` for manual acceptance |
| **Callback Route** | Configure handleAuthCallback redirects |

### Accept Invitation Flow Diagram

```
User clicks magic link in invitation email
         │
         ▼
/auth/callback route (APP)
         │
         ▼
handleAuthCallback() processes (SHARED)
  ├─ Exchanges code for session
  └─ Checks user_metadata.invitation_id
         │
    ┌────┴────┐
    ▼         ▼
  HAS ID    NO ID → normal login flow
    │
    ▼
Calls accept-invitation Edge Function (SHARED)
  ├─ Creates profile if new user
  ├─ Creates user_preferences if new user
  ├─ Calls handle_existing_user_invitation() RPC
  │    ├─ Validates invitation pending & not expired
  │    ├─ Validates email matches user
  │    ├─ Adds to organization_members
  │    └─ Marks invitation as accepted
  ├─ Updates JWT app_metadata:
  │    ├─ organization_id = invited org
  │    └─ accessible_apps = org's apps
  └─ Clears user_metadata invitation fields
         │
         ▼
Redirects to dashboard with new org context
```

---

## 8. Member Management Flow

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `useOrgMembers(orgId)` - List org members
- `useOrgMembersPaginated(orgId, params)` - Paginated with search
- `useUpdateMemberRole()` - Change member role
- `useToggleMemberActive()` - Activate/deactivate member

**From `@playze/shared-ui`:**
- `OrgMembersTable` - Full table with search, pagination, actions

**Database:**
- `user_get_org_members()` - RPC to list members
- `user_get_org_members_paginated()` - RPC with pagination and search
- `user_update_member_role()` - RPC with role hierarchy validation
- `user_toggle_member_active()` - RPC with owner protection

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **Members Page** | `/settings/members` route and layout |
| **Table Placement** | Where to render OrgMembersTable |
| **appId Prop** | Pass current app ID for permission checks |

---

## 9. Authorization / Feature Gating

### What Shared Functionality Provides

**From `@playze/shared-auth`:**
- `useAuthorization(appId)` - Primary hook, returns all auth context in one query
- `useFeatureAccess(appId, feature)` - Check tier feature
- `usePermission(appId, permission)` - Check role permission
- `useHasRole(appId, roles[])` - Check user role

**From `@playze/shared-ui`:**
- `AuthGate` / `FeatureGate` - Conditional rendering component

**Database:**
- `get_user_authorization()` - Single RPC returning role, features, permissions, limits

### What Apps Implement Locally

| Component | App Responsibility |
|-----------|-------------------|
| **Gate Placement** | Wrap features that need gating |
| **appId Prop** | Pass current app ID |
| **Custom Fallback** | Optional upgrade prompt UI |

### Authorization Check Flow

```
Component renders with <AuthGate feature="export_reports">
         │
         ▼
useAuthorization('validai') fetches (SHARED hook)
         │
         ▼
get_user_authorization() RPC (DATABASE)
  ├─ Gets org from JWT
  ├─ Gets user role in org
  ├─ Gets subscription tier
  ├─ Gets tier features & limits
  └─ Gets role permissions
         │
         ▼
Hook caches result (5 min stale time)
         │
         ▼
AuthGate checks tier_features.export_reports
         │
    ┌────┴────┐
    ▼         ▼
  TRUE      FALSE
    │         │
    ▼         ▼
  Render    Render fallback
  children  (upgrade prompt)
```

---

## Summary: Shared vs App-Specific

### Fully Shared (App Just Imports & Uses)

| Component | Package | What App Does |
|-----------|---------|---------------|
| `createAppMiddleware()` | `@playze/shared-auth/middleware` | Configure with appId + options |
| `OrgSwitcher` | `@playze/shared-ui` | Place in UI, choose mode |
| `AppSwitcher` | `@playze/shared-ui` | Place in UI, pass currentApp |
| `InviteMembersButton` | `@playze/shared-ui` | Place in UI |
| `InviteMembersDialog` | `@playze/shared-ui` | Control open state |
| `OrgMembersTable` | `@playze/shared-ui` | Place in settings page |
| `OrgInvitationsTable` | `@playze/shared-ui` | Place in settings page |
| `AuthGate` | `@playze/shared-ui` | Wrap gated features |
| All auth hooks | `@playze/shared-auth` | Call in components |
| `handleAuthCallback()` | `@playze/shared-auth/lib` | Call in callback route |

### App Must Implement

| Component | Why App-Specific |
|-----------|------------------|
| **Login Page** | Branding, layout, app-specific errors |
| **Logout Button** | Placement varies by app UI |
| **Settings Pages** | Layout around shared components |
| **Auth Callback Route** | Custom redirect paths |

---

## Deployed Edge Functions

| Function | Version | Purpose |
|----------|---------|---------|
| `switch-organization` | v12 | Switch org context, update JWT |
| `create-organization` | v4 | Admin: create org with extended fields |
| `invite-member` | v1 | Admin: invite member to org |
| `accept-invitation` | v1 | Accept invitation, join org |
| `cancel-invitation` | v1 | Cancel pending invitation |
| `resend-invitation` | v1 | Resend invitation email |
| `user-invite-member` | v1 | User: invite with permission check |
| `delete-user` | v1 | Admin: delete user from platform |
| `invite-user` | v6 | Admin: invite user to platform |
| `enrich-jwt` | v10 | Enrich JWT with org data |
| `create-user` | v2 | Admin: create user |
| `execute-workbench-test` | v99 | ValidAI: run workbench test |
| `execute-processor-run` | v57 | ValidAI: execute processor |

---

## Quick Reference: Import Paths

```typescript
// Client-side hooks and utilities
import {
  useAuth,
  useCurrentOrganization,
  useSwitchOrganization,
  useAuthorization,
  useFeatureAccess,
  useCanInvite,
  useInviteMembers,
  useOrgMembers,
  useOrgMembersPaginated,
  useUpdateMemberRole,
  useToggleMemberActive,
  createBrowserClient
} from '@playze/shared-auth'

// Server-side utilities
import { createServerClient } from '@playze/shared-auth/server'

// Callback handler
import { handleAuthCallback } from '@playze/shared-auth/lib'

// Middleware factory
import { createAppMiddleware } from '@playze/shared-auth/middleware'

// UI Components
import {
  OrgSwitcher,
  AppSwitcher,
  InviteMembersButton,
  InviteMembersDialog,
  OrgMembersTable,
  OrgInvitationsTable,
  AuthGate,
  OrgPickerLogin
} from '@playze/shared-ui'
```

---

## Database Functions Reference

### User-Level RPCs (Self-Service)

| Function | Purpose |
|----------|---------|
| `get_user_organizations()` | List user's orgs with roles |
| `get_org_accessible_apps(org_id)` | Get org's subscribed apps |
| `get_user_apps_with_admin()` | Get apps + admin portal access |
| `get_user_authorization(app_id)` | Complete auth context |
| `user_invite_member(...)` | Invite with validation |
| `user_get_org_invitations(org_id)` | List pending invitations |
| `user_cancel_invitation(invitation_id)` | Cancel invitation |
| `user_get_org_members(org_id)` | List org members |
| `user_get_org_members_paginated(...)` | Paginated member list |
| `user_update_member_role(...)` | Change member role |
| `user_toggle_member_active(...)` | Activate/deactivate member |
| `handle_existing_user_invitation(...)` | Accept invitation (service_role) |
