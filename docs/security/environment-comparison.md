# Security Headers: Development vs Production

This document shows the differences in security headers between development and production environments.

## Configuration Overview

The security headers in [`apps/validai/next.config.ts`](../../apps/validai/next.config.ts) are **environment-aware**, using `process.env.NODE_ENV` to apply different policies.

## Header Comparison

### Development Environment (`NODE_ENV=development`)

**Test Command:**
```bash
pnpm --filter @playze/validai dev
curl -I http://192.168.86.239:3000
```

**Headers Applied:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://xczippkxxdqlvaacjexj.supabase.co; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://xczippkxxdqlvaacjexj.supabase.co wss://xczippkxxdqlvaacjexj.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**Missing (Intentionally):**
- ❌ Strict-Transport-Security (HSTS not needed for localhost HTTP)
- ❌ `upgrade-insecure-requests` in CSP (HTTP is fine in dev)

**Permissive (For Developer Experience):**
- ✅ `'unsafe-eval'` in script-src (required for Next.js Hot Module Replacement)
- ✅ `'unsafe-inline'` in script-src (helpful for debugging)

---

### Production Environment (`NODE_ENV=production`)

**Test Command:**
```bash
pnpm --filter @playze/validai build
NODE_ENV=production pnpm --filter @playze/validai start
curl -I https://your-domain.com
```

**Headers Applied:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://xczippkxxdqlvaacjexj.supabase.co; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://xczippkxxdqlvaacjexj.supabase.co wss://xczippkxxdqlvaacjexj.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

**Added in Production:**
- ✅ Strict-Transport-Security (HSTS enforces HTTPS for 1 year)
- ✅ `upgrade-insecure-requests` in CSP (forces all HTTP → HTTPS)

**Strict Security (Maximum Protection):**
- ✅ `script-src 'self'` ONLY (no unsafe-eval, no unsafe-inline)
- ✅ All resources must be from whitelisted domains
- ✅ HTTPS enforced at multiple levels

---

## Side-by-Side Comparison

| Header/Directive | Development | Production | Why Different? |
|------------------|-------------|------------|----------------|
| **X-Frame-Options** | DENY | DENY | Same |
| **X-Content-Type-Options** | nosniff | nosniff | Same |
| **Referrer-Policy** | strict-origin-when-cross-origin | strict-origin-when-cross-origin | Same |
| **HSTS** | ❌ Not included | ✅ max-age=31536000 | Requires valid SSL |
| **Permissions-Policy** | camera=(), microphone=()... | camera=(), microphone=()... | Same |
| **CSP script-src** | 'self' 'unsafe-eval' 'unsafe-inline' | 'self' | HMR needs eval in dev |
| **CSP upgrade-insecure-requests** | ❌ Not included | ✅ Included | HTTP ok in dev, force HTTPS in prod |
| **CSP style-src** | 'self' 'unsafe-inline' fonts.googleapis.com | 'self' 'unsafe-inline' fonts.googleapis.com | Same (Radix UI needs inline) |
| **CSP img-src** | 'self' data: supabase | 'self' data: supabase | Same |
| **CSP connect-src** | 'self' supabase wss://supabase | 'self' supabase wss://supabase | Same |

---

## Key Differences Explained

### 1. HSTS (Strict-Transport-Security)

**Development:**
```typescript
// HSTS: Only in production (requires valid SSL certificate)
...(isProduction ? [{
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains',
}] : []),
```

- Not included in dev because localhost uses HTTP
- HSTS would have no effect without valid SSL certificate
- Including it wouldn't cause harm, but it's unnecessary

**Production:**
- Enforces HTTPS for 1 year (31536000 seconds)
- Applies to all subdomains (`includeSubDomains`)
- Browsers will automatically upgrade HTTP → HTTPS

### 2. CSP script-src Directive

