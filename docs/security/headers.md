# Security Headers Configuration

This document details the security headers implemented for ValidAI to protect against common web vulnerabilities before production deployment.

## Overview

Security headers are HTTP response headers that instruct browsers on how to behave when handling the application's content. They provide defense-in-depth against various attack vectors including XSS, clickjacking, MIME sniffing, and protocol downgrade attacks.

## Implementation Status

**Location**: [`apps/validai/next.config.ts`](../../apps/validai/next.config.ts)

All security headers are configured in the Next.js configuration file using the `headers()` function, which applies them to all routes automatically.

## Configured Headers

### 1. X-Frame-Options: DENY

**Purpose**: Prevents clickjacking attacks by disallowing the page from being embedded in iframes.

**Value**: `DENY`

**Impact**: The ValidAI application cannot be embedded in any iframe, even on the same domain.

**Alternative**: Use `SAMEORIGIN` if you need to embed the app in iframes on your own domain.

```typescript
{
  key: 'X-Frame-Options',
  value: 'DENY',
}
```

### 2. X-Content-Type-Options: nosniff

**Purpose**: Prevents MIME type sniffing, which can lead to XSS vulnerabilities.

**Value**: `nosniff`

**Impact**: Browsers will not try to guess the content type of files and will respect the declared `Content-Type` header.

```typescript
{
  key: 'X-Content-Type-Options',
  value: 'nosniff',
}
```

### 3. Referrer-Policy: strict-origin-when-cross-origin

**Purpose**: Controls how much referrer information is sent with requests.

**Value**: `strict-origin-when-cross-origin`

**Impact**:
- Same-origin requests: Full URL is sent
- Cross-origin HTTPS→HTTPS: Only origin is sent
- Cross-origin HTTPS→HTTP: No referrer is sent

This balances privacy with functionality for analytics and debugging.

```typescript
{
  key: 'Referrer-Policy',
  value: 'strict-origin-when-cross-origin',
}
```

### 4. Strict-Transport-Security (HSTS)

**Purpose**: Forces browsers to only connect via HTTPS, preventing protocol downgrade attacks.

**Value**: `max-age=31536000; includeSubDomains`

**Impact**:
- Browsers will automatically upgrade HTTP requests to HTTPS for 1 year
- Applies to all subdomains
- **Only works with valid SSL certificates** (not on localhost)

**Production Note**: In production with valid SSL, this header provides strong protection. In development, it has no effect on localhost.

```typescript
{
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains',
}
```

### 5. Permissions-Policy

**Purpose**: Restricts which browser features and APIs can be used.

**Value**: `camera=(), microphone=(), geolocation=(), interest-cohort=()`

**Impact**:
- Camera API: Blocked
- Microphone API: Blocked
- Geolocation API: Blocked
- FLoC (Federated Learning of Cohorts): Blocked

**Rationale**: ValidAI doesn't require access to these sensitive browser features. Blocking them reduces the attack surface and improves user privacy.

```typescript
{
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
}
```

### 6. CORS (Cross-Origin Resource Sharing)

**Purpose**: Controls which domains can make cross-origin requests to Edge Functions from browsers.

**Location**: [`supabase/functions/_shared/cors.ts`](../../supabase/functions/_shared/cors.ts)

**Allowed Origins**:
| Origin | Environment | Purpose |
|--------|-------------|---------|
| `https://app.sanitycheck.se` | Production | ValidAI application |
| `https://admin.sanitycheck.se` | Production | Admin Portal |
| `http://localhost:3000` | Development | Primary dev server |
| `http://localhost:3001-3004` | Development | Additional dev servers |

**Implementation**:
- Origin is validated against allowlist on every request
- Preflight (OPTIONS) requests return 403 Forbidden for unauthorized origins
- CORS headers only included in response when origin is allowed
- No wildcard (`*`) origins permitted

**Impact**:
- Browsers enforce CORS restrictions on cross-origin fetch/XHR requests
- Unauthorized origins cannot call Edge Functions from browser JavaScript
- Server-to-server requests (e.g., from Next.js API routes) are not affected by CORS

**Security Note**: CORS was updated on 2026-01-29 to replace wildcard origin (`*`) with explicit allowlist. See [Security Audit 2026-01](./security-audit-2026-01.md) for details.

### 7. Content-Security-Policy (CSP)

**Purpose**: The most powerful security header. Defines which resources can be loaded and executed, preventing XSS attacks.

