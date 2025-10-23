# Supabase Auth Configuration for Admin Portal

This document outlines the required Supabase Dashboard configuration for the Admin Portal authentication to work correctly.

## Required Configuration Steps

### 1. Enable Email Provider

Navigate to **Authentication > Providers > Email** in your Supabase Dashboard.

**Settings:**
- ✅ **Enable Email provider**: ON
- ✅ **Confirm email**: OFF (optional for MVP, can enable later)
- ✅ **Secure email change**: ON (recommended)

### 2. Configure Site URL

Navigate to **Authentication > URL Configuration** in your Supabase Dashboard.

**Site URL:**
```
http://localhost:3001
```

**Note:** In production, change this to your actual domain (e.g., `https://admin.playze.com`)

### 3. Configure Redirect URLs

Navigate to **Authentication > URL Configuration** in your Supabase Dashboard.

**Add the following URLs to "Redirect URLs" (one per line):**
```
http://localhost:3001/auth/callback
http://localhost:3001/
```

**For production, add:**
```
https://admin.playze.com/auth/callback
https://admin.playze.com/
```

### 4. Email Templates (Optional)

Navigate to **Authentication > Email Templates** to customize the magic link email.

**Default template** works fine for MVP. You can customize:
- **Subject**: "Your Admin Portal Magic Link"
- **Body**: Include branding and instructions

### 5. Rate Limiting (Optional)

Navigate to **Authentication > Settings** to configure rate limiting.

**Recommended settings:**
- **Email sign-ins per hour**: 10 (prevents abuse)
- **SMS sign-ins per hour**: N/A (not using SMS)

## Authentication Flow

### How Magic Links Work with PKCE

1. **User submits email** at `/login`
2. **Supabase sends magic link** email with format:
   ```
   https://[PROJECT_REF].supabase.co/auth/v1/verify?token=pkce_xxx&type=magiclink&redirect_to=http://localhost:3001/auth/callback
   ```
3. **User clicks link** in email
4. **Supabase validates token** and redirects to your callback URL with `token_hash` and `type` parameters:
   ```
   http://localhost:3001/auth/callback?token_hash=xxx&type=magiclink
   ```
5. **Callback route** (`apps/admin-portal/app/auth/callback/route.ts`) verifies the token:
   ```typescript
   await supabase.auth.verifyOtp({ token_hash, type })
   ```
6. **Middleware checks auth** on next request and verifies user is in `admin_users` table
7. **User redirected to dashboard** at `/`

### Authorization Flow (Admin Whitelist)

After successful authentication, the middleware (`apps/admin-portal/middleware.ts`) performs these checks:

1. **Check if user is authenticated** (session exists)
2. **Check if user's email is in `admin_users` table**
3. **If not admin**: Redirect to `/unauthorized`
4. **If admin**: Allow access to all routes

## Environment Variables

Ensure your `apps/admin-portal/.env.local` contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_APP_NAME="Playze Admin Portal"
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Adding Admin Users

To whitelist a user for admin access, add their email to the `admin_users` table:

```sql
INSERT INTO public.admin_users (email, role, is_active)
VALUES ('johan.mardfelt@olivab.se', 'super_admin', true);
```

**Note:** Users must be added to `admin_users` BEFORE they can authenticate. The middleware checks this table during the auth flow.

## Troubleshooting

### "Access Denied" at /login
**Cause:** Middleware was blocking unauthenticated access to login page.
**Fix:** Public routes (`/login`, `/unauthorized`, `/auth/callback`) now bypass auth checks entirely.

### "Could not authenticate" after clicking magic link
**Cause:** Supabase Dashboard redirect URLs not configured correctly.
**Fix:** Ensure `http://localhost:3001/auth/callback` is in the Redirect URLs list.

### Redirected to /unauthorized after successful login
**Cause:** User's email not in `admin_users` table.
**Fix:** Add user's email to `admin_users` table with `is_active = true`.

### Magic link expired
**Cause:** Links expire after 60 minutes by default.
**Fix:** Request a new magic link. Consider adjusting expiry in Supabase Dashboard > Authentication > Email Settings.

## Security Considerations

### PKCE Flow
We use PKCE (Proof Key for Code Exchange) flow instead of Implicit flow because:
- ✅ More secure for Server-Side Rendering (SSR)
- ✅ Tokens never exposed in URL fragments
- ✅ Works with Next.js middleware
- ✅ Recommended by Supabase for @supabase/ssr

### Admin Whitelist
The `admin_users` table provides an additional authorization layer:
- ✅ Only whitelisted emails can access Admin Portal
- ✅ Regular users with Supabase accounts cannot access admin routes
- ✅ Separation of authentication (Supabase Auth) and authorization (custom RLS policy)

### Row Level Security (RLS)
All database operations in the Admin Portal respect RLS policies:
- ✅ Admin Portal uses ANON key (not service role key)
- ✅ RLS policies check `admin_users` table membership
- ✅ Service role operations use Edge Functions (not exposed to client)

## Testing the Flow

### Manual Test Steps

1. **Start the dev server:**
   ```bash
   pnpm --filter @playze/admin-portal dev
   ```

2. **Navigate to login page:**
   ```
   http://localhost:3001/login
   ```

3. **Enter admin email** (e.g., `johan.mardfelt@olivab.se`)

4. **Check email** and click the magic link

5. **Verify redirect** to callback URL with token parameters

6. **Confirm login** - should redirect to `/` dashboard

7. **Check authorization** - middleware should verify `admin_users` membership

### Debugging Tips

**Check Supabase logs:**
- Navigate to **Authentication > Logs** in Supabase Dashboard
- Look for "magic link sent" and "verification" events

**Check browser console:**
- Look for Supabase client errors
- Check Network tab for failed requests

**Check server logs:**
- Callback route logs errors with `console.error()`
- Middleware logs admin verification failures

**Verify database:**
```sql
-- Check if user exists in auth.users
SELECT id, email, created_at FROM auth.users WHERE email = 'your-email@example.com';

-- Check if user is in admin_users
SELECT * FROM public.admin_users WHERE email = 'your-email@example.com';
```

## Production Deployment

When deploying to production:

1. **Update Site URL** to production domain
2. **Add production Redirect URLs** to whitelist
3. **Update .env.local** with production Supabase credentials
4. **Enable email confirmation** (optional but recommended)
5. **Configure custom SMTP** for branded emails (optional)
6. **Set up monitoring** for auth failures and unauthorized access attempts

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side-rendering)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [PKCE Flow Explanation](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-proof-key-for-code-exchange-pkce)
