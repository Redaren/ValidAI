# CSP Enforce Mode Guide

This guide explains how to switch the Content Security Policy from report-only mode to enforce mode after testing.

## Current Status

✅ **Report-Only Mode Active**

The CSP is currently configured with the header `Content-Security-Policy-Report-Only`, which means:
- Violations are logged to browser console
- No resources are blocked
- The app functions normally
- This is a TESTING phase

## Prerequisites

Before switching to enforce mode, you MUST:

1. ✅ Complete all testing scenarios (see [Testing Checklist](#testing-checklist))
2. ✅ Verify zero CSP violations in browser console
3. ✅ Test on all major browsers (Chrome, Firefox, Safari)
4. ✅ Test all features thoroughly
5. ✅ Review and document any legitimate violations that need policy adjustments

## Testing Checklist

Use this checklist to ensure thorough testing:

### Authentication Flows
- [ ] Login with email/password
- [ ] Logout
- [ ] Sign up (if applicable)
- [ ] Password reset flow
- [ ] Email verification
- [ ] Session refresh

### Organization Features
- [ ] Organization switching
- [ ] Organization settings
- [ ] Member management
- [ ] Subscription management

### ValidAI Features
- [ ] Document upload
- [ ] Document download
- [ ] Document viewing
- [ ] Processor creation
- [ ] Processor configuration
- [ ] Processor execution
- [ ] Operation results viewing
- [ ] Workbench interface
- [ ] LLM testing

### UI Components
- [ ] All dialogs/modals open and close
- [ ] All dropdowns work
- [ ] All tooltips display
- [ ] All forms submit
- [ ] All buttons function
- [ ] Dark mode toggle (if applicable)

### Internationalization
- [ ] English locale (/en)
- [ ] German locale (/de)
- [ ] Language switching

### Browser Testing
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari

## How to Test for CSP Violations

1. **Start the development server**:
   ```bash
   pnpm --filter @playze/validai dev
   ```

2. **Open the app** in your browser

3. **Open DevTools** (F12) → **Console** tab

4. **Look for CSP violation reports** that look like:
   ```
   [Report Only] Refused to load the script 'https://example.com/bad-script.js'
   because it violates the following Content Security Policy directive: "script-src 'self'"
   ```

5. **For each violation**:
   - Identify the resource causing the violation
   - Determine if it's legitimate (needed for functionality)
   - Either:
     - **Fix the code** to not use that resource, OR
     - **Update the CSP** to allow that resource

## Switching to Enforce Mode

Once testing is complete with **ZERO violations**, follow these steps:

### Step 1: Update next.config.ts

Edit [`apps/validai/next.config.ts`](../../apps/validai/next.config.ts):

**Change this**:
```typescript
{
  key: 'Content-Security-Policy-Report-Only',
  value: [
    // ... directives
  ].join('; '),
}
```

**To this**:
```typescript
{
  key: 'Content-Security-Policy',  // Remove "-Report-Only"
  value: [
    // ... directives (same as before)
  ].join('; '),
}
```

### Step 2: Tighten the Policy for Production (Optional but Recommended)

Consider removing unsafe directives for production:

**Development CSP** (permissive):
```typescript
"script-src 'self' 'unsafe-eval' 'unsafe-inline'"
```

**Production CSP** (strict):
```typescript
"script-src 'self'"
```

You can use environment variables to differentiate:

```typescript
const isDevelopment = process.env.NODE_ENV === 'development'

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self'${isDevelopment ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // ... rest of directives
]

{
  key: 'Content-Security-Policy',
  value: cspDirectives.join('; '),
}
```

### Step 3: Test Again with Enforce Mode

**IMPORTANT**: Resources will now be BLOCKED, not just logged.

1. Restart the dev server:
   ```bash
   pnpm --filter @playze/validai dev
   ```

2. Test ALL features again (use the checklist above)

3. Verify:
   - ✅ No resources are blocked
   - ✅ All features work correctly
   - ✅ No console errors
   - ✅ No broken functionality

### Step 4: Deploy to Staging

Before production, deploy to a staging environment:

1. Deploy to Vercel preview environment
2. Test with production-like configuration
3. Verify SSL certificate works with HSTS
4. Test all features again on staging
5. Monitor for issues

### Step 5: Deploy to Production

Once staging is verified:

1. Deploy to production
2. Verify security headers: `curl -I https://your-domain.com`
3. Check browser DevTools for any violations
4. Monitor error rates and user reports
5. Keep the policy under review for first 24-48 hours

## Common Issues and Solutions

### Issue: Inline Scripts Blocked

**Error**:
```
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self'"
```

**Solution**:
1. Extract inline script to external file, OR
2. Use nonces or hashes, OR
3. Allow `'unsafe-inline'` (less secure)

### Issue: Eval Blocked

**Error**:
```
Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source
```

**Solution**:
1. Refactor code to avoid `eval()`, `new Function()`, etc., OR
2. Allow `'unsafe-eval'` (less secure, but required for Next.js dev mode)

### Issue: External Resource Blocked

**Error**:
```
Refused to connect to 'https://external-api.com' because it violates the following Content Security Policy directive: "connect-src 'self'"
```

**Solution**:
Add the domain to the appropriate directive:
```typescript
"connect-src 'self' https://external-api.com"
```

### Issue: Inline Styles Blocked

**Error**:
```
Refused to apply inline style because it violates the following Content Security Policy directive: "style-src 'self'"
```

**Solution**:
1. Move styles to external CSS, OR
2. Allow `'unsafe-inline'` (required for Radix UI/shadcn)

## Rollback Plan

If issues arise in production:

1. **Immediate Rollback**: Change header back to report-only:
   ```typescript
   key: 'Content-Security-Policy-Report-Only',
   ```

2. **Redeploy**: Push the change and deploy immediately

3. **Investigate**: Review console violations and user reports

4. **Fix**: Update CSP policy based on findings

5. **Retry**: Test again and redeploy when ready

## Monitoring

After enabling enforce mode:

### First 24 Hours
- Monitor error rates closely
- Check for spike in console errors
- Review user reports
- Watch for performance impact

### First Week
- Analyze CSP-related errors
- Collect feedback from users
- Review browser compatibility issues
- Fine-tune policy if needed

### Ongoing
- Regular security audits
- Keep CSP updated when adding new features
- Monitor for new types of attacks
- Stay informed about CSP best practices

## Production-Specific Considerations

### Remove Development-Only Directives

For production, consider removing:

```typescript
// Development only - REMOVE for production
'unsafe-eval'   // Required for Next.js HMR
'unsafe-inline' // Required for some dev tools
```

### Add Violation Reporting

Consider adding a report endpoint to collect violations:

```typescript
// Add to CSP directives
`report-uri https://your-domain.com/api/csp-report`,
`report-to csp-endpoint`
```

Then create an API route to collect reports for analysis.

### Environment-Based Configuration

Use environment detection for different policies:

```typescript
const cspConfig = {
  development: {
    scriptSrc: "'self' 'unsafe-eval' 'unsafe-inline'",
    reportOnly: true,
  },
  production: {
    scriptSrc: "'self'",
    reportOnly: false,
  },
}

const env = process.env.NODE_ENV || 'development'
const config = cspConfig[env]
```

## Verification Commands

### Check Headers are Present
```bash
curl -I https://your-domain.com | grep -i "content-security-policy"
```

### Verify SSL Certificate
```bash
openssl s_client -connect your-domain.com:443
```

### Test Specific Headers
```bash
# Check all security headers
curl -I https://your-domain.com | grep -i "x-frame-options\|x-content-type\|strict-transport\|content-security"
```

## Resources

- [CSP Evaluator](https://csp-evaluator.withgoogle.com/) - Analyze your CSP
- [CSP Validator](https://cspvalidator.org/) - Validate syntax
- [Report URI](https://report-uri.com/) - CSP reporting service
- [MDN CSP Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## Getting Help

If you encounter issues:

1. Review [Security Headers Documentation](./headers.md)
2. Check browser console for specific violations
3. Search MDN and OWASP for CSP best practices
4. Test incrementally - enable one directive at a time
5. Use report-only mode to identify issues safely

---

**Last Updated**: 2025-11-05
**Status**: Ready for testing → enforcement transition
