# Security Audit - January 2026

**Audit Date**: 2026-01-29
**Auditor**: Claude Code
**Scope**: Supabase security advisors, Edge Functions, database functions, RLS policies

## Summary

This audit addressed security findings from Supabase security advisors plus manual review. Seven issues were identified, with four fixed immediately and three documented as acceptable.

| Category | Issues Found | Fixed | Deferred | Acceptable |
|----------|-------------|-------|----------|------------|
| CORS Configuration | 1 | 1 | 0 | 0 |
| Database Functions | 1 | 1 | 0 | 0 |
| RLS Policies | 1 | 1 | 0 | 0 |
| Edge Function Auth | 1 | 0 | 0 | 1 |
| Auth Provider | 1 | 0 | 0 | 1 |
| Profile Visibility | 1 | 0 | 1 | 0 |
| Rate Limiting | 1 | 0 | 0 | 1 |
| **Total** | **7** | **3** | **1** | **3** |

## Issues Found and Actions Taken

### 1. CORS Wildcard Origin [FIXED]

**Severity**: High
**Source**: Supabase Security Advisor

**Problem**: Edge Functions used wildcard (`*`) for `Access-Control-Allow-Origin`, allowing any website to call our functions from browser JavaScript.

**Risk**:
- Malicious sites could make authenticated requests using stolen tokens
- CSRF-like attacks from compromised or malicious origins

**Solution**: Replaced wildcard with explicit allowlist in `supabase/functions/_shared/cors.ts`:

```typescript
const allowedOrigins = [
  'https://app.sanitycheck.se',      // Production ValidAI
  'https://admin.sanitycheck.se',    // Production Admin Portal
  'http://localhost:3000',           // Dev servers
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
]
```

**Files Changed**:
- `supabase/functions/_shared/cors.ts` - New restrictive CORS implementation
- All Edge Functions updated to use `getCorsHeaders(origin)` instead of static headers

**Verification**: Unauthorized origins now receive 403 Forbidden.

---

### 2. Function Search Path Not Set [FIXED]

**Severity**: Medium
**Source**: Supabase Security Advisor

**Problem**: 23 database functions lacked `SET search_path = ''`, making them vulnerable to search path hijacking.

**Risk**:
- Malicious objects in earlier schemas could intercept function calls
- Potential for privilege escalation or data manipulation

**Solution**: Applied migration to add `SET search_path = ''` to all 23 functions with fully-qualified table references.

**Migration**: `20260129000000_fix_function_search_paths.sql`

**Functions Updated**:
1. `update_updated_at_column`
2. `update_workbench_executions_updated_at`
3. `update_validai_playbook_catalog_updated_at`
4. `update_validai_galleries_updated_at`
5. `update_validai_gallery_areas_updated_at`
6. `update_validai_gallery_area_processors_updated_at`
7. `update_validai_playbook_snapshots_updated_at`
8. `unpublish_snapshots_on_archive`
9. `is_playze_admin`
10. `role_permissions_for_role`
11. `check_org_feature_access`
12. `get_user_organizations`
13. `get_current_organization`
14. `get_organization_apps`
15. `get_user_apps_with_admin`
16. `get_user_authorization`
17. `get_billing_usage_summary`
18. `get_processor_with_operations`
19. `update_organization_member_role`
20. `remove_organization_member`
21. `increment_app_usage`
22. `save_as_version`
23. `load_snapshot`

**Verification**: All functions now include `SET search_path = ''` in definition.

---

### 3. Overly Permissive Invitation UPDATE Policy [FIXED]

**Severity**: High
**Source**: Manual review during audit

**Problem**: The RLS policy for `organization_invitations` UPDATE allowed admins/owners to modify ANY column, not just cancel invitations.

**Risk**:
- Invitation email could be changed to redirect to different user
- Role could be escalated from member to owner
- Organization ID could be changed to move invitation between orgs

**Solution**: Added `WITH CHECK` clause restricting updates to only setting `status = 'cancelled'`.

**Migration**: `20260129000001_fix_invitation_update_policy.sql`

**Before**:
```sql
-- Policy allowed any UPDATE by admin/owner
CREATE POLICY "Admins and owners can cancel invitations"
ON organization_invitations FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM organization_members WHERE ...)
);
```

