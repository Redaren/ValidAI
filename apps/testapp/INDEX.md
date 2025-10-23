# TestApp Documentation Index

> **Quick reference for all TestApp documentation**
>
> Start here to find the right documentation for your needs.

## 🚀 Quick Start

**New to TestApp?** Start here:

1. [README.md](README.md) - Quick start guide (5 min read)
2. [DATABASE_SETUP.md](DATABASE_SETUP.md) - Database configuration
3. Run `pnpm --filter @playze/testapp dev`

**Want to understand the code?** Read this:

1. [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Complete reference (30 min read)
2. Study code with enhanced JSDoc comments
3. Reference [Playze Core Architecture](../../docs/playze-core-architecture.md)

## 📚 Documentation Files

### For Developers Building Apps

| Document | Purpose | When to Read | Time |
|----------|---------|--------------|------|
| [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) | **Complete reference** - Patterns, examples, best practices | When building a new app on Playze Core | 30 min |
| [README.md](README.md) | Quick start and overview | When first setting up TestApp | 5 min |
| [DATABASE_SETUP.md](DATABASE_SETUP.md) | Database registration and test data | When configuring database | 10 min |

### For Understanding Implementation

| Document | Purpose | When to Read | Time |
|----------|---------|--------------|------|
| [TESTAPP_PHASE1_COMPLETE.md](TESTAPP_PHASE1_COMPLETE.md) | Implementation summary | After reading dev guide, to understand decisions | 15 min |
| [JSDOC_ENHANCEMENT_SUMMARY.md](JSDOC_ENHANCEMENT_SUMMARY.md) | Documentation enhancement details | When contributing to docs | 10 min |

### For Platform Architecture

| Document | Purpose | When to Read | Time |
|----------|---------|--------------|------|
| [../../docs/playze-core-architecture.md](../../docs/playze-core-architecture.md) | **Complete platform architecture** | Before building any app | 60 min |
| [../../docs/playze-core-architecture-elevated-access.md](../../docs/playze-core-architecture-elevated-access.md) | Admin access patterns (NOT used in TestApp) | When building admin features | 30 min |

## 🎯 Find What You Need

### "I want to..."

#### ...understand what TestApp does
→ Read [README.md](README.md) - Overview section

#### ...learn Playze Core patterns
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Complete guide

#### ...see authorization examples
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Section 2.4 + Code Examples
→ Study [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) - Lines 239-349

#### ...understand authentication flow
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Section 2.1
→ Study [app/login/login-form.tsx](app/login/login-form.tsx)
→ Study [middleware.ts](middleware.ts)

#### ...set up database for TestApp
→ Read [DATABASE_SETUP.md](DATABASE_SETUP.md)
→ Run [testapp-registration.sql](testapp-registration.sql)

#### ...understand multi-tenancy
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Section 2.3
→ Study [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) - Lines 158-211

#### ...know server vs client components
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Section 2.6
→ Study [app/layout.tsx](app/layout.tsx) vs [app/providers.tsx](app/providers.tsx)

#### ...fix hydration errors
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Troubleshooting section
→ Or [HYDRATION_FIX_FINAL.md](HYDRATION_FIX_FINAL.md)

#### ...understand regular vs admin patterns
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Architecture Patterns section
→ Read [../../docs/playze-core-architecture.md](../../docs/playze-core-architecture.md) - Authentication section

#### ...copy code patterns
→ Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Common Patterns section
→ Copy examples with inline JSDoc comments

## 🏗️ Code Architecture Map

### Authentication Flow
```
User visits app
    ↓
[middleware.ts] - Checks session
    ↓
Not authenticated → [app/login/login-form.tsx]
    ↓
Magic link sent → [app/auth/callback/route.ts]
    ↓
Session created → [app/dashboard/dashboard-content.tsx]
```

**Documentation:**
- [middleware.ts](middleware.ts) - Lines 1-91
- [app/login/login-form.tsx](app/login/login-form.tsx) - Lines 37-66
- [app/auth/callback/route.ts](app/auth/callback/route.ts) - Full file

### Authorization Flow
```
Page loads
    ↓
[useAuthorization('testapp')] - ONE database query
    ↓
Returns complete auth context:
  - user_role (owner/admin/member/viewer)
  - tier_features (from subscription)
  - role_permissions (from role)
  - tier_limits & current_usage
    ↓
Result cached for 5 minutes
    ↓
All AuthGate components use cached data
    ↓
Total database queries: 1 (not 15!)
```

**Documentation:**
- [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Section 5.1
- [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) - Lines 239-349

### Component Hierarchy
```
[app/layout.tsx] (Server Component)
    ↓
[app/providers.tsx] (Client Provider - QueryClient)
    ↓
[app/page.tsx] → redirects to /dashboard
    ↓
[app/dashboard/page.tsx] (Dynamic import, ssr: false)
    ↓
[app/dashboard/dashboard-content.tsx] (Client Component)
    ↓
  - User Info Card
  - Organization Context Card
  - App Switcher Demo Card
  - Tier-Based AuthGate (Pro feature)
  - Role-Based AuthGate (Edit permission)
  - Combined AuthGate (Pro + Export permission)
```

**Documentation:**
- [app/layout.tsx](app/layout.tsx) - Lines 1-35
- [app/providers.tsx](app/providers.tsx) - Lines 1-36
- [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) - Full file

## 📖 Learning Path

### Level 1: Setup (30 minutes)
1. Read [README.md](README.md)
2. Follow [DATABASE_SETUP.md](DATABASE_SETUP.md)
3. Run TestApp locally
4. Test login flow

### Level 2: Understand Patterns (1-2 hours)
1. Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Sections 1-3
2. Study [middleware.ts](middleware.ts) with JSDoc
3. Study [app/dashboard/dashboard-content.tsx](app/dashboard/dashboard-content.tsx) - Authorization examples
4. Read [../../docs/playze-core-architecture.md](../../docs/playze-core-architecture.md) - Overview

### Level 3: Deep Dive (2-4 hours)
1. Read [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Complete
2. Read [TESTAPP_PHASE1_COMPLETE.md](TESTAPP_PHASE1_COMPLETE.md)
3. Study all source files with JSDoc
4. Read [../../docs/playze-core-architecture.md](../../docs/playze-core-architecture.md) - Complete
5. Compare with Admin Portal architecture

### Level 4: Build Your Own (Ongoing)
1. Create new app following TestApp patterns
2. Reference [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) - Common Patterns
3. Copy authorization examples
4. Use troubleshooting guide when stuck

## 🔍 Quick Reference

### Three Authorization Patterns

#### 1. Tier-Based (Subscription)
```typescript
<AuthGate appId="testapp" feature="professional_demo">
  <ProFeature />
</AuthGate>
```
[See full example →](TESTAPP_DEVELOPER_GUIDE.md#3a-tier-based-feature-gate)

#### 2. Role-Based (Permission)
```typescript
<AuthGate appId="testapp" permission="can_edit">
  <EditButton />
</AuthGate>
```
[See full example →](TESTAPP_DEVELOPER_GUIDE.md#3b-role-based-permission-gate)

#### 3. Combined (Tier + Role)
```typescript
<AuthGate
  appId="testapp"
  feature="professional_demo"
  permission="can_export"
  requireAll
>
  <AdvancedFeature />
</AuthGate>
```
[See full example →](TESTAPP_DEVELOPER_GUIDE.md#3c-combined-authorization-tier--role)

### Key Framework Hooks

```typescript
// Organization Context
const { data: currentOrg } = useCurrentOrganization()
const { data: userOrgs } = useUserOrganizations()
const { data: orgApps } = useOrganizationApps()

// Authorization (ONE query for all!)
const { data: auth } = useAuthorization('testapp')

// Convenience hooks (use same cached data)
const { data: hasFeature } = useFeatureAccess('testapp', 'feature')
const { data: hasPermission } = usePermission('testapp', 'permission')
const { data: isAdmin } = useHasRole('testapp', ['owner', 'admin'])
```

[See full framework integration →](TESTAPP_DEVELOPER_GUIDE.md#framework-integration-points)

## 🐛 Common Issues

| Issue | Solution | Documentation |
|-------|----------|---------------|
| Hydration errors | Use dynamic import with ssr: false | [Troubleshooting Guide](TESTAPP_DEVELOPER_GUIDE.md#issue-1-hydration-errors) |
| Missing organization | Verify JWT metadata, re-invite user | [Troubleshooting Guide](TESTAPP_DEVELOPER_GUIDE.md#issue-2-organization-not-found-or-missing-context) |
| AuthGate not working | Check tier features and role permissions in DB | [Troubleshooting Guide](TESTAPP_DEVELOPER_GUIDE.md#issue-3-authgate-not-showing-content) |
| Session lost on refresh | Fix middleware cookie handling | [Troubleshooting Guide](TESTAPP_DEVELOPER_GUIDE.md#issue-4-session-lost-on-page-refresh) |
| No subscription | Add testapp subscription in Admin Portal | [Troubleshooting Guide](TESTAPP_DEVELOPER_GUIDE.md#issue-5-no-subscription-for-testapp) |

[See all troubleshooting →](TESTAPP_DEVELOPER_GUIDE.md#troubleshooting-guide)

## 📊 Documentation Stats

- **Total Documentation**: 1,500+ lines
- **Code Files with JSDoc**: 8 files
- **Examples Provided**: 15+ patterns
- **Troubleshooting Topics**: 6 common issues
- **Architecture Diagrams**: 3 flows
- **Time to Proficiency**: 2-4 hours reading + hands-on

## 🤝 Contributing

When adding features to TestApp:

1. ✅ Add JSDoc comments explaining the pattern
2. ✅ Update [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md) with examples
3. ✅ Follow existing patterns (PostgREST + RLS)
4. ✅ Document "why" not just "what"
5. ✅ Add troubleshooting entry if needed

## 📞 Getting Help

1. **Check documentation first**:
   - Search [TESTAPP_DEVELOPER_GUIDE.md](TESTAPP_DEVELOPER_GUIDE.md)
   - Check troubleshooting section
   - Review code JSDoc comments

2. **Review related docs**:
   - [Playze Core Architecture](../../docs/playze-core-architecture.md)
   - [Admin Portal README](../admin-portal/README.md)

3. **Ask with context**:
   - Reference specific files/lines
   - Include error messages
   - Describe what you tried

## 🎉 Success Criteria

After reading TestApp documentation, you should be able to:

- ✅ Explain the difference between regular and admin patterns
- ✅ Implement magic link authentication
- ✅ Use organization context in your app
- ✅ Apply three types of authorization gates
- ✅ Prevent hydration errors
- ✅ Import from shared packages correctly
- ✅ Debug common session issues
- ✅ Build a new app following Playze Core patterns

## 📚 Related Resources

### Internal Documentation
- [Playze Core Architecture](../../docs/playze-core-architecture.md) - Platform architecture
- [Implementation Plan](../../docs/initial-playze-high-level-implementation-plan.md) - Roadmap
- [Admin Portal](../admin-portal/README.md) - Admin access patterns (contrast)

### External Resources
- [Next.js App Router Docs](https://nextjs.org/docs/app) - Next.js 15 patterns
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth) - Authentication
- [TanStack Query Docs](https://tanstack.com/query/latest) - Data fetching

---

**Quick Links:**
[README](README.md) | [Developer Guide](TESTAPP_DEVELOPER_GUIDE.md) | [Database Setup](DATABASE_SETUP.md) | [Architecture](../../docs/playze-core-architecture.md)

**Status:** ✅ Phase 1 Complete | 📖 Fully Documented | 🎯 Production-Ready Reference