**Current Status**: **Report-Only Mode** (testing phase)

**Header**: `Content-Security-Policy-Report-Only`

This mode logs violations to the browser console without blocking resources, allowing safe testing before enforcement.

#### CSP Directives Explained

```typescript
{
  key: 'Content-Security-Policy-Report-Only',
  value: [
    // Default fallback for all resource types
    "default-src 'self'",

    // JavaScript sources
    // 'unsafe-eval': Required for Next.js Hot Module Replacement (HMR) in dev
    // 'unsafe-inline': Temporarily allowed for testing (should be removed in production)
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",

    // CSS sources
    // 'unsafe-inline': Required for Radix UI / shadcn/ui inline styles
    // fonts.googleapis.com: Google Fonts CSS
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // Image sources
    // data:: Data URIs for inline images
    // xczippkxxdqlvaacjexj.supabase.co: Supabase Storage for document files
    "img-src 'self' data: https://xczippkxxdqlvaacjexj.supabase.co",

    // Font sources
    // data:: Data URIs for inline fonts
    // fonts.gstatic.com: Google Fonts files
    "font-src 'self' data: https://fonts.gstatic.com",

    // API/WebSocket connections
    // xczippkxxdqlvaacjexj.supabase.co: Supabase REST API
    // wss://xczippkxxdqlvaacjexj.supabase.co: Supabase Realtime
    "connect-src 'self' https://xczippkxxdqlvaacjexj.supabase.co wss://xczippkxxdqlvaacjexj.supabase.co",

    // Iframe sources (none allowed)
    "frame-src 'none'",

    // Plugin sources (none allowed)
    "object-src 'none'",

    // Base URL restrictions
    "base-uri 'self'",

    // Form submission targets
    "form-action 'self'",

    // Iframe embedding restrictions (redundant with X-Frame-Options but recommended)
    "frame-ancestors 'none'",

    // Upgrade insecure requests to HTTPS
    "upgrade-insecure-requests",
  ].join('; '),
}
```

#### External Resources Whitelist

Based on codebase audit, these external domains are allowed:

| Domain | Purpose | Directives | Notes |
|--------|---------|------------|-------|
| `xczippkxxdqlvaacjexj.supabase.co` | Supabase Platform | `connect-src`, `img-src` | Database, Auth, Storage, Realtime |
| `fonts.googleapis.com` | Google Fonts CSS | `style-src` | Geist font CSS |
| `fonts.gstatic.com` | Google Fonts Files | `font-src` | Geist font files |

**Edge Functions Note**: Anthropic API (`api.anthropic.com`) and Mistral API (`api.mistral.ai`) are called from Edge Functions (server-side) and do NOT need to be in the CSP since they're not client-side resources.

## Testing CSP

### Current Phase: Report-Only Mode

The CSP is currently in **report-only mode** (`Content-Security-Policy-Report-Only` header). This means:

✅ Violations are logged to the browser console
✅ No resources are blocked
✅ The app functions normally
✅ You can identify issues before enforcement

### How to Test

1. **Start the development server**:
   ```bash
   pnpm --filter @playze/validai dev
   ```

2. **Open the app in a browser** and navigate to:
   - Homepage: `http://192.168.86.239:3000`
   - All locale paths: `/en`, `/de`
   - All authenticated routes

3. **Open Browser DevTools** (F12) and check the **Console** tab

4. **Look for CSP violations** formatted like:
   ```
   [Report Only] Refused to load the script 'https://example.com/script.js'
   because it violates the following Content Security Policy directive: "script-src 'self'"
   ```

5. **Test all features thoroughly**:
   - [ ] User authentication (login, logout, signup, password reset)
   - [ ] Organization switching
   - [ ] Document upload and viewing
   - [ ] Processor creation and configuration
   - [ ] Processor execution
   - [ ] Workbench (LLM testing interface)
   - [ ] All UI interactions (dialogs, dropdowns, tooltips)
   - [ ] All locale languages

6. **Document any violations** and adjust the CSP policy accordingly

### Moving to Enforce Mode

Once testing is complete with no violations:

