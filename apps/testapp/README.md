# TestApp - Playze Core Reference Application

> **Status**: Phase 1 Complete ✅
>
> Minimal reference application demonstrating Playze Core platform integration with standard user access patterns.

## Overview

TestApp is a minimal Next.js application built on the Playze Core platform. It serves as a reference implementation for:

- Standard user authentication (magic links)
- Session management via middleware
- Protected routes
- Shared package integration
- **PostgREST + RLS** data access pattern (NOT admin pattern)

## What's Implemented (Phase 1)

### ✅ Features
- **Login page** (`/login`) - Magic link authentication via Supabase
- **Dashboard** (`/dashboard`) - Protected page with user info and sign-out
- **Middleware** - Automatic session refresh and auth redirection
- **Auth callback** - Handles magic link email redirects
- **Shared packages** - Uses `@playze/shared-auth` and `@playze/shared-ui`

### 🏗️ Architecture Pattern

**Regular User Access** (NOT Admin Access):

```typescript
// ✅ Uses PostgREST for queries
const { data } = await supabase.from('table').select('*')

// ❌ Does NOT use admin RPC functions
// (Those are only for Admin Portal)
```

- **RLS Policies**: Organization-scoped data access
- **No SECURITY DEFINER**: Regular user permissions only
- **PostgREST API**: Direct database queries via Supabase client

## Quick Start

### 1. Setup Database

Follow [DATABASE_SETUP.md](./DATABASE_SETUP.md) to:
- Register TestApp in `apps` table
- Create app tiers
- Create test organization with testapp subscription
- Invite test user

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local with your Supabase credentials
```

### 3. Install and Run

```bash
# From repository root
pnpm install

# Run TestApp (port 3003)
pnpm --filter @playze/testapp dev
```

### 4. Test Login Flow

1. Navigate to `http://localhost:3003`
2. Enter your email on the login page
3. Check email for magic link
4. Click link to authenticate
5. View dashboard with user info
6. Test sign-out functionality

## Project Structure

```
apps/testapp/
├── app/
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts          # Auth callback handler
│   ├── dashboard/
│   │   └── page.tsx               # Protected dashboard
│   ├── login/
│   │   └── page.tsx               # Login page (magic link)
│   ├── globals.css                # Tailwind styles
│   ├── layout.tsx                 # Root layout with QueryClient
│   └── page.tsx                   # Root redirect to dashboard
├── middleware.ts                  # Session management
├── next.config.ts                 # Next.js config
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── tailwind.config.ts             # Tailwind config
├── .env.example                   # Environment template
├── DATABASE_SETUP.md              # Database setup guide
└── README.md                      # This file
```

## Key Files Explained

### `middleware.ts`
Handles session management for all routes:
- Refreshes Supabase session on each request
- Redirects unauthenticated users to `/login`
- Allows public access to `/login` and `/auth/callback`
- Uses `@supabase/ssr` for cookie handling

### `app/login/page.tsx`
Magic link authentication:
- Sends magic link via `supabase.auth.signInWithOtp()`
- Shows success state after sending email
- Displays error messages from callback
- Uses shared UI components from `@playze/shared-ui`

### `app/auth/callback/route.ts`
Handles OAuth callback:
- Exchanges authorization code for session
- Sets session cookies
- Redirects to dashboard on success
- Redirects to login with error on failure

### `app/dashboard/page.tsx`
Protected dashboard page:
- Displays user email and ID
- Sign-out button
- Shows authentication status
- Uses `createBrowserClient()` from `@playze/shared-auth`

## Dependencies

### Shared Packages
- `@playze/shared-auth` - Supabase client utilities
- `@playze/shared-ui` - UI components (Button, Card, Input, Label)
- `@playze/shared-types` - TypeScript types
- `@playze/shared-config` - Base configurations

### External Dependencies
- `next` 15.1.4 - App Router framework
- `react` 19.0.0 - UI library
- `@supabase/ssr` - Supabase Server-Side Rendering helpers
- `@supabase/supabase-js` - Supabase JavaScript client
- `@tanstack/react-query` - Server state management
- `lucide-react` - Icon library
- `tailwindcss` - Utility-first CSS

## Environment Variables

Required in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Development Commands

```bash
# Run dev server (port 3003)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

## Roadmap: Phase 2 (Future)

Phase 2 will extend TestApp with:

- **Organization Switcher** - For users in multiple organizations
- **Feature Gating** - Tier-based feature access (Free vs Pro)
- **App-Specific Tables** - `testapp_*` tables with RLS policies
- **Database Functions** - Complex queries via `supabase.rpc()`
- **Real-time Features** - Live data updates via Supabase Realtime
- **Cross-App Data** - Query other apps' data (if subscribed)
- **Usage Tracking** - Increment usage counters
- **Subscription Info** - Display current tier and limits

## Architecture Comparison

### TestApp (Regular User Pattern)

```typescript
// Direct PostgREST queries
const { data } = await supabase.from('organizations').select('*')

// RLS policies automatically filter to user's org
// User sees ONLY their organization's data
```

### Admin Portal (Admin Pattern)

```typescript
// Admin RPC functions
const { data } = await supabase.rpc('admin_list_organizations')

// SECURITY DEFINER bypasses RLS
// Admin sees ALL organizations' data
```

**Key Difference**: TestApp respects RLS policies (organization-scoped), while Admin Portal bypasses RLS for platform-wide access.

## Testing Checklist

- [ ] Login page loads without errors
- [ ] Magic link email arrives (check spam folder)
- [ ] Clicking magic link redirects to dashboard
- [ ] Dashboard displays user email correctly
- [ ] Sign-out button redirects to login
- [ ] Middleware redirects unauthenticated users to login
- [ ] Authenticated users cannot access /login (redirected to dashboard)
- [ ] Session persists across page refreshes

## Troubleshooting

See [DATABASE_SETUP.md](./DATABASE_SETUP.md#troubleshooting) for common issues and solutions.

## Contributing

This is a reference application. When adding features:

1. ✅ Use PostgREST for data operations
2. ✅ Respect RLS policies (don't use SECURITY DEFINER)
3. ✅ Import from shared packages
4. ✅ Follow standard user access patterns
5. ❌ Don't create admin-only features (use Admin Portal for that)

## Related Documentation

- [Playze Core Architecture](../../docs/playze-core-architecture.md)
- [Elevated Access Architecture](../../docs/playze-core-architecture-elevated-access.md)
- [Implementation Plan](../../docs/initial-playze-high-level-implementation-plan.md)
- [Admin Portal](../admin-portal/README.md)

## License

Private - Playze Platform Internal
