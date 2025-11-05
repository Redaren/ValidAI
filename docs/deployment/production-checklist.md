# Production Deployment Checklist

This checklist ensures ValidAI is production-ready with proper security, performance, and operational configurations.

## Security

### Security Headers
- [x] **X-Frame-Options**: Configured (DENY)
- [x] **X-Content-Type-Options**: Configured (nosniff)
- [x] **Referrer-Policy**: Configured (strict-origin-when-cross-origin)
- [x] **Strict-Transport-Security**: Configured (max-age=31536000; includeSubDomains)
- [x] **Permissions-Policy**: Configured (camera, microphone, geolocation blocked)
- [ ] **Content-Security-Policy**: In report-only mode, needs testing and enforcement

See [Security Headers Documentation](../security/headers.md) for details.

### CSP Validation (REQUIRED BEFORE PRODUCTION)
- [ ] Test authentication flows (login, logout, password reset)
- [ ] Test organization switching
- [ ] Test document upload/download
- [ ] Test processor execution
- [ ] Test workbench interface
- [ ] Test all UI components (dialogs, dropdowns, tooltips)
- [ ] Test all locale languages (en, de)
- [ ] Verify no CSP violations in browser console
- [ ] Switch CSP from report-only to enforce mode
- [ ] Final testing with enforce mode
- [ ] Test on Chrome, Firefox, and Safari

### Authentication & Authorization
- [ ] Supabase RLS policies enabled on all tables
- [ ] Service role key stored as environment variable (not in code)
- [ ] Anon key properly configured
- [ ] JWT validation in Edge Functions
- [ ] Session expiration configured appropriately
- [ ] Organization context validation working

### Data Protection
- [ ] Database backups configured
- [ ] Sensitive data encrypted at rest
- [ ] API keys stored in Supabase secrets (not .env files)
- [ ] No secrets committed to git
- [ ] .env files in .gitignore

### Secrets Management
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] `ANTHROPIC_API_KEY` set in Supabase secrets
- [ ] `MISTRAL_API_KEY` set in Supabase secrets (if using Mistral)
- [ ] Database connection string secured

## Performance

### Build & Optimization
- [ ] Production build completes without errors: `pnpm --filter @playze/validai build`
- [ ] No TypeScript errors: `pnpm --filter @playze/validai typecheck`
- [ ] No ESLint errors: `pnpm --filter @playze/validai lint`
- [ ] Bundle size reviewed and optimized
- [ ] Code splitting implemented for large pages
- [ ] Images optimized (using next/image)
- [ ] Fonts optimized (using next/font)

### Caching
- [ ] Static assets cached appropriately
- [ ] API responses cached where appropriate
- [ ] Database queries optimized
- [ ] Indexes created on frequently queried columns

### Edge Functions
- [ ] All Edge Functions deployed: `npx supabase functions deploy`
- [ ] Edge Functions tested with production data
- [ ] Cold start times acceptable
- [ ] Error handling implemented
- [ ] Timeouts configured appropriately

## Infrastructure

### Hosting (Vercel)
- [ ] Production domain configured
- [ ] Custom domain DNS records set up
- [ ] SSL certificate active and valid
- [ ] Environment variables configured in Vercel dashboard
- [ ] Build settings verified ([apps/validai/vercel.json](../../apps/validai/vercel.json))
- [ ] Preview deployments working
- [ ] Production branch configured (main)

### Database (Supabase)
- [ ] Production Supabase project created
- [ ] All migrations applied: `npx supabase db push`
- [ ] Database pooling configured
- [ ] Connection limits reviewed
- [ ] Realtime enabled (if needed)
- [ ] Database backups scheduled

### Monitoring
- [ ] Error tracking configured (consider Sentry)
- [ ] Performance monitoring enabled
- [ ] Uptime monitoring configured
- [ ] Log aggregation set up
- [ ] Alerts configured for critical errors

## Testing