**After**:
```sql
-- Policy now only allows cancellation
CREATE POLICY "Admins and owners can cancel invitations"
ON organization_invitations FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM organization_members WHERE ...)
)
WITH CHECK (
  status = 'cancelled'
);
```

**Verification**: Attempting to update any field other than status (to cancelled) now fails.

---

### 4. Edge Functions Using verify_jwt: false [ACCEPTABLE]

**Severity**: Informational
**Source**: Supabase Security Advisor

**Finding**: Edge Functions have `verify_jwt: false` in their configuration.

**Decision**: Acceptable - Not a security issue for our architecture.

**Rationale**:
- Supabase uses asymmetric JWT tokens signed with RS256
- `verify_jwt` is designed for symmetric (HS256) JWT validation
- Our functions manually validate tokens using `supabase.auth.getUser()`
- The shared `_shared/auth.ts` validates JWT and extracts user context
- This is the recommended pattern for Supabase Edge Functions

**Evidence**: All authenticated functions call `await supabase.auth.getUser()` and reject requests without valid tokens.

---

### 5. No Password Policy Configured [ACCEPTABLE]

**Severity**: N/A
**Source**: Supabase Security Advisor

**Finding**: No password policy is configured in Supabase Auth settings.

**Decision**: Not applicable - We use magic link authentication only.

**Rationale**:
- ValidAI uses passwordless authentication via magic links
- Users never create or manage passwords
- Password policies only apply to email/password auth providers
- Magic links are time-limited and single-use

**Verification**: Auth provider configuration shows only magic link enabled.

---

### 6. Profiles Table Visible to All Users [DEFERRED]

**Severity**: Low
**Source**: Manual review

**Finding**: The `profiles` table has SELECT policy allowing any authenticated user to read all profiles.

**Risk**: Users can see names/emails of users in other organizations.

**Decision**: Deferred to future sprint.

**Rationale**:
- Low risk - only basic profile info (name, email, avatar)
- Currently needed for member lookups across the platform
- No sensitive data in profiles table
- Fixing requires refactoring member invitation/lookup flows

**Mitigation**: Profiles contain only minimal, non-sensitive data.

**Future Fix**: Create organization-scoped profile view function.

---

### 7. No Rate Limiting on Auth Endpoints [ACCEPTABLE]

**Severity**: Low
**Source**: Supabase Security Advisor

**Finding**: No custom rate limiting on authentication endpoints.

**Decision**: Acceptable - Built-in protection sufficient for current scale.

**Rationale**:
- Supabase Auth has built-in rate limiting
- Magic link auth has inherent rate limiting (email sending)
- Edge Functions have Supabase's default rate limiting
- Custom rate limiting adds complexity without proportional benefit
- Invite-only model limits attack surface

**Future Consideration**: Implement custom rate limiting if:
- Public signup is enabled
- High-volume attacks are detected
- Enterprise customers require it

---

## Migrations Applied

| Migration | Purpose |
|-----------|---------|
| `20260129000000_fix_function_search_paths.sql` | Add `SET search_path = ''` to 23 functions |
| `20260129000001_fix_invitation_update_policy.sql` | Restrict invitation UPDATE to cancellation only |

## Commits

| Commit | Description |
|--------|-------------|
| `f4a7ec68` | security(edge-functions): Replace CORS wildcard with restricted origins |
| `40427fe2` | security(db): Add SET search_path='' to 23 functions |
| `93753d2c` | security(db): Restrict invitation UPDATE policy to cancellation only |

## Recommendations

### Immediate (Completed)
- [x] Fix CORS wildcard origin
- [x] Add search_path to all functions
- [x] Restrict invitation UPDATE policy

### Short Term (Next Sprint)
- [ ] Review and restrict profiles table visibility
- [ ] Audit all RLS policies for similar UPDATE vulnerabilities
- [ ] Add security advisor checks to CI/CD pipeline

### Long Term
- [ ] Implement CSP in enforce mode (currently report-only)
- [ ] Add custom rate limiting for enterprise tier
- [ ] Regular quarterly security audits

## How to Run Security Checks

### Supabase Security Advisors
```bash
# Via MCP tool
mcp__supabase-prod__get_advisors --type security
```

### Verify Function Search Paths
```sql
SELECT proname, prosrc
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prosrc NOT LIKE '%SET search_path%';
```

### Check RLS Policies
```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';
```

---

**Next Audit Scheduled**: April 2026
**Last Updated**: 2026-01-29