1. Change the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`:

```typescript
{
  key: 'Content-Security-Policy',  // Remove "-Report-Only"
  value: [
    // Same directives...
  ].join('; '),
}
```

2. **Tighten the policy** for production:
   - Remove `'unsafe-inline'` from `script-src` if possible
   - Use nonces or hashes for inline scripts
   - Remove `'unsafe-eval'` for production (only needed in dev)

3. **Test thoroughly again** - resources will now be BLOCKED on violations

4. **Deploy to staging** before production

## Production Hardening

### Recommended Changes for Production

1. **Remove unsafe directives** (if possible):
   ```typescript
   // Development (permissive)
   "script-src 'self' 'unsafe-eval' 'unsafe-inline'"

   // Production (strict)
   "script-src 'self'"
   ```

2. **Use nonces for inline scripts** (if inline scripts are required):
   ```typescript
   // Generate a nonce per request
   const nonce = generateNonce()

   // Add to CSP
   `script-src 'self' 'nonce-${nonce}'`

   // Use in HTML
   <script nonce={nonce}>...</script>
   ```

3. **Add CSP violation reporting** (optional):
   ```typescript
   // Add to CSP directives
   `report-uri https://your-domain.com/api/csp-report`
   ```

4. **Test with different browsers**:
   - Chrome/Edge (Chromium)
   - Firefox
   - Safari

### Environment-Specific Configuration

You can use environment variables to have different CSP policies:

```typescript
const isDevelopment = process.env.NODE_ENV === 'development'

const scriptSrc = isDevelopment
  ? "'self' 'unsafe-eval' 'unsafe-inline'"  // Permissive for dev
  : "'self'"  // Strict for production
```

## Security Considerations

### Why These Headers Matter

1. **XSS Protection**: CSP prevents execution of unauthorized scripts
2. **Clickjacking Protection**: X-Frame-Options prevents UI redressing attacks
3. **MIME Confusion**: X-Content-Type-Options prevents content type attacks
4. **Privacy**: Referrer-Policy limits information leakage
5. **HTTPS Enforcement**: HSTS prevents protocol downgrade attacks
6. **Feature Restriction**: Permissions-Policy limits attack surface

### Attack Vectors Mitigated

| Attack Type | Mitigated By | Severity |
|-------------|--------------|----------|
| Cross-Site Scripting (XSS) | CSP | Critical |
| Clickjacking | X-Frame-Options, frame-ancestors | High |
| MIME Sniffing | X-Content-Type-Options | Medium |
| Protocol Downgrade | HSTS | High |
| Unauthorized API Access | CORS | High |
| Information Leakage | Referrer-Policy | Low |
| Unwanted Feature Access | Permissions-Policy | Medium |

## Troubleshooting

### Common CSP Violations

1. **Inline scripts blocked**:
   - **Cause**: `<script>alert('test')</script>` in HTML
   - **Fix**: Extract to external file or use nonces

2. **Inline styles blocked**:
   - **Cause**: `<div style="color: red">` or `<style>` tags
   - **Fix**: Use CSS files or allow `'unsafe-inline'` (less secure)

3. **External resource blocked**:
   - **Cause**: Loading from a domain not in CSP
   - **Fix**: Add domain to appropriate directive

4. **eval() blocked**:
   - **Cause**: Using `eval()`, `new Function()`, etc.
   - **Fix**: Refactor code or allow `'unsafe-eval'` (less secure)

### Debugging Tips

1. **Check browser console** for CSP violation reports
2. **Use report-only mode** first to identify issues
3. **Test incrementally** - add directives one at a time
4. **Use browser DevTools Network tab** to see blocked resources
5. **Check Next.js build output** for warnings

## References

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [Google Web Fundamentals: Security](https://web.dev/security/)

## Maintenance

### When to Update Headers

1. **Adding new external services**: Update CSP directives
2. **Changing font providers**: Update `font-src` and `style-src`
3. **Adding analytics/monitoring**: Update `script-src` and `connect-src`
4. **Using new browser APIs**: Update `Permissions-Policy`

### Regular Review

- Review CSP violations monthly
- Audit external domains quarterly
- Test headers after major framework updates
- Keep up with OWASP security recommendations

## Next Steps

1. ✅ **Phase 1 Complete**: Basic headers implemented
2. ✅ **Phase 2 Complete**: CSP in report-only mode
3. ⏳ **Phase 3 Pending**: Test all features and collect violations
4. ⏳ **Phase 4 Pending**: Iterate CSP based on violations
5. ⏳ **Phase 5 Pending**: Switch to enforce mode
6. ⏳ **Phase 6 Pending**: Production deployment

---

**Last Updated**: 2026-01-29
**Author**: Claude Code
**Review Status**: Updated with CORS configuration