### Functional Testing
- [ ] All user flows tested end-to-end
- [ ] Authentication tested
- [ ] Organization management tested
- [ ] Document processing tested
- [ ] Processor execution tested
- [ ] Workbench tested
- [ ] Mobile responsive design tested
- [ ] Cross-browser testing completed

### Load Testing
- [ ] API endpoints load tested
- [ ] Edge Functions load tested
- [ ] Database queries optimized for scale
- [ ] Rate limiting implemented (if needed)

### Security Testing
- [ ] Penetration testing completed (if required)
- [ ] OWASP top 10 vulnerabilities reviewed
- [ ] SQL injection testing
- [ ] XSS testing
- [ ] CSRF protection verified

## Compliance

### Data Privacy
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] GDPR compliance reviewed (if applicable)
- [ ] Data retention policies defined
- [ ] User data export functionality implemented
- [ ] User data deletion functionality implemented

### Legal
- [ ] License files included
- [ ] Third-party licenses reviewed
- [ ] Attribution requirements met
- [ ] Cookie consent implemented (if needed)

## Operations

### Documentation
- [x] Security headers documented
- [ ] API documentation up-to-date
- [ ] Deployment process documented
- [ ] Troubleshooting guide created
- [ ] Runbook for common issues created
- [ ] Architecture diagrams updated

### Support
- [ ] Support email/system configured
- [ ] Error messages user-friendly
- [ ] Help documentation available
- [ ] Admin contact information displayed
- [ ] Feedback mechanism implemented

### Maintenance
- [ ] Rollback plan documented
- [ ] Database backup restoration tested
- [ ] Incident response plan created
- [ ] Maintenance window schedule defined
- [ ] Update strategy documented

## Pre-Launch

### Final Checks (DO THIS LAST)
- [ ] CSP in enforce mode (not report-only)
- [ ] All security headers verified: `curl -I https://your-domain.com`
- [ ] SSL certificate valid: `openssl s_client -connect your-domain.com:443`
- [ ] No console errors in production build
- [ ] No CSP violations in production build
- [ ] Performance tested under load
- [ ] Mobile experience verified
- [ ] All team members have access to production systems
- [ ] Monitoring dashboards accessible
- [ ] Backup and restore procedures tested

### Go-Live
- [ ] Production deployment executed
- [ ] DNS changes propagated
- [ ] SSL certificate issued and valid
- [ ] Monitoring active and alerting
- [ ] Team notified of go-live
- [ ] Post-deployment smoke tests passed
- [ ] User acceptance testing (UAT) completed

## Post-Launch

### Immediate (First 24 Hours)
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Monitor user feedback
- [ ] Check security header compliance
- [ ] Verify CSP is not blocking resources
- [ ] Check database performance

### First Week
- [ ] Review error logs
- [ ] Review performance metrics
- [ ] Review user feedback
- [ ] Check for security issues
- [ ] Optimize based on real-world usage
- [ ] Update documentation based on issues

### First Month
- [ ] Comprehensive security audit
- [ ] Performance optimization review
- [ ] User satisfaction survey
- [ ] Feature usage analytics
- [ ] Cost optimization review
- [ ] Documentation improvements

## Critical Security Note

**BEFORE** deploying to production:

1. ✅ Basic security headers are configured
2. ⚠️ **CSP MUST be tested and switched to enforce mode**
3. ⚠️ **All secrets MUST be in environment variables, not in code**
4. ⚠️ **SSL certificate MUST be valid**
5. ⚠️ **All migrations MUST be applied**

**DO NOT SKIP** the CSP testing phase. Running CSP in report-only mode in production is NOT secure.

## Resources

- [Security Headers Documentation](../security/headers.md)
- [ValidAI Architecture](../../apps/validai/docs/)
- [Framework Architecture](../architecture/validai-core-architecture.md)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Deployment](https://vercel.com/docs)
- [Supabase Production](https://supabase.com/docs/guides/platform/going-into-prod)

---

**Last Updated**: 2025-11-05
**Status**: Security headers phase complete, CSP testing required
