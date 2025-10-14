# Input for Processor Publishing Planning

**Date:** 2025-10-14
**Status:** Planning Phase
**Context:** Discussion about enabling external processor access for non-authenticated users

## Business Problem

### Use Case Scenario
An HR department creates a processor called "New Employee Agreement Checker" with operations that validate employment agreements. A mid-level manager needs to validate a proposed employee agreement before hiring, but:

- The manager should NOT need a ValidAI account
- The process should be as simple as possible (non-IT friendly)
- The processor should be accessible via familiar channels (email links, SharePoint, etc.)

### Key Requirement
**Enable processor creators (e.g., HR) to publish processors that can be used by anyone without requiring authentication or account creation.**

### Distribution Scenarios
1. **Email:** "Dear Midlevel, check the agreement with this agreement checker and if need help get back to us /HR" [includes link]
2. **SharePoint:** "Drop the agreement here to test it" [embedded widget or link]
3. **Internal wiki/portal:** Direct link or embedded interface
4. **Teams/Slack:** Shared link in channels

## Current Architecture Context

### Database Schema (from Proposed_Database_Design.md)
- Already identified `processor_external_endpoints` table concept (lines 297-311)
- Current visibility enum: `personal | organization`
- External publishing noted as "Post-MVP" feature
- Current RLS policies require organization-based authentication

### Current Implementation Status
- Phase 1-1.6 completed: Processors, operations, and workbench UI
- Phase 2-6 pending: Runs, operation_results, and execution tables
- No external publishing mechanism exists yet

## Proposed Approaches

### 🥇 Approach 1: Magic Link + Temporary Session (RECOMMENDED)

#### Description
Generate shareable URLs that provide direct access to a processor without authentication.

#### User Experience Flow
1. HR user clicks "Share Processor" button in ValidAI UI
2. System generates unique URL: `validai.com/p/abc123xyz`
3. HR shares link via email, SharePoint, or other channels
4. Manager clicks link → lands on simple drop zone interface (no login required)
5. Manager uploads document → sees processing progress
6. Results displayed immediately on screen
7. Results optionally emailed to manager
8. Session expires after use or after configurable time period

#### Technical Architecture

**Database Addition:**
```sql
CREATE TABLE processor_external_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_id uuid NOT NULL REFERENCES processors(id),
  endpoint_slug text UNIQUE NOT NULL, -- e.g., 'abc123xyz'
  allowed_domains text[], -- Optional domain whitelist for embedding
  notification_email text, -- Where to send completion notices (e.g., HR)
  result_delivery_email boolean DEFAULT false, -- Capture user email for results
  max_uses integer, -- Optional usage limit (null = unlimited)
  usage_count integer DEFAULT 0,
  expires_at timestamptz, -- Optional expiry date
  is_active boolean DEFAULT true,
  branding_config jsonb, -- Custom styling/branding options
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz -- Soft delete
);

-- Index for fast slug lookup
CREATE INDEX idx_external_endpoints_slug ON processor_external_endpoints(endpoint_slug)
WHERE is_active = true AND deleted_at IS NULL;
```

**API Routes:**
- `GET /p/[slug]` - Public upload interface (no auth)
- `POST /p/[slug]/validate` - Verify slug is valid and active
- `POST /p/[slug]/process` - Execute run via Edge Function (service-role)
- `GET /p/[slug]/results/[run_id]` - Retrieve results (with session token)

**Edge Function:**
- Bypasses normal RLS using service-role client
- Creates run record with `triggered_by = NULL` (anonymous)
- Stores session token for result retrieval
- Sends notifications if configured

**Security Considerations:**
- Rate limiting per slug (prevent abuse)
- File size limits
- Optional CAPTCHA for public endpoints
- Usage tracking and analytics
- Domain whitelist for iframe embedding

#### Pros
- **Zero friction** - Click and drop, no account needed
- **Universal compatibility** - Works in email, SharePoint, Slack, Teams, etc.
- **Embeddable** - Can be used in iframe (enables Approach 2)
- **Trackable** - HR sees usage statistics per link
- **Controllable** - Expire, revoke, limit usage, disable anytime
- **Gradual rollout** - Can start private, test, then make public

#### Cons
- Need to manage link lifecycle (expiration, revocation)
- Temporary result storage required (privacy consideration)
- Potential for abuse without proper rate limiting
- Email capture needed if results should be sent

---

### 🥈 Approach 2: Embedded Widget (SharePoint/Web)

#### Description
Provide iframe embed code that can be inserted into SharePoint pages, internal wikis, or other web pages.