**Development:**
```typescript
// Scripts: Permissive in dev (unsafe-eval for HMR), strict in prod
`script-src 'self'${isDevelopment ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
```

Becomes: `script-src 'self' 'unsafe-eval' 'unsafe-inline'`

- `'unsafe-eval'` - Required for Next.js Hot Module Replacement (HMR)
- `'unsafe-inline'` - Helpful for inline scripts during development
- Without these, HMR would break and dev experience would suffer

**Production:**
Becomes: `script-src 'self'`

- No `'unsafe-eval'` - Maximum security, no eval() allowed
- No `'unsafe-inline'` - No inline scripts allowed
- Only scripts from same origin (`'self'`) can execute
- Significantly reduces XSS attack surface

### 3. CSP upgrade-insecure-requests Directive

**Development:**
```typescript
// Upgrade insecure requests: Only in production (forces HTTPS)
...(isProduction ? ["upgrade-insecure-requests"] : []),
```

- Not included in dev (HTTP is normal for localhost)
- Would interfere with local development on `http://localhost:3000`

**Production:**
- Automatically upgrades all HTTP requests to HTTPS
- Prevents mixed content warnings
- Ensures all resources load over secure connections

---

## Testing Environment Configuration

### Verify Development Headers

```bash
# Start dev server
pnpm --filter @playze/validai dev

# Check headers
curl -I http://192.168.86.239:3000

# Look for:
# ✅ CSP with 'unsafe-eval' 'unsafe-inline'
# ❌ No HSTS
# ❌ No upgrade-insecure-requests
```

### Verify Production Headers

```bash
# Build for production
pnpm --filter @playze/validai build

# Start production server
NODE_ENV=production pnpm --filter @playze/validai start

# Check headers
curl -I http://localhost:3000

# OR deploy to Vercel and check:
curl -I https://your-app.vercel.app

# Look for:
# ✅ CSP WITHOUT 'unsafe-eval' or 'unsafe-inline'
# ✅ HSTS present
# ✅ upgrade-insecure-requests in CSP
```

---

## Benefits of Environment-Aware Configuration

### Development Benefits

✅ **HMR Works**: Next.js hot reloading functions normally
✅ **No HTTPS Required**: Can develop on HTTP localhost
✅ **Easy Debugging**: Inline scripts and eval allowed
✅ **Fast Iteration**: No CSP violations blocking development

### Production Benefits

✅ **Maximum Security**: Strict CSP without unsafe directives
✅ **HTTPS Enforced**: Multiple layers of HTTPS enforcement
✅ **XSS Protection**: No eval() or inline scripts allowed
✅ **Best Practices**: Follows OWASP security recommendations

### Operational Benefits

✅ **No Manual Changes**: Environment auto-detected
✅ **Same Codebase**: No separate configs to maintain
✅ **Confidence**: Dev closely mirrors prod, just more permissive
✅ **Clear Intent**: Comments explain each conditional

---

## Deployment Checklist

Before deploying to production, verify:

- [ ] `NODE_ENV=production` is set in deployment environment
- [ ] Valid SSL certificate is configured
- [ ] HSTS is present in production headers
- [ ] CSP script-src does NOT include 'unsafe-eval' or 'unsafe-inline'
- [ ] CSP includes `upgrade-insecure-requests`
- [ ] All features work without CSP violations
- [ ] Test on staging environment first

---

## Troubleshooting

### Problem: HSTS appearing in development

**Solution:** Check that `NODE_ENV=development` is set. If using Vercel preview, it might be set to `production`.

### Problem: HMR not working

**Solution:** Verify you're in development mode and `'unsafe-eval'` is in CSP script-src.

### Problem: CSP violations in production

**Solution:** Check browser console for violations and adjust CSP policy. May need to add legitimate domains.

### Problem: Mixed content warnings in production

**Solution:** Verify `upgrade-insecure-requests` is in CSP and HSTS is present.

---

## References

- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [CSP Best Practices](https://content-security-policy.com/)
- [HSTS Preload](https://hstspreload.org/)
- [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/)

---

**Last Updated**: 2025-11-05
**Status**: Environment-aware configuration active
