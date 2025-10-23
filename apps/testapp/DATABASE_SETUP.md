# TestApp Database Setup

This document describes how to register TestApp in the Playze Core database.

## Prerequisites

- Admin Portal must be running and accessible
- You must have admin access to the Supabase SQL Editor OR use the Admin Portal

## Step 1: Register App in Database

Run the following SQL commands in the Supabase SQL Editor:

```sql
-- 1. Register the TestApp application
INSERT INTO apps (id, name, description, is_active)
VALUES (
  'testapp',
  'TestApp',
  'Minimal reference application for Playze Core platform',
  true
);

-- 2. Create app tiers (Free tier for testing)
INSERT INTO app_tiers (app_id, tier_name, display_name, features, limits)
VALUES
  (
    'testapp',
    'free',
    'Free',
    '{"dashboard_access": true}'::jsonb,
    '{"users": 5}'::jsonb
  ),
  (
    'testapp',
    'pro',
    'Professional',
    '{"dashboard_access": true, "advanced_features": true}'::jsonb,
    '{"users": 50}'::jsonb
  );

-- 3. Verify registration
SELECT * FROM apps WHERE id = 'testapp';
SELECT * FROM app_tiers WHERE app_id = 'testapp';
```

## Step 2: Create Test Organization and User

### Option A: Using Admin Portal (Recommended)

1. Navigate to Admin Portal: `http://localhost:3001`
2. Go to **Organizations** → **Create New Organization**
3. Fill in organization details:
   - **Name**: Test Organization
   - **Slug**: test-org
   - **Description**: Organization for testing TestApp
4. In the "App Subscriptions" section:
   - Select **testapp** from dropdown
   - Select **free** tier
   - Click **Add Subscription**
5. Optionally add an initial owner email to invite them
6. Click **Create Organization**
7. Once created, go to the organization detail page and invite a test user

### Option B: Using SQL (Manual)

```sql
-- 1. Create test organization
INSERT INTO organizations (id, name, slug, description)
VALUES (
  gen_random_uuid(),
  'Test Organization',
  'test-org',
  'Organization for testing TestApp'
)
RETURNING id;  -- Save this UUID for next steps

-- 2. Assign TestApp subscription to organization
-- Replace <org_id> with the UUID from step 1
-- Replace <tier_id> with the tier ID from app_tiers table

INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  tier_name,
  status
)
VALUES (
  '<org_id>',
  'testapp',
  (SELECT id FROM app_tiers WHERE app_id = 'testapp' AND tier_name = 'free'),
  'free',
  'active'
);

-- 3. Invite a test user (requires using Supabase Auth API)
-- This is easier done through the Admin Portal UI
```

## Step 3: Environment Setup

Create a `.env.local` file in `apps/testapp/`:

```bash
# Copy from .env.example
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Step 4: Install Dependencies and Run

```bash
# From repository root
pnpm install

# Run TestApp
pnpm --filter @playze/testapp dev

# TestApp will be available at http://localhost:3003
```

## Step 5: Test the Flow

1. Navigate to `http://localhost:3003`
2. You should be redirected to `/login`
3. Enter the email of the user you invited
4. Check your email for the magic link
5. Click the magic link
6. You should be redirected to `/dashboard`
7. Verify you see your email and user ID
8. Click **Sign Out** to test logout functionality

## Verification Checklist

- ✅ TestApp appears in `apps` table
- ✅ Free and Pro tiers created in `app_tiers` table
- ✅ Test organization created with testapp subscription
- ✅ Test user invited and can receive magic link
- ✅ Login flow works (magic link → callback → dashboard)
- ✅ Dashboard displays user information
- ✅ Sign out redirects to login page

## Troubleshooting

### "App not found" error
- Verify `testapp` exists in `apps` table with `is_active = true`
- Run: `SELECT * FROM apps WHERE id = 'testapp';`

### Magic link not arriving
- Check spam folder
- Verify Supabase Auth email settings in Supabase Dashboard
- Ensure user was invited to an organization with active testapp subscription

### Redirect loop on login
- Clear browser cookies
- Check middleware is not blocking callback route
- Verify `.env.local` has correct Supabase credentials

### Cannot access dashboard after login
- Verify user has valid session (check browser dev tools → Application → Cookies)
- Check middleware logic in `apps/testapp/middleware.ts`
- Ensure callback route exchanged code for session successfully

## Next Steps (Phase 2)

After Phase 1 is working, Phase 2 will add:

- Organization switcher (for users in multiple orgs)
- Feature gating based on subscription tier
- App-specific tables with RLS policies
- Cross-app data access examples
- Real-time subscriptions demo

## Architecture Notes

**Pattern Used**: Regular User Access (PostgREST + RLS)

- Uses `supabase.from('table').select()` for data operations
- Respects Row Level Security policies
- Organization-scoped data access
- NO admin SECURITY DEFINER functions (those are only for Admin Portal)

**Key Files**:
- `middleware.ts` - Session management and auth checks
- `app/login/page.tsx` - Magic link authentication
- `app/auth/callback/route.ts` - Auth callback handler
- `app/dashboard/page.tsx` - Protected dashboard page