#### User Experience Flow
1. HR user generates embed code in ValidAI
2. HR or IT pastes code into SharePoint page: `<iframe src="validai.com/embed/abc123xyz">`
3. Widget appears as native drop zone on SharePoint page
4. Manager uploads document directly in SharePoint context
5. Results displayed inline or sent via email

#### Technical Architecture
- Built on top of Approach 1 architecture
- Add CORS headers for allowed domains
- Implement postMessage API for iframe resizing
- Provide customization options via query parameters:
  - `?theme=light|dark`
  - `?branding=hidden`
  - `?resultDisplay=inline|email`

#### Pros
- **Native integration** - Looks like part of existing tools
- **No navigation** - Users stay in familiar environment
- **Centralized management** - IT adds once, everyone uses
- **Consistent branding** - Can match SharePoint theme

#### Cons
- Requires HTML/embed capability (basic IT skill)
- SharePoint permissions can be complex
- Mobile experience depends on parent page design
- Cross-origin debugging can be challenging

---

### 🥉 Approach 3: Email Drop (Email-to-Process)

#### Description
Users email documents to a specific email address and receive automated analysis results via reply email.

#### User Experience Flow
1. HR provides email address: `agreement-check@validai.com` or `agreement-check-abc123@validai.com`
2. Manager emails document as attachment to that address
3. ValidAI processes email webhook
4. System extracts attachment, runs processor
5. Results sent as automated reply email
6. Manager can CC others for notification

#### Technical Architecture
- Email webhook integration (SendGrid, Mailgun, AWS SES)
- Edge Function to process incoming emails
- Parse attachments (handle various formats)
- Execute processor run
- Format results as email-friendly HTML/PDF
- Send via transactional email service

#### Pros
- **Ultimate simplicity** - Everyone knows how to send email
- **Universal device support** - Any device, any email client
- **No web UI required** - Pure email workflow
- **Mobile friendly** - Native email app experience
- **CC/distribution** - Easy to loop in stakeholders

#### Cons
- Email parsing complexity (formats, encodings, attachments)
- Delivery delays (not instant feedback)
- Email size limits (attachment restrictions)
- Harder to display rich formatting/interactive results
- Spam filtering challenges
- Reply-all confusion possible

---

### 🔧 Approach 4: QR Code + Mobile-First

#### Description
Generate QR codes that open mobile-optimized upload interfaces.

#### User Experience Flow
1. HR generates QR code for processor
2. QR code printed on forms or shared digitally
3. Manager scans QR code with phone camera
4. Opens mobile-optimized upload page
5. Takes photo or uploads from phone
6. Results via SMS or email

#### Technical Architecture
- QR code generation library
- Mobile-responsive upload interface
- Camera API for document capture
- Optional OCR for photo uploads
- SMS integration for result delivery

#### Pros
- **Physical-digital bridge** - Print QR on forms themselves
- **Mobile-first** - Matches modern usage patterns
- **Contactless** - Scan and go
- **Offline-to-online** - Works with paper documents

#### Cons
- Requires camera access (privacy concern)
- Photo quality affects OCR accuracy
- Less suitable for digital-first workflows
- SMS delivery costs

---

### 💡 Approach 5: Microsoft Power Automate/Zapier Integration

#### Description
IT sets up automated workflows that trigger ValidAI processing when files are added to specific locations.

#### User Experience Flow
1. IT configures flow: "When file added to SharePoint folder → Send to ValidAI → Post results"
2. Manager drops file in designated SharePoint folder
3. Power Automate detects new file
4. Calls ValidAI API with file and processor ID
5. Results posted back to SharePoint or sent via Teams/email

#### Technical Architecture
- REST API endpoints for external integrations
- API key authentication
- Webhook callbacks for async results
- Power Automate/Zapier connector (optional)

#### Pros
- **Zero UI for end users** - Just drop file in folder
- **Fits existing workflows** - Uses familiar tools
- **IT manages once** - Set and forget
- **Chainable** - Can integrate with other automations
- **Enterprise-grade** - Audit logs, permissions, etc.

#### Cons
- Requires IT setup (not "non-IT thing")
- Depends on org having Power Automate/Zapier licenses
- API key management and security
- Complex for simple use cases
- Debugging flows can be difficult

---

## Recommended Implementation Strategy

### Phase 1: Magic Link Foundation (Approach 1)
**Why start here:**
1. Simplest for end users - just click and drop
2. Works everywhere - email, SharePoint, Teams, Slack
3. Foundation for other approaches (iframe embedding builds on this)
4. Trackable and controllable by creators
5. Can test and iterate quickly

**MVP Features:**
- Generate shareable link with unique slug
- Simple public upload interface (no auth)
- Execute processor run via Edge Function
- Display results on screen
- Basic usage tracking
- Link expiration
- Enable/disable toggle

**Post-MVP Enhancements:**
- Email capture before showing results
- Email delivery of results
- Usage analytics dashboard
- Max usage limits
- Custom branding options
- Domain whitelisting for embedding

### Phase 2: Embedded Widget (Approach 2)
**Build on Phase 1 foundation:**
- Iframe-embeddable version of magic link interface
- CORS configuration
- Customization options (theme, branding)
- postMessage API for parent communication
- Documentation for IT/admins

### Phase 3: Additional Channels (Approaches 3-5)
**Expand based on user feedback:**
- Email-to-process if email workflows are preferred
- QR codes if mobile/physical document workflows are common
- Power Automate connector if enterprise automation is requested

---

## Open Questions for Decision

### 1. Email Requirement
**Question:** Should we capture user email before showing results, or show immediately?

**Options:**
- A) Show results immediately (simplest, most friction-free)
- B) Require email before results (enables follow-up, tracking)
- C) Optional email capture (offer to email results)
- D) Let processor creator choose per-processor

**Recommendation:** Option D - Let creator decide based on use case

---

### 2. Results Delivery
**Question:** How should results be delivered to end users?

**Options:**
- A) Web display only
- B) Email only
- C) Both (web + optional email)
- D) Let creator choose

**Recommendation:** Option C - Show on web immediately, option to email

---

### 3. Usage Limits
**Question:** Should external links have built-in limits?

**Options:**
- A) No limits (unlimited use)
- B) Max uses per link (e.g., 100 runs)
- C) Time-based expiration only
- D) Both max uses and expiration
- E) Let creator configure per-processor

**Recommendation:** Option E - Configurable (default: no limits, expires in 90 days)

---

### 4. Branding
**Question:** Should embedded/public version show ValidAI branding?

**Options:**
- A) Always show "Powered by ValidAI"
- B) Hide branding (whitelabel)
- C) Configurable per plan tier (free = branding, paid = optional)

**Recommendation:** Option C - Free tier shows branding, paid can customize

---

### 5. Implementation Priority
**Question:** What should we build first?

**Options:**
- A) Approach 1 only (magic link)
- B) Approach 1 + 2 together (link + embedding)
- C) Approach 1 + 3 (link + email)

**Recommendation:** Option A first (magic link), then add embedding in Phase 2

---

## Security & Privacy Considerations

### Data Handling
- **Temporary storage**: How long to retain documents and results from anonymous runs?
  - Recommendation: 7 days, then auto-delete unless saved by user
- **PII handling**: If email captured, ensure GDPR compliance
- **Result access**: Only accessible via session token, no public URLs

### Abuse Prevention
- Rate limiting per slug (e.g., 100 requests/hour)
- Rate limiting per IP (e.g., 10 requests/hour)
- File size limits (e.g., 10MB max)
- CAPTCHA for high-volume public endpoints
- Monitoring and alerting for suspicious activity

### Access Control
- Creator can disable/revoke links anytime
- Creator receives notifications of usage (optional)
- Audit log of all anonymous runs
- Domain whitelist for embedding prevents unauthorized use

---

## Success Metrics

### Usage Metrics
- Number of external endpoints created
- Total runs executed via external endpoints
- Unique users accessing external processors
- Conversion rate: anonymous users → account signups

### User Experience Metrics
- Time from link click to first upload
- Success rate of anonymous runs
- User feedback/satisfaction scores

### Business Metrics
- Reduction in support tickets (self-service success)
- Expansion within organizations (viral growth via sharing)
- Premium feature adoption (branding customization, etc.)

---

## Next Steps

1. **Review and validate** this planning document with stakeholders
2. **Prioritize approach** based on user research and business goals
3. **Design database schema** for `processor_external_endpoints` table
4. **Create technical specification** for Approach 1 (magic link)
5. **Design UI/UX** for:
   - Processor sharing interface (creator side)
   - Public upload interface (end user side)
   - Results display for anonymous users
6. **Plan security implementation** (rate limiting, abuse prevention)
7. **Draft API specification** for Edge Functions
8. **Define analytics and tracking** requirements

---

## References

- **Source discussion:** User conversation on 2025-10-14
- **Related docs:**
  - [Proposed_Database_Design.md](./Proposed_Database_Design.md) (lines 297-311: processor_external_endpoints concept)
  - CLAUDE.md (Supabase architecture best practices)

---

*This document captures planning input for the external processor publishing feature. It will inform the detailed technical specification and implementation plan.*
