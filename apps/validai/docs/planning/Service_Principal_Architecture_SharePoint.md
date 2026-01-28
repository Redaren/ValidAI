# Service Principal Architecture for SharePoint Integration

**Document Status**: Pre-Implementation Planning
**Created**: 2025-11-30
**Purpose**: Define decisions and investigations required before creating implementation plan
**Context**: Enable third-party SharePoint users to use ValidAI without individual accounts

---

## Executive Summary

This document outlines a **Service Principal Architecture** for SharePoint integration that enables third-party users at customer organizations to securely use ValidAI through SharePoint without requiring individual ValidAI accounts.

**Key Innovation**: Map Azure AD tenants to ValidAI organizations using service accounts, allowing seamless authentication bridging while maintaining security and multi-tenancy isolation.

**Business Value**:
- Zero user management overhead (no account provisioning/deprovisioning)
- 30-minute IT admin setup (no custom development at customer)
- Full IT policy compliance (SSO, MFA, conditional access, audit trail)
- Native SharePoint UX (users never leave familiar environment)

**Development Effort**: 4-6 weeks with 1-2 developers

---
## The orginal plan 
Recommended Solution: Service Principal Architecture
Core Concept
Instead of individual user accounts, use a tenant-to-organization mapping where:
SharePoint users authenticate via Azure AD (their existing corporate identity)
A ValidAI "service account" executes processors on behalf of the organization
IT admins configure the mapping once (no per-user setup)
How It Works
SharePoint User (Azure AD)
    ↓
SPFx Web Part (embedded in SharePoint)
    ↓ [Azure AD token]
ValidAI Edge Function (gateway)
    → Validates Azure AD token
    → Maps tenant → ValidAI organization
    → Executes processor via service account
    ↓
Results displayed in SharePoint UI
Key Advantages
1. Zero User Management
No ValidAI accounts for SharePoint users
No password management
No user provisioning/deprovisioning
2. No-Code IT Setup (30 minutes)
Admin creates Azure AD app registration (10 min)
Admin configures tenant mapping in ValidAI Admin Portal (5 min)
Admin deploys pre-built SPFx web part to SharePoint (10 min)
Done - all users get access automatically
3. IT Policy Compliant
✅ SSO: Users authenticate via Azure AD (existing corporate identity)
✅ MFA: Enforced by Azure AD conditional access policies
✅ Device Compliance: Azure AD device policies apply
✅ Access Control: SharePoint permissions control who sees the web part
✅ Audit Trail: All executions logged with user email + site URL
✅ Data Encryption: HTTPS + Supabase encryption
✅ No External Accounts: Third-party users never leave Azure AD ecosystem
4. Seamless UX
Users work entirely within SharePoint (no context switching)
Select document → Select processor → View results
Real-time processing status
No training required
Technical Implementation
What ValidAI Needs to Build
1. Database Schema (new table):
sharepoint_tenant_mappings
  - azure_tenant_id (unique)
  - validai_organization_id
  - service_account_email
  - allowed_sites (optional restriction)
2. Edge Function (sharepoint/execute-processor):
Validates Azure AD token
Maps tenant → organization
Calls existing processor execution (reuses Phase 1.9 file_upload)
3. Admin Portal UI (/admin/sharepoint-integration):
Simple form: "Add SharePoint Tenant"
Inputs: Azure Tenant ID, ValidAI Organization, Service Account Email
Step-by-step Azure AD app registration guide
4. SPFx Web Part (pre-built package):
React component that embeds in SharePoint pages
Shows processor list → Execute → Display results
IT admin deploys once, all users get access
What IT Admin Does (One-Time Setup)
┌─────────────────────────────────────────────────────┐
│ Azure AD Setup (10 min)                              │
├─────────────────────────────────────────────────────┤
│ 1. Create app registration                          │
│ 2. Copy tenant ID + client ID                       │
│ 3. Configure API permissions                        │
│ 4. Grant admin consent                              │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ ValidAI Admin Portal (5 min)                        │
├─────────────────────────────────────────────────────┤
│ 1. Navigate to SharePoint Integration              │
│ 2. Click "Add Tenant Mapping"                       │
│ 3. Paste Azure Tenant ID                            │
│ 4. Select ValidAI Organization                      │
│ 5. Auto-create service account                      │
│ 6. Download SPFx package (.sppkg)                   │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ SharePoint Deployment (10 min)                      │
├─────────────────────────────────────────────────────┤
│ 1. Upload .sppkg to App Catalog                     │
│ 2. Deploy to all sites                              │
│ 3. Add web part to SharePoint pages                 │
│ 4. Configure processor selection                    │
└─────────────────────────────────────────────────────┘
                      ↓
              USERS GET ACCESS
Security Highlights
Authentication Flow
SharePoint user opens page with ValidAI web part
Web part requests Azure AD token (automatic SSO)
Token sent to ValidAI Edge Function
ValidAI validates token with Microsoft (JWKS endpoint)
ValidAI looks up: Azure Tenant → ValidAI Organization
Processor executes via service account (RLS enforces org isolation)
No Security Compromises
No shared passwords: Service account only used by Edge Function
No user impersonation: Audit logs record real user email
No RLS bypass: Service account respects organization boundaries
No token storage: Azure AD tokens validated and discarded
No data leakage: RLS policies enforce multi-tenancy
Compliance Features
Audit Trail: sharepoint_execution_logs table tracks user + site + processor + timestamp
MFA Enforcement: Delegated to Azure AD (IT admin configures)
Conditional Access: Applies automatically (device compliance, location-based, etc.)
Data Residency: Configurable per organization (Supabase region selection)

---

## User Identity & Billing Support

### Question A: Can we obtain authenticated user identity for billing purposes?

**Answer: ✅ YES - Fully Supported**

When a SharePoint user executes a ValidAI processor, we can obtain their complete identity for billing, audit, and compliance purposes.

#### Available User Information

**From SPFx Web Part Context:**
```typescript
// Available via this.context.pageContext.user
{
  displayName: string,              // User's full name
  email: string,                    // User Principal Name (UPN)
  loginName: string,                // Azure AD login name
  isAnonymousGuestUser: boolean,
  isExternalGuestUser: boolean
}
```

**From Azure AD Token Claims (Recommended):**
```typescript
// Extracted from validated Azure AD token
{
  oid: string,        // Object ID - IMMUTABLE user identifier (GUID)
  tid: string,        // Tenant ID - IMMUTABLE tenant identifier
  email: string,      // User's email address
  upn: string,        // User Principal Name
  name: string,       // Display name
  preferred_username: string  // Primary username (v2.0 tokens)
}
```

#### Security Best Practice

**❌ DO NOT trust client-provided email** - Users could manipulate browser requests.

**✅ ALWAYS extract user identity from validated Azure AD token:**

```typescript
// Edge Function: sharepoint/execute-processor
async function handler(req: Request) {
  const { azureAdToken, documentData, processorId } = await req.json();

  // 1. Validate token signature with Microsoft
  const claims = await validateAzureAdToken(azureAdToken);

  // 2. Extract immutable identifiers
  const userOid = claims.oid;           // For billing/analytics
  const userEmail = claims.email;       // For audit/reporting
  const tenantId = claims.tid;          // For org mapping

  // 3. Log execution with user context
  await logExecution({
    user_oid: userOid,
    user_email: userEmail,
    azure_tenant_id: tenantId,
    processor_id: processorId,
    // ... other fields
  });
}
```

#### Supported Billing Use Cases

| Use Case | Implementation | Status |
|----------|---------------|--------|
| **Per-User Billing** | Track individual usage via `oid` + `email` | ✅ Supported |
| **Per-Organization Billing** | Aggregate all users under tenant mapping | ✅ Supported |
| **Department Chargeback** | Parse site URL or use custom claims | ✅ Supported |
| **Audit Trail** | Log user email + site + processor + timestamp | ✅ Supported |
| **Usage Analytics** | Analyze usage patterns by user/org/time | ✅ Supported |

#### Enhanced Database Schema for Billing

Extend the `sharepoint_execution_logs` table to capture billing-relevant data:

```sql
CREATE TABLE sharepoint_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES validai_runs(id),

  -- Tenant & Organization Mapping
  azure_tenant_id text NOT NULL,
  validai_organization_id uuid NOT NULL REFERENCES organizations(id),

  -- User Identity (for billing & audit)
  user_oid text NOT NULL,              -- Immutable Azure AD Object ID
  user_email text NOT NULL,             -- For billing reports and user-facing displays
  user_display_name text,               -- For UI display in reports

  -- SharePoint Context
  sharepoint_site_url text NOT NULL,    -- For department chargeback
  sharepoint_library_name text,         -- Additional context
  sharepoint_file_path text,            -- Full path to document

  -- Execution Details
  processor_id uuid NOT NULL,
  processor_name text,                  -- Denormalized for reporting
  document_name text NOT NULL,
  document_size_bytes bigint,

  -- Billing Metrics
  processing_duration_ms integer,
  llm_tokens_input integer,             -- From LLM provider response
  llm_tokens_output integer,            -- From LLM provider response
  llm_tokens_total integer,             -- Sum of input + output
  llm_provider text,                    -- 'anthropic', 'google', 'mistral'
  execution_cost_usd decimal(10,4),     -- Calculated cost

  -- Status & Timestamps
  executed_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  execution_status text CHECK (execution_status IN ('success', 'failed', 'cancelled')),
  error_message text
);

-- Indexes for billing queries
CREATE INDEX idx_sharepoint_logs_billing_by_user
  ON sharepoint_execution_logs(user_oid, executed_at DESC);

CREATE INDEX idx_sharepoint_logs_billing_by_org
  ON sharepoint_execution_logs(validai_organization_id, executed_at DESC);

CREATE INDEX idx_sharepoint_logs_billing_by_tenant
  ON sharepoint_execution_logs(azure_tenant_id, executed_at DESC);

CREATE INDEX idx_sharepoint_logs_billing_by_site
  ON sharepoint_execution_logs(sharepoint_site_url, executed_at DESC);

COMMENT ON TABLE sharepoint_execution_logs IS
'Audit and billing log for SharePoint-triggered processor executions.
Captures full user context from Azure AD token for accurate billing attribution.';
```

#### PII and GDPR Considerations

**Data Classification:**
- `user_email`, `user_display_name` → **Personal Identifiable Information (PII)**
- `user_oid`, `azure_tenant_id` → **Pseudonymous identifiers** (GDPR compliant for analytics)

**GDPR Compliance Measures:**
1. ✅ **Lawful Basis**: Legitimate interest (billing, fraud prevention, audit)
2. ✅ **Data Minimization**: Only collect necessary fields for billing
3. ✅ **Right to Deletion**: Implement user data deletion on request
   ```sql
   -- Anonymize user data while preserving billing records
   UPDATE sharepoint_execution_logs
   SET user_email = 'deleted-user@anonymized.invalid',
       user_display_name = 'Deleted User',
       user_oid = 'REDACTED'
   WHERE user_oid = '{user_to_delete}';
   ```
4. ✅ **Data Retention**: Define retention policy (e.g., 7 years for audit, then anonymize)
5. ✅ **Data Processing Agreement**: Include third-party user data in DPA with customers

#### Billing Report Examples

**Per-User Usage Report:**
```sql
SELECT
  user_email,
  user_display_name,
  COUNT(*) as executions,
  SUM(llm_tokens_total) as total_tokens,
  SUM(execution_cost_usd) as total_cost_usd,
  AVG(processing_duration_ms) as avg_duration_ms
FROM sharepoint_execution_logs
WHERE azure_tenant_id = '{tenant_id}'
  AND executed_at >= '2025-01-01'
  AND executed_at < '2025-02-01'
  AND execution_status = 'success'
GROUP BY user_oid, user_email, user_display_name
ORDER BY total_cost_usd DESC;
```

**Per-Organization Monthly Billing:**
```sql
SELECT
  azure_tenant_id,
  validai_organization_id,
  DATE_TRUNC('month', executed_at) as billing_month,
  COUNT(DISTINCT user_oid) as unique_users,
  COUNT(*) as total_executions,
  SUM(llm_tokens_total) as total_tokens,
  SUM(execution_cost_usd) as total_cost_usd
FROM sharepoint_execution_logs
WHERE executed_at >= '2025-01-01'
  AND execution_status = 'success'
GROUP BY azure_tenant_id, validai_organization_id, billing_month
ORDER BY billing_month DESC, total_cost_usd DESC;
```

**Department Chargeback (by SharePoint Site):**
```sql
SELECT
  sharepoint_site_url,
  REGEXP_REPLACE(sharepoint_site_url, '.*/sites/([^/]+).*', '\1') as department,
  COUNT(*) as executions,
  SUM(execution_cost_usd) as department_cost_usd
FROM sharepoint_execution_logs
WHERE validai_organization_id = '{org_id}'
  AND executed_at >= '2025-01-01'
GROUP BY sharepoint_site_url
ORDER BY department_cost_usd DESC;
```

---

## SharePoint Workflow Integration (Power Automate)

### Question B: Can we support SharePoint workflows where documents are auto-processed?

**Answer: ✅ YES - Via Power Automate Custom Connector**

ValidAI can integrate into SharePoint workflows using **Power Automate** (Microsoft's modern automation platform), enabling fully automated document processing pipelines.

### Why Power Automate?

| Factor | Details |
|--------|---------|
| **Recommended by Microsoft** | Modern replacement for deprecated SharePoint Designer workflows |
| **Visual Designer** | No-code/low-code - IT admins build flows visually |
| **Native SharePoint Triggers** | "When a file is created or modified in SharePoint" |
| **Custom Connector Support** | ValidAI can provide pre-built connector |
| **Wide Adoption** | Included in Microsoft 365 Business/Enterprise plans |

**Deprecated Alternatives:**
- ❌ SharePoint Designer Workflows (no longer supported)
- ⚠️ Logic Apps (enterprise alternative, but Power Automate is simpler for SharePoint)

### Architecture: Two Integration Patterns

#### Pattern 1: Custom Connector (Recommended for Production)

```
┌────────────────────────────────────────────────────────┐
│ 1. ValidAI Creates Custom Connector                    │
│    - OpenAPI 3.0 definition                            │
│    - OAuth2 authentication (Azure AD)                  │
│    - Pre-built actions:                                │
│      * Execute Processor                               │
│      * Get Processing Status                           │
│      * Get Results                                     │
└────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────┐
│ 2. IT Admin Installs Connector                         │
│    - One-time installation in Power Automate           │
│    - Authenticate with ValidAI (OAuth2)                │
└────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────┐
│ 3. Users Build Flows Visually                          │
│    - Drag "ValidAI - Execute Processor" into flow      │
│    - Configure processor selection (dropdown)          │
│    - Map document input                                │
│    - Handle results (write to list, send email, etc.)  │
└────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Best user experience (visual, no code)
- ✅ Pre-built actions appear in Power Automate UI
- ✅ Authentication handled automatically
- ✅ Microsoft-certified (if published to marketplace)

**Cons:**
- ⚠️ Development effort (OpenAPI spec, testing, certification)

#### Pattern 2: HTTP Actions (Alternative for MVP)

```
Power Automate Flow
  ↓
[Trigger] When a file is created in SharePoint
  ↓
[Action] HTTP - POST to ValidAI Edge Function
  → Body: { file_content: base64, processor_id, ... }
  → Headers: Authorization: Bearer {azure_ad_token}
  ↓
[Action] Parse JSON (response contains run_id)
  ↓
[Loop] Do Until (status = "completed")
  → HTTP - GET /api/runs/{run_id}/status
  → Delay 10 seconds
  ↓
[Action] HTTP - GET /api/runs/{run_id}/results
  ↓
[Action] Create item in SharePoint list (results)
```

**Pros:**
- ✅ Quick to implement (no custom connector needed)
- ✅ Full flexibility

**Cons:**
- ❌ Users must manually configure HTTP actions (error-prone)
- ❌ Authentication more complex (requires manual token management)

**Recommendation:** Start with Pattern 2 for pilot, build Pattern 1 for GA.

### Data Flow: Document → ValidAI → Results

#### Passing Documents to ValidAI

| Method | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **File Content (base64)** | ✅ Simple<br>✅ No auth issues | ❌ 100 MB limit (Power Automate) | ✅ Use for <10 MB docs |
| **Presigned URL** | ✅ No size limits<br>✅ Efficient | ⚠️ Requires temp storage | ✅ Use for >10 MB docs |
| **SharePoint URL** | ✅ No data copy | ❌ ValidAI needs SharePoint token<br>❌ Complex auth | ⚠️ Future enhancement |

**Recommended Approach for MVP:**
```yaml
Power Automate Action: "Get file content"
  ↓
Convert to base64
  ↓
POST to ValidAI Edge Function
  Body:
    processor_id: {guid}
    file_content: {base64_string}
    file_name: {original_filename}
    metadata:
      sharepoint_site_url: {site_url}
      user_email: {triggered_by_email}
```

#### Returning Results to Workflow

**Recommended Pattern: HTTP 202 Accepted + Status Polling**

```typescript
// Edge Function: POST /api/sharepoint/execute-processor
Response: 202 Accepted
{
  "run_id": "abc-123-def",
  "status": "queued",
  "status_url": "https://validai.com/api/runs/abc-123-def/status",
  "estimated_duration_seconds": 120
}

// Polling: GET /api/runs/{run_id}/status
Response: 200 OK
{
  "run_id": "abc-123-def",
  "status": "processing",  // or "completed", "failed"
  "progress_percentage": 45,
  "operations_completed": 3,
  "operations_total": 7,
  "estimated_seconds_remaining": 60
}

// Final Results: GET /api/runs/{run_id}/results
Response: 200 OK
{
  "run_id": "abc-123-def",
  "status": "completed",
  "processor_name": "Contract Validation",
  "validation_score": 85,
  "operations": [
    {
      "operation_id": "op-1",
      "operation_name": "Extract Contract Parties",
      "status": "completed",
      "structured_output": { "party_a": "Acme Corp", "party_b": "Contoso Ltd" }
    },
    // ... more operations
  ],
  "summary": {
    "total_operations": 7,
    "successful": 7,
    "failed": 0
  }
}
```

**Power Automate Loop Pattern:**
```yaml
Do Until: status = "completed" OR status = "failed"
  Max Iterations: 180  # 30 minutes max (10 sec delay × 180)

  Actions:
    1. HTTP GET - Status URL
    2. Parse JSON - Extract status field
    3. Condition: If status = "completed", break
    4. Delay - 10 seconds
    5. Loop back
```

### Common Workflow Scenarios

#### Scenario 1: Auto-Process on Upload

```yaml
Trigger: When a file is created in "Contracts/Incoming"
  Filter: File extension is .pdf
  ↓
Action: Get file content
  ↓
Action: ValidAI - Execute Processor
  Processor: "Contract Validation"
  File: [File Content from previous step]
  ↓
Action: Do Until (status = completed)
  → Get Processing Status
  → Delay 10 seconds
  ↓
Action: Get Results
  ↓
Condition: validation_score >= 80
  ├─ YES (High Score):
  │   • Move file to "Contracts/Approved"
  │   • Update file metadata:
  │       - Validation Score: {score}
  │       - Validated Date: {now}
  │       - Status: "Approved"
  │   • Send email to legal team:
  │       Subject: "Contract Auto-Approved"
  │       Body: "Score: {score}, Issues: {issues_count}"
  │
  └─ NO (Low Score):
      • Move file to "Contracts/Review Required"
      • Create task in "Legal Review" list:
          - Title: "Review {filename}"
          - Assigned To: Legal Team
          - Priority: High
          - Description: AI found {issues_count} issues
      • Send email with issue summary
```

#### Scenario 2: Approval Workflow with AI Pre-Validation

```yaml
Trigger: Item created in "Document Approval Requests" list
  ↓
Action: Get file from SharePoint library
  File ID: [From list item]
  ↓
Action: ValidAI - Execute Processor
  Processor: [Selected from dropdown in list item]
  ↓
Action: Poll for Results
  ↓
Action: Update list item with AI results:
  - AI Validation Score: {score}
  - AI Issues Found: {issues_count}
  - AI Recommendation: {approve/review/reject}
  - AI Processing Date: {now}
  ↓
Condition: Score >= 90 AND Issues = 0
  ├─ YES (Perfect Score):
  │   • Update list item: Status = "Auto-Approved"
  │   • Send approval email to submitter
  │   • Move file to "Approved Documents"
  │   • Archive with metadata
  │
  └─ NO (Needs Review):
      • Start Approval Process:
          - Send to Manager for review
          - Include AI validation report
          - Show AI-detected issues
      • Wait for Approval Response
      • If Manager Approves:
          - Update: Status = "Manually Approved"
          - Flag: "Manual Override"
      • If Manager Rejects:
          - Send to submitter with:
              * AI validation issues
              * Manager's feedback
          - Update: Status = "Rejected"
```

#### Scenario 3: Multi-Stage Processing Pipeline

```yaml
Trigger: File uploaded to "Invoices/Processing"
  ↓
Stage 1: ValidAI Document Classification
  Processor: "Document Classifier"
  Output: { document_type: "invoice", confidence: 0.95 }
  ↓
Condition: Check document type
  ├─ Invoice:
  │   Stage 2: ValidAI Data Extraction
  │     Processor: "Invoice Extractor"
  │     Output: {
  │       vendor: "Acme Corp",
  │       amount: 5432.10,
  │       invoice_date: "2025-01-15",
  │       due_date: "2025-02-15",
  │       line_items: [...]
  │     }
  │     ↓
  │   Stage 3: Write to SharePoint List
  │     List: "Invoice Register"
  │     Fields:
  │       - Vendor: {vendor}
  │       - Amount: {amount}
  │       - Invoice Date: {invoice_date}
  │       - Due Date: {due_date}
  │       - Status: "Pending Approval"
  │     ↓
  │   Condition: Amount > $10,000
  │     ├─ YES: Require manager approval
  │     │   • Start approval workflow
  │     │   • Wait for response
  │     │
  │     └─ NO: Auto-process
  │         • Update Status: "Approved"
  │     ↓
  │   Stage 4: External Integration
  │     • HTTP POST to accounting system API
  │       (QuickBooks, NetSuite, SAP)
  │     • Create invoice record in ERP
  │     ↓
  │   Stage 5: Archive & Notify
  │     • Move to "Invoices/Archived"
  │     • Update metadata: Processed = Yes
  │     • Send confirmation email to AP team
  │
  ├─ Receipt:
  │   • Route to receipt processing workflow
  │
  └─ Other:
      • Route to manual classification queue
```

### Technical Requirements for ValidAI

#### 1. OpenAPI Specification for Custom Connector

ValidAI must provide an OpenAPI 3.0 definition that Power Automate can import:

```yaml
openapi: 3.0.0
info:
  title: ValidAI Processor API
  version: 1.0.0
  description: Execute AI-powered document validation and processing

servers:
  - url: https://api.validai.com/v1

paths:
  /sharepoint/execute-processor:
    post:
      summary: Execute a processor on a document
      description: Starts asynchronous processing of a document
      operationId: executeProcessor
      x-ms-visibility: important  # Show prominently in Power Automate

      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - processor_id
                - file_content
                - file_name
              properties:
                processor_id:
                  type: string
                  format: uuid
                  description: ID of the processor to execute
                  x-ms-summary: Processor
                  x-ms-dynamic-values:  # Dropdown in Power Automate
                    operationId: listProcessors
                    value-path: id
                    value-title: name
                file_content:
                  type: string
                  format: byte
                  description: Base64-encoded file content
                  x-ms-summary: File Content
                file_name:
                  type: string
                  description: Original filename
                  x-ms-summary: File Name
                metadata:
                  type: object
                  description: Optional SharePoint context
                  properties:
                    sharepoint_site_url:
                      type: string
                    user_email:
                      type: string

      responses:
        '202':
          description: Processing started successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  run_id:
                    type: string
                    format: uuid
                    x-ms-summary: Run ID
                  status:
                    type: string
                    enum: [queued, processing]
                    x-ms-summary: Status
                  status_url:
                    type: string
                    format: uri
                    x-ms-summary: Status URL
                  estimated_duration_seconds:
                    type: integer
                    x-ms-summary: Estimated Duration (seconds)

        '400':
          description: Invalid request
        '403':
          description: Tenant not configured for SharePoint access
        '413':
          description: File too large

  /runs/{run_id}/status:
    get:
      summary: Get processing status
      operationId: getProcessingStatus
      x-ms-visibility: advanced

      parameters:
        - name: run_id
          in: path
          required: true
          schema:
            type: string
            format: uuid
          x-ms-summary: Run ID
          x-ms-url-encoding: single

      responses:
        '200':
          description: Status retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  run_id:
                    type: string
                    format: uuid
                  status:
                    type: string
                    enum: [queued, processing, completed, failed, cancelled]
                    x-ms-summary: Status
                  progress_percentage:
                    type: integer
                    minimum: 0
                    maximum: 100
                    x-ms-summary: Progress (%)

  /runs/{run_id}/results:
    get:
      summary: Get processing results
      operationId: getResults
      x-ms-visibility: important

      parameters:
        - name: run_id
          in: path
          required: true
          schema:
            type: string
            format: uuid

      responses:
        '200':
          description: Results retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  run_id:
                    type: string
                    format: uuid
                  status:
                    type: string
                  processor_name:
                    type: string
                    x-ms-summary: Processor Name
                  validation_score:
                    type: integer
                    minimum: 0
                    maximum: 100
                    x-ms-summary: Validation Score
                  operations:
                    type: array
                    items:
                      type: object
                      properties:
                        operation_name:
                          type: string
                        status:
                          type: string
                        structured_output:
                          type: object

  /processors:
    get:
      summary: List available processors
      operationId: listProcessors
      x-ms-visibility: internal  # Used for dynamic dropdowns

      responses:
        '200':
          description: Processors retrieved
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                      format: uuid
                    name:
                      type: string
                    description:
                      type: string

components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
          tokenUrl: https://login.microsoftonline.com/common/oauth2/v2.0/token
          scopes:
            api://validai.sharepoint/user_impersonation: Access ValidAI on behalf of user

security:
  - oauth2: [api://validai.sharepoint/user_impersonation]
```

#### 2. Authentication: Service Principal for Workflows

**Recommended:** Use service principal (same as SPFx architecture)

```typescript
// Power Automate authenticates as service account
// Original user tracked via metadata in request body

{
  "processor_id": "proc-123",
  "file_content": "base64...",
  "metadata": {
    "sharepoint_user_email": "john.doe@customer.com",  // For audit
    "sharepoint_site_url": "https://customer.sharepoint.com/sites/legal",
    "triggered_by_workflow": true
  }
}

// Edge Function logs both:
// - Service account (executor)
// - Sharepoint user (originator)
```

#### 3. Handling Long-Running Operations

**Power Automate Timeouts:**
- Flow max duration: 30 days ✅
- HTTP action timeout: 2 minutes ❌
- Recommended: Use async pattern (202 + polling)

**Implementation:**
```typescript
// POST /sharepoint/execute-processor
// Return immediately (under 2 min timeout)
return new Response(JSON.stringify({
  run_id: newRun.id,
  status: 'queued',
  status_url: `${API_BASE}/runs/${newRun.id}/status`
}), {
  status: 202,  // Accepted
  headers: {
    'Location': `${API_BASE}/runs/${newRun.id}/status`,
    'Retry-After': '10'  // Hint: poll every 10 seconds
  }
});

// Processing happens in background (don't await)
processInBackground(newRun.id);
```

#### 4. Error Handling Standards

**Standardized Error Response:**
```json
{
  "error": {
    "code": "PROCESSOR_NOT_FOUND",
    "message": "Processor with ID 'abc-123' not found in organization",
    "details": {
      "processor_id": "abc-123",
      "organization_id": "org-456"
    },
    "user_message": "The selected processor is no longer available. Please select a different processor.",
    "support_url": "https://validai.com/support/errors/PROCESSOR_NOT_FOUND",
    "retry_after_seconds": null  // Or number if retryable
  }
}
```

**Power Automate Error Handling:**
```yaml
Action: Execute Processor
  Configure Run After: has failed
  ↓
Condition: Check error code
  ├─ RATE_LIMIT_EXCEEDED (429):
  │   • Delay: {retry_after_seconds}
  │   • Retry action
  │
  ├─ TENANT_NOT_CONFIGURED (403):
  │   • Send email to IT admin:
  │       Subject: "ValidAI Setup Required"
  │       Body: {support_url}
  │   • Terminate flow
  │
  └─ Other errors:
      • Log to SharePoint list (Error Log)
      • Send notification to workflow owner
      • Optionally retry 3 times
```

### Results Integration with SharePoint

#### Writing Structured Data to SharePoint Lists

**Challenge:** ValidAI returns nested JSON, SharePoint lists have flat columns.

**Solution:** Create flattened schema with JSON column for full details.

**SharePoint List: "ValidAI Processing Results"**

| Column Name | Type | Description |
|-------------|------|-------------|
| Title | Single line text | Document name |
| Processor | Choice | Processor name |
| Status | Choice | success / failed / partial |
| Validation Score | Number | Overall score (0-100) |
| Issues Found | Number | Count of validation issues |
| Processed Date | Date/Time | When processing completed |
| Processed By | Person | User who triggered workflow |
| Run ID | Single line text | Link to ValidAI run |
| SharePoint File | Lookup | Link to original document |
| Critical Issues | Multiple lines | Top 3-5 issues as bullet list |
| Full Results JSON | Multiple lines | Complete results (for advanced users) |

**Power Automate Mapping:**
```yaml
Action: Create item in SharePoint list
  List: "ValidAI Processing Results"

  Fields:
    Title: @{triggerOutputs()?['body/Name']}
    Processor: @{body('Get_Results')?['processor_name']}
    Status: @{body('Get_Results')?['status']}
    Validation Score: @{body('Get_Results')?['validation_score']}
    Issues Found: @{length(body('Get_Results')?['issues'])}
    Processed Date: @{utcNow()}
    Processed By: @{triggerOutputs()?['body/Author/Email']}
    Run ID: @{variables('run_id')}
    SharePoint File: @{triggerOutputs()?['body/ID']}  # Lookup
    Critical Issues: @{join(take(body('Get_Results')?['issues'], 5), '\n• ')}
    Full Results JSON: @{string(body('Get_Results'))}
```

#### Updating Original File Metadata

```yaml
Action: Update file properties
  Site Address: @{triggerOutputs()?['body/{SiteUrl}']}
  Library Name: @{triggerOutputs()?['body/{LibraryName}']}
  File ID: @{triggerOutputs()?['body/ID']}

  Properties to Update:
    ValidAI_Processed: Yes
    ValidAI_Score: @{body('Get_Results')?['validation_score']}
    ValidAI_Status: @{body('Get_Results')?['status']}
    ValidAI_ProcessedDate: @{utcNow()}
    ValidAI_RunID: @{variables('run_id')}
    ValidAI_ProcessorName: @{body('Get_Results')?['processor_name']}
```

### Comparison: SPFx Web Part vs. Power Automate

| Aspect | SPFx Web Part (Interactive) | Power Automate (Automated) |
|--------|------------------------------|----------------------------|
| **User Experience** | User manually selects document + processor | Fully automated (no user interaction) |
| **Trigger** | User clicks "Process" button | Event-driven (file upload, schedule, approval) |
| **Feedback** | Real-time progress bar in UI | Email/list notification when complete |
| **Use Case** | Ad-hoc validation, exploration | High-volume processing, workflows |
| **Setup Complexity** | Medium (SPFx deployment) | Low (visual flow designer) |
| **Customization** | Full UI/UX control | Limited to Power Automate actions |
| **Error Handling** | Show in UI immediately | Email alerts, retry logic |
| **Audit Trail** | User tracked in execution log | Workflow history + ValidAI logs |
| **Billing Model** | Per-user OR per-execution | Per-execution (service account) |
| **Authentication** | Azure AD user delegation | Service principal |
| **Target Users** | Power users, analysts | IT admins, process automation teams |
| **Development Effort** | 4-6 weeks | 2-3 weeks (reuses Edge Functions) |

### Recommendation: Support Both Use Cases

**Phase 1 (MVP):** SPFx Web Part
- Interactive use case (user-driven)
- Target: Power users who need on-demand validation
- Effort: 4-6 weeks

**Phase 2:** Power Automate Connector
- Automation use case (event-driven)
- Target: IT admins building document workflows
- Effort: 2-3 weeks (reuses Phase 1 Edge Functions + OpenAPI spec)
- **Competitive Differentiator:** Most competitors support only one or the other

**Why Both?**
- Covers 2 distinct use cases with minimal incremental effort
- Phase 2 reuses all Phase 1 infrastructure (Edge Functions, tenant mappings, billing logs)
- Maximizes market coverage (interactive users + automation teams)

---

## Background: Research Findings

### Problem Statement

Organizations want to provide ValidAI document processing to **third-party users** (contractors, partners, external auditors) who:
- Have corporate Azure AD accounts (via their own organization)
- Use SharePoint for document collaboration
- Should NOT have direct ValidAI accounts (security, cost, complexity)
- Must comply with corporate IT policies (SSO, MFA, audit trails)

### Current Architecture Limitations

ValidAI's current authentication model requires:
- Individual user accounts in Supabase Auth
- Organization membership assignment
- Direct login to ValidAI web app

This doesn't work for third-party SharePoint users because:
1. ❌ Provisioning overhead (create account for every contractor)
2. ❌ Training required (separate login, unfamiliar UI)
3. ❌ Offboarding complexity (revoke access when contract ends)
4. ❌ Context switching (leave SharePoint to use ValidAI)

### Proposed Solution: Service Principal Architecture

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: SharePoint User (Azure AD Authentication)              │
│ - Third-party user with Azure AD account                       │
│ - Authenticates via corporate SSO                              │
│ - MFA and conditional access policies apply                    │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: SPFx Web Part (Client Component)                       │
│ - Embedded in SharePoint page                                  │
│ - Obtains Azure AD token for user                              │
│ - Fetches document from SharePoint library                     │
│ - Calls ValidAI Edge Function with:                            │
│   * Azure AD token (user identity)                             │
│   * Document (base64)                                           │
│   * Processor ID                                                │
│   * SharePoint context (site URL, user email)                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: ValidAI Edge Function Gateway                          │
│ Function: sharepoint/execute-processor                          │
│                                                                  │
│ 1. Validate Azure AD Token                                     │
│    - Verify signature (Microsoft JWKS endpoint)                │
│    - Check expiration                                           │
│    - Extract tenant ID (tid claim)                             │
│                                                                  │
│ 2. Lookup Tenant Mapping                                       │
│    SELECT * FROM sharepoint_tenant_mappings                    │
│    WHERE azure_tenant_id = {tid} AND is_active = true          │
│                                                                  │
│ 3. Get Service Account Session                                 │
│    - Retrieve service account credentials                      │
│    - Create Supabase session for organization                  │
│                                                                  │
│ 4. Execute Processor                                            │
│    - Call execute-processor-run Edge Function                  │
│    - Use file_upload parameter (Phase 1.9)                     │
│    - Pass service account auth token                           │
│                                                                  │
│ 5. Log Execution                                                │
│    - Record user email, site URL, processor, timestamp         │
│                                                                  │
│ 6. Return Run ID                                                │
│    - Client polls for status updates                           │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: ValidAI Backend (Existing Infrastructure)              │
│ - Processor execution (Gemini/Anthropic/Mistral)               │
│ - Document storage (Supabase Storage)                          │
│ - Results storage (validai_runs, validai_operation_results)    │
│ - RLS policies enforce organization isolation                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: Results Display (SPFx Web Part)                        │
│ - Real-time status updates (polling or Realtime)               │
│ - Results shown in SharePoint UI                               │
│ - Download as JSON / export to SharePoint list                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Core Components

**1. Tenant Mapping Database Table**
```sql
CREATE TABLE sharepoint_tenant_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azure_tenant_id text NOT NULL UNIQUE,
  azure_tenant_name text NOT NULL,
  validai_organization_id uuid NOT NULL REFERENCES organizations(id),
  service_account_email text NOT NULL,
  allowed_sharepoint_sites text[], -- Optional: restrict to specific sites
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE TABLE sharepoint_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES validai_runs(id),
  azure_tenant_id text NOT NULL,
  sharepoint_user_email text NOT NULL,
  sharepoint_user_name text,
  sharepoint_site_url text NOT NULL,
  processor_id uuid NOT NULL,
  document_name text NOT NULL,
  document_size_bytes bigint,
  executed_at timestamptz DEFAULT now(),
  execution_duration_ms integer,
  execution_status text, -- 'success', 'failed', 'cancelled'
  error_message text
);
```

**2. Edge Function: sharepoint/execute-processor**
- Validates Azure AD tokens using Microsoft JWKS
- Maps tenant ID → ValidAI organization
- Executes processor via service account
- Returns run_id for status polling

**3. Admin Portal UI: /admin/sharepoint-integration**
- Tenant mapping CRUD interface
- Azure AD app registration wizard
- SPFx package download
- Service account auto-creation

**4. SPFx Web Part: validai-processor**
- Pre-built React component
- Processor selection dropdown
- Document selection from SharePoint library
- Real-time execution status
- Results display

#### Security Model

**Authentication Chain**:
1. SharePoint user authenticates via Azure AD (SSO + MFA)
2. SPFx obtains Azure AD token (delegated permissions)
3. ValidAI validates token against Microsoft (no local storage)
4. Service account executes processor (RLS enforces org isolation)
5. Audit log records real user identity

**Key Security Properties**:
- ✅ No shared credentials (service account only in Edge Function)
- ✅ No user impersonation (audit logs preserve identity)
- ✅ No RLS bypass (service account respects organization boundaries)
- ✅ No token storage (validated and discarded)
- ✅ Multi-tenancy preserved (RLS policies apply)

**Compliance Features**:
- SSO via Azure AD (existing corporate identity)
- MFA enforcement (Azure AD conditional access)
- Device compliance (Azure AD policies apply)
- Audit trail (every execution logged with user + site)
- Data encryption (HTTPS + Supabase encryption)
- Data residency (configurable Supabase region per org)

---

## Pre-Implementation Decisions Required

### 1. Data Residency & Storage

#### Decision: Where are documents and results stored?

**Current Assumption**: Documents copied to Supabase Storage (not SharePoint links)

**Options**:
- **Option A**: Copy documents to Supabase Storage
  - ✅ Pros: Simple implementation, reuses existing architecture
  - ❌ Cons: Data duplication, customer data leaves SharePoint
  - ⚠️ Compliance: May violate data residency requirements

- **Option B**: Access documents via SharePoint API (read-only)
  - ✅ Pros: No data duplication, documents stay in SharePoint
  - ❌ Cons: Complex authentication (need SharePoint access token), network latency
  - ⚠️ Technical: Edge Functions need SharePoint credentials

- **Option C**: Hybrid (copy temporarily, delete after processing)
  - ✅ Pros: Balance between simplicity and compliance
  - ❌ Cons: Cleanup complexity, retention policy management

**Questions to Answer**:
1. What are typical customer data residency requirements?
2. Can we support multiple regions (Supabase multi-region)?
3. Should results be written back to SharePoint or only shown in UI?
4. What is the document retention policy? (delete immediately vs. 30 days)

**Stakeholders**: Legal/Compliance, Product, Engineering

---

### 2. Document Size & Volume Limits

#### Decision: What are the technical limits?

**Current Constraints**:
- Edge Function timeout: 25 minutes (Supabase limit)
- Edge Function memory: 512 MB default (upgradeable)
- Direct upload (file_upload): Works for reasonable sizes, but what's the limit?

**Questions to Answer**:
1. What is the maximum document size? (10 MB? 50 MB? 100 MB?)
2. How does this align with typical contract/document sizes?
3. Do we need chunked upload for large files?
4. What is the expected processing volume per tenant? (rate limiting strategy)

**Impact on Architecture**:
- Small files (< 10 MB): Direct upload works (Phase 1.9)
- Large files (> 10 MB): May need presigned URL upload pattern
- Very large files (> 100 MB): May need streaming/chunked processing

**Stakeholders**: Product (customer requirements), Engineering (technical limits)

---

### 3. SharePoint Version Support

#### Decision: Which SharePoint versions do we support?

**Options**:
- **Modern SharePoint Online only** (SPFx + Azure AD)
  - ✅ Recommended for new architecture
  - ✅ Best developer experience
  - ⚠️ Excludes on-prem SharePoint customers

- **SharePoint 2019 on-premises** (different auth model)
  - ❌ Complex: AD FS instead of Azure AD
  - ❌ Network access challenges (firewall, VPN)
  - ⚠️ May require VPN connector or on-prem gateway

- **Both** (phased approach)
  - Phase 1: SharePoint Online (MVP)
  - Phase 2: On-premises (if demand exists)

**Questions to Answer**:
1. What percentage of target customers use SharePoint Online vs. on-prem?
2. Is on-prem support a deal-breaker or nice-to-have?
3. Can we defer on-prem to Phase 2 after validating online approach?

**Stakeholders**: Sales/BD (customer landscape), Product

---

### 4. Results Storage & Display Strategy

#### Decision: Where do results go after processing?

**Options**:
- **Option A**: Display only in SPFx web part (no persistence in SharePoint)
  - ✅ Simplest implementation
  - ✅ Results stored in ValidAI database (validai_runs)
  - ❌ Users can't filter/sort in SharePoint
  - ❌ No integration with SharePoint workflows

- **Option B**: Write results to SharePoint list (structured data)
  - ✅ Native SharePoint experience (filter, sort, export)
  - ✅ Can trigger SharePoint workflows based on results
  - ❌ Complex: Need SharePoint write permissions
  - ❌ Schema mapping (ValidAI operations → SharePoint columns)

- **Option C**: Hybrid (display in web part + optional export to list)
  - ✅ Best of both worlds
  - ❌ More development effort

**Questions to Answer**:
1. Do users need to act on results in SharePoint? (workflows, approvals)
2. Is export to Excel sufficient or do they need SharePoint lists?
3. Should results be searchable in SharePoint search?

**Stakeholders**: UX, Product, Customer Success

---

### 5. Pilot Tenant Selection

#### Decision: Which customer for initial pilot?

**Ideal Pilot Characteristics**:
- ✅ Uses SharePoint Online (not on-prem)
- ✅ Has Azure AD (modern tenant)
- ✅ Willing to test early (provides feedback)
- ✅ Represents typical use case (contract validation, compliance docs)
- ✅ IT team available for setup (30-minute deployment)

**Questions to Answer**:
1. Which existing ValidAI customers use SharePoint?
2. Which customers have requested SharePoint integration?
3. Do we have a friendly customer willing to pilot?
4. Should we pilot internally first? (use our own SharePoint tenant)

**Stakeholders**: Sales, Customer Success, Product

---

### 6. Service Account Licensing Model

#### Decision: How are service accounts counted in pricing?

**Current ValidAI Pricing** (assumed): Per-user or per-organization

**SharePoint Scenario**: Potentially hundreds of SharePoint users → 1 service account

**Options**:
- **Option A**: Service account counts as 1 user (unlimited SharePoint users)
  - ✅ Simple, predictable pricing
  - ⚠️ May undercharge for high-volume usage

- **Option B**: Usage-based pricing (per document processed)
  - ✅ Aligns cost with value
  - ❌ Complex billing, unpredictable for customers

- **Option C**: Tiered pricing (SharePoint Integration add-on)
  - ✅ Clear pricing model
  - ✅ Can tier by volume (< 100 docs/month, < 1000 docs/month, unlimited)
  - ✅ Encourages high-value customers

- **Option D**: Per-processor execution (existing usage tracking)
  - ✅ Reuses existing infrastructure (organization_app_usage table)
  - ✅ Fair (pay for what you use)

**Questions to Answer**:
1. How do competitors price SharePoint integrations?
2. What is the expected volume per customer? (100 docs/day? 1000 docs/day?)
3. Should SharePoint integration be a separate SKU or included in Enterprise tier?
4. How do we prevent abuse? (rate limiting, quotas)

**Stakeholders**: Pricing, Sales, Finance, Product

---

### 7. IT Admin Support Model

#### Decision: How do we support IT admins during setup?

**Options**:
- **Option A**: Self-service only (documentation + video)
  - ✅ Scalable
  - ❌ May have high setup failure rate

- **Option B**: Assisted setup (scheduled call with ValidAI engineer)
  - ✅ Higher success rate
  - ✅ Collect feedback on setup experience
  - ❌ Not scalable (requires CSM/engineering time)

- **Option C**: Hybrid (self-service + support ticket)
  - ✅ Scalable with fallback
  - ✅ Track common issues

**Questions to Answer**:
1. What is the expected technical skill level of customer IT admins?
2. How many SharePoint integrations per month? (determines support load)
3. Should setup be part of onboarding or self-service feature?

**Stakeholders**: Customer Success, Support, Product

---

### 8. Integration Approach: Interactive vs. Automated vs. Both

#### Decision: Which SharePoint integration patterns should we support?

**Context**: Research identified two complementary use cases with different integration patterns.

**Options**:
- **Option A**: SPFx Web Part Only (Interactive)
  - ✅ User-driven, on-demand processing
  - ✅ Real-time feedback in SharePoint UI
  - ✅ Target: Power users, analysts
  - ❌ No automation support
  - ❌ Not suitable for high-volume scenarios
  - **Effort**: 4-6 weeks

- **Option B**: Power Automate Only (Automated)
  - ✅ Event-driven, automated workflows
  - ✅ No-code flow designer
  - ✅ Target: IT admins, process automation
  - ❌ No interactive UI for users
  - ❌ Limited real-time feedback
  - **Effort**: 3-4 weeks (OpenAPI + connector)

- **Option C**: Both (Phased Approach) ⭐ **RECOMMENDED**
  - ✅ Covers both use cases
  - ✅ Maximum market coverage
  - ✅ Phase 2 reuses Phase 1 infrastructure (80% code reuse)
  - ✅ Competitive differentiator (most competitors support only one)
  - **Phase 1**: SPFx Web Part (4-6 weeks)
  - **Phase 2**: Power Automate Connector (2-3 weeks incremental)
  - **Total**: 6-9 weeks

**Use Case Comparison**:

| Aspect | SPFx Web Part | Power Automate |
|--------|---------------|----------------|
| Trigger | User clicks "Process" | Auto (upload, schedule, approval) |
| Target Users | Analysts, power users | IT admins, automation teams |
| Volume | Ad-hoc (10-50/day) | High-volume (100-1000/day) |
| Feedback | Real-time progress bar | Email notification when done |
| Customization | Full UI/UX control | Limited to PA actions |

**Questions to Answer**:
1. Which use case has higher priority? (interactive vs. automated)
2. Can we validate interactive approach with pilot before committing to both?
3. Do target customers need automation or is interactive sufficient?
4. What percentage of competitors support both vs. only one?

**Recommendation**: **Option C (Both)** - Phase 1 SPFx, Phase 2 Power Automate
- Validate interactive pattern with pilot (reduce risk)
- Minimal incremental effort for Power Automate (reuses Edge Functions, tenant mappings, billing logs)
- Competitive advantage (broad coverage)

**Stakeholders**: Product, Engineering, Sales, Marketing

---

### 9. Billing Model with Per-User Tracking

#### Decision: How to track and bill for SharePoint user executions?

**Context**: SharePoint integration enables per-user billing attribution via Azure AD token claims (`oid`, `email`).

**Current Capability** (from Question A research):
- ✅ Extract user identity from validated Azure AD tokens
- ✅ Log every execution with `user_oid`, `user_email`, `sharepoint_site_url`
- ✅ Support per-user, per-org, and department chargeback billing

**Billing Model Options**:

**Option A**: Per-Organization Only (Service Account Billing)
- ✅ Simple: 1 service account = 1 billing entity
- ✅ Predictable pricing for customers
- ❌ Cannot differentiate high-usage vs. low-usage users
- ❌ Cannot support department chargeback within organization
- **Pricing Example**: $500/month per organization (unlimited users)

**Option B**: Per-User Metered Billing
- ✅ Fair: Users pay for what they use
- ✅ Enables department chargeback (user → department mapping)
- ✅ Supports usage analytics per user
- ❌ Complex billing (track usage per user across all SharePoint users)
- ❌ Unpredictable costs for customers (variable monthly bill)
- **Pricing Example**: $0.10 per document processed per user

**Option C**: Hybrid Tiered Billing (Per-Org + Usage Caps) ⭐ **RECOMMENDED**
- ✅ Predictable base cost + overage charges
- ✅ Encourages adoption (base tier includes reasonable usage)
- ✅ Supports chargeback (usage tracked per user, billed to org)
- ✅ Simple pricing tiers
- **Pricing Example**:
  - **Basic**: $200/month (100 docs/month, unlimited users)
  - **Pro**: $500/month (1,000 docs/month, unlimited users)
  - **Enterprise**: $2,000/month (10,000 docs/month, unlimited users)
  - **Overage**: $0.20 per document beyond tier limit

**Option D**: Per-Execution with User Attribution (Usage-Based + Chargeback)
- ✅ Reuses existing `organization_app_usage` infrastructure
- ✅ Detailed usage reports per user for chargeback
- ✅ Fair pricing (pay per execution regardless of user count)
- ✅ Supports both org-level billing and internal chargeback
- ❌ Requires billing report generation for customers
- **Pricing Example**: $0.50 per processor execution (track which user triggered it)

**Database Support** (Already Designed):
```sql
-- Enhanced sharepoint_execution_logs table supports all billing models
CREATE TABLE sharepoint_execution_logs (
  user_oid text NOT NULL,              -- For per-user tracking
  user_email text NOT NULL,             -- For billing reports
  azure_tenant_id text NOT NULL,        -- For per-org billing
  sharepoint_site_url text NOT NULL,    -- For department chargeback
  llm_tokens_total integer,             -- For token-based billing
  execution_cost_usd decimal(10,4),     -- For cost tracking
  -- ... other fields
);
```

**Reporting Capabilities**:
- Per-user usage report (email, executions, tokens, cost)
- Per-organization monthly billing (unique users, total executions, cost)
- Department chargeback (site URL → department → cost allocation)

**Questions to Answer**:
1. What billing model aligns with ValidAI's existing pricing strategy?
2. Do customers expect per-user billing or per-organization billing?
3. Should SharePoint integration pricing match core ValidAI pricing or be separate?
4. Do we need to support chargeback reporting for internal departments?
5. What is the expected monthly volume per organization? (determines tier thresholds)

**Recommendation**: **Option C (Hybrid Tiered)** for customer-facing pricing + **Option D (Per-Execution with Attribution)** for internal tracking
- Customer sees: Simple tiered pricing with predictable costs
- Internal billing: Track every execution with full user attribution
- Enables future features: Usage analytics, department chargeback, power user identification
- GDPR compliant: User data retained only as long as billing requires (7 years), then anonymized

**Stakeholders**: Pricing, Finance, Product, Legal (GDPR/data retention)

---

## Technical Investigations Needed

### 1. Azure AD Token Validation

**Investigation**: How to validate Azure AD tokens in Supabase Edge Functions?

**Research Tasks**:
- [ ] Test Microsoft JWKS endpoint (https://login.microsoftonline.com/common/discovery/keys)
- [ ] Evaluate libraries: `jose` (NPM) vs. manual validation
- [ ] Test token validation performance (latency impact)
- [ ] Determine caching strategy for JWKS (reduce external calls)
- [ ] Handle token expiration gracefully (error messages)

**Key Questions**:
1. What is the latency of JWKS lookup? (caching critical?)
2. How do we handle Microsoft JWKS rotation? (refresh cache periodically)
3. What claims do we need from token? (tid, oid, email, name)

**Owner**: Engineering (Backend)

---

### 2. SPFx Development Environment

**Investigation**: What's required to build and deploy SPFx web parts?

**Research Tasks**:
- [ ] Set up SPFx development environment (Node.js, Yeoman, Gulp)
- [ ] Create "Hello World" SPFx web part
- [ ] Test Azure AD authentication in SPFx (AadHttpClient)
- [ ] Deploy to test SharePoint tenant (app catalog)
- [ ] Test in SharePoint Online page
- [ ] Understand packaging (.sppkg file structure)
- [ ] Test tenant-wide deployment vs. site-specific

**Key Questions**:
1. Can we build SPFx with modern tooling (Vite, TypeScript 5) or stuck with Gulp?
2. How do we manage SPFx package versions? (auto-update or manual deploy?)
3. What's the approval process for tenant-wide deployment?

**Owner**: Engineering (Frontend)

---

### 3. Supabase Edge Function CORS

**Investigation**: How to handle CORS for SharePoint origin?

**Research Tasks**:
- [ ] Identify SharePoint origin patterns (https://{tenant}.sharepoint.com)
- [ ] Test CORS preflight requests from SharePoint
- [ ] Configure Edge Function CORS headers
- [ ] Test with wildcard vs. specific tenant (security implications)
- [ ] Handle multiple SharePoint tenants (different origins)

**Key Questions**:
1. Can we use wildcard (*.sharepoint.com) or need explicit tenant list?
2. What are the security risks of wildcard CORS?
3. Do we need OPTIONS handler in Edge Function?

**Owner**: Engineering (Backend)

---

### 4. Rate Limiting Strategy

**Investigation**: How to prevent abuse and manage volume?

**Research Tasks**:
- [ ] Review Supabase Edge Function quotas (invocations per second)
- [ ] Design rate limiting by tenant (not just by service account)
- [ ] Evaluate rate limiting libraries (upstash/ratelimit, etc.)
- [ ] Test rate limit error handling in SPFx web part
- [ ] Define reasonable limits per tier (Free: 10/day, Pro: 100/day, Enterprise: unlimited?)

**Key Questions**:
1. Should rate limiting be per tenant or per user?
2. What's the user experience when rate limited? (retry after X minutes)
3. How do we track usage for billing? (separate from rate limiting)

**Owner**: Engineering (Backend), Product (limits definition)

---

### 5. Service Account Provisioning

**Investigation**: How to auto-create service accounts securely?

**Research Tasks**:
- [ ] Design service account creation flow (Admin Portal → Edge Function)
- [ ] Generate secure random passwords (never shown to admin)
- [ ] Store service account credentials (Supabase Auth + mapping table)
- [ ] Test service account login (Supabase Auth API)
- [ ] Implement service account session caching (reduce auth calls)
- [ ] Handle service account password rotation (if required)

**Key Questions**:
1. Should service accounts be visible in organization members list?
2. How long are service account sessions valid? (1 hour? 24 hours?)
3. Do we need service account audit logs? (separate from execution logs)

**Owner**: Engineering (Backend), Security

---

### 6. Real-Time Status Updates

**Investigation**: How to show processing status in SPFx web part?

**Research Tasks**:
- [ ] Test Supabase Realtime from SharePoint origin (CORS, WebSockets)
- [ ] Compare Realtime vs. polling (latency, reliability, cost)
- [ ] Implement status polling with exponential backoff
- [ ] Test concurrent executions (multiple users on same page)
- [ ] Handle connection drops (SharePoint page refresh)

**Key Questions**:
1. Does Supabase Realtime work from SharePoint (firewall, WebSockets)?
2. What's the fallback if Realtime is blocked? (polling frequency?)
3. Should we show progress percentage or just "processing" spinner?

**Owner**: Engineering (Frontend)

---

### 7. Error Handling & User Feedback

**Investigation**: How to handle failures gracefully?

**Research Tasks**:
- [ ] Map ValidAI error codes to user-friendly messages
- [ ] Design error UI in SPFx web part (toast notifications, inline errors)
- [ ] Test common failure scenarios:
  - [ ] Invalid processor ID
  - [ ] Document too large
  - [ ] Rate limit exceeded
  - [ ] Tenant not configured
  - [ ] Azure AD token expired
  - [ ] LLM provider error
- [ ] Implement retry logic (automatic vs. manual)

**Key Questions**:
1. Should errors be shown in SharePoint UI or sent via email?
2. How do users report issues? (support ticket from web part?)
3. Should we log errors to Application Insights or similar?

**Owner**: Engineering (Frontend, Backend), UX

---

### 8. OpenAPI Specification Development

**Investigation**: How to create Power Automate custom connector with OpenAPI spec?

**Research Tasks**:
- [ ] Review Power Automate connector requirements documentation
- [ ] Study OpenAPI 3.0 specification format for Power Automate
- [ ] Understand `x-ms-*` extensions for Power Automate UI (visibility, dynamic values, summaries)
- [ ] Test dynamic dropdown pattern (`x-ms-dynamic-values`) for processor selection
- [ ] Create sample OpenAPI spec for ValidAI endpoints:
  - [ ] `/sharepoint/execute-processor` (POST, returns 202)
  - [ ] `/runs/{run_id}/status` (GET, polling endpoint)
  - [ ] `/runs/{run_id}/results` (GET, final results)
  - [ ] `/processors` (GET, list for dropdown)
- [ ] Test importing OpenAPI spec into Power Automate
- [ ] Validate OAuth2 flow configuration (authorization code flow)
- [ ] Test connector in actual Power Automate flow

**Key Questions**:
1. What are the OpenAPI spec requirements for Microsoft certification? (if publishing to marketplace)
2. How do we version the API for connector updates? (breaking vs. non-breaking changes)
3. Can we test connector locally or need published endpoint?
4. What are the approval/certification timelines for custom connectors?

**Owner**: Engineering (Backend, API Design)

---

### 9. Power Automate Connector Testing

**Investigation**: How to test and validate Power Automate integration end-to-end?

**Research Tasks**:
- [ ] Set up test Power Automate environment (tenant)
- [ ] Create test SharePoint site with document library
- [ ] Build sample flow: Upload → Execute Processor → Poll Status → Get Results → Write to List
- [ ] Test async pattern (202 response + polling loop)
- [ ] Measure polling performance (how long for results?)
- [ ] Test error scenarios:
  - [ ] Invalid processor ID (404 response)
  - [ ] File too large (413 response)
  - [ ] Rate limit (429 response with Retry-After)
  - [ ] Tenant not configured (403 response)
  - [ ] Network timeout during execution
- [ ] Test SharePoint list integration (write structured results)
- [ ] Test file metadata updates (validation score, status)
- [ ] Validate OAuth2 token refresh (1-hour expiry)
- [ ] Test concurrent flows (multiple documents uploading simultaneously)

**Key Questions**:
1. What is the actual Power Automate HTTP action timeout? (documented as 2 min, is it strict?)
2. How many concurrent flows can run per organization? (throttling limits)
3. Can Power Automate handle large JSON responses? (results with 50+ operations)
4. What is the best polling interval? (balance latency vs. API calls)

**Owner**: Engineering (Backend, QA)

---

### 10. Billing Data Schema Design

**Investigation**: How to implement billing data collection and reporting for SharePoint users?

**Research Tasks**:
- [ ] Finalize `sharepoint_execution_logs` table schema with billing fields
- [ ] Design indexes for billing query performance:
  - [ ] Per-user usage queries (by `user_oid`, `executed_at`)
  - [ ] Per-organization billing (by `azure_tenant_id`, `executed_at`)
  - [ ] Department chargeback (by `sharepoint_site_url`)
- [ ] Create billing report SQL queries:
  - [ ] Monthly usage per user (executions, tokens, cost)
  - [ ] Monthly billing per organization (unique users, total cost)
  - [ ] Department chargeback report (site → department → cost)
- [ ] Design data retention policy:
  - [ ] How long to retain user PII? (7 years for audit?)
  - [ ] Anonymization strategy (user data redaction after retention period)
- [ ] Test GDPR compliance:
  - [ ] Right to deletion (anonymize user data on request)
  - [ ] Data export (provide user's execution history)
- [ ] Design cost calculation logic:
  - [ ] LLM token cost (provider-specific pricing)
  - [ ] Edge Function execution cost
  - [ ] Storage cost (document size × retention period)
- [ ] Create billing dashboard mockups:
  - [ ] Admin view (organization-wide usage)
  - [ ] User view (individual usage history)
  - [ ] Department manager view (team chargeback)

**Key Questions**:
1. How to calculate `execution_cost_usd` in real-time? (LLM pricing varies by provider)
2. Should cost include only LLM tokens or also infrastructure costs?
3. How to handle cost estimation for tiered pricing? (predict if customer will exceed tier)
4. What level of billing detail do customers expect? (per-user vs. aggregate only)
5. How to anonymize user data while preserving billing integrity? (preserve cost, redact PII)

**Owner**: Engineering (Backend, Database), Product (reporting requirements), Legal (GDPR compliance)

---

## Business Decisions

### 1. SharePoint Integration Pricing Tier

**Decision**: Is SharePoint integration a separate SKU or included in existing plans?

**Options**:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Included in Enterprise** | No extra charge | ✅ Simple, competitive differentiator | ❌ May leave money on table |
| **B: Separate Add-On** | +$X/month per tenant | ✅ Revenue opportunity | ❌ Complexity in sales process |
| **C: Usage-Based** | $X per document processed | ✅ Fair, scales with value | ❌ Unpredictable for customers |
| **D: Tiered Add-On** | Basic ($X): 100 docs/month<br>Pro ($Y): 1000 docs/month<br>Unlimited ($Z) | ✅ Clear pricing, upsell path | ❌ Requires usage tracking |

**Questions to Answer**:
1. What are customer expectations? (included or extra?)
2. What do competitors charge for similar integrations?
3. What's the development cost to recoup?
4. How does this affect sales cycle? (longer negotiation if separate SKU)

**Stakeholders**: Pricing, Sales, Finance, Product

---

### 2. Go-to-Market Strategy

**Decision**: How do we launch SharePoint integration?

**Options**:
- **Option A: Private Beta** (invite-only, 5-10 customers)
  - ✅ Collect feedback, iterate quickly
  - ✅ Limit support burden
  - ❌ Slow market penetration

- **Option B: Public Beta** (self-service signup)
  - ✅ Faster adoption
  - ⚠️ Requires polished documentation
  - ⚠️ Higher support load

- **Option C: Enterprise-Only** (sales-led, no self-service)
  - ✅ Control deployment, white-glove support
  - ✅ Collect requirements from high-value customers
  - ❌ Limits market reach

**Questions to Answer**:
1. Do we have marketing content ready? (landing page, demo video)
2. What's the sales enablement plan? (train sales on SharePoint integration)
3. Should we create a SharePoint integration case study?

**Stakeholders**: Marketing, Sales, Product

---

### 3. Support & SLA Commitments

**Decision**: What level of support do we commit to?

**Considerations**:
- SharePoint integration adds complexity (3 systems: SharePoint, Azure AD, ValidAI)
- Issues may be outside ValidAI's control (Azure AD down, SharePoint throttling)
- IT admins expect high reliability for business-critical integrations

**Questions to Answer**:
1. What is the target uptime SLA? (99.9%? 99.5%?)
2. How do we handle Microsoft outages? (Azure AD, SharePoint down)
3. What's the escalation path for integration issues?
4. Do we need 24/7 support or business hours only?

**Stakeholders**: Support, Customer Success, Legal (SLA contracts)

---

## Risk Assessment

### Security Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Azure AD token forgery** | Critical | Low | Validate tokens against Microsoft JWKS, check signature + expiration |
| **Tenant ID spoofing** | High | Low | Token validation prevents spoofing (Microsoft signs tenant ID) |
| **Service account compromise** | High | Medium | Store credentials securely, rotate periodically, limit permissions |
| **Cross-tenant data leakage** | Critical | Low | RLS policies enforce organization isolation, audit all executions |
| **Unauthorized processor access** | Medium | Medium | Check processor belongs to organization before execution |
| **Replay attacks** | Medium | Low | Token expiration (1 hour), HTTPS only |

**Security Review Requirements**:
- [ ] Penetration testing before GA
- [ ] Security architecture review (CISO approval)
- [ ] OWASP Top 10 validation
- [ ] Data flow diagram review (compliance team)

---

### Compliance Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Data residency violations** | Critical | Medium | Configurable Supabase region per org, document customer requirements |
| **GDPR non-compliance** | High | Low | Audit logs, right to deletion (org admin), data portability |
| **Audit trail gaps** | Medium | Medium | Log every execution with user email + site URL |
| **Unauthorized data access** | High | Low | RLS policies, service account has member role only |

**Compliance Review Requirements**:
- [ ] GDPR impact assessment
- [ ] SOC 2 controls mapping
- [ ] Data processing agreement (DPA) updates
- [ ] Privacy policy updates (third-party data processing)

---

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Edge Function timeout (25 min)** | High | Medium | Chunked execution (Phase 1.8 pattern), document size limits |
| **SharePoint API throttling** | Medium | Medium | Respect throttling headers, implement retry with backoff |
| **Azure AD token expiration** | Low | High | Refresh token in SPFx web part, graceful error handling |
| **Supabase outage** | High | Low | Status page, SLA commitments, fallback messaging |
| **SPFx compatibility issues** | Medium | Medium | Test across SharePoint Online updates, maintain test tenant |

**Technical Validation Requirements**:
- [ ] Load testing (100 concurrent users)
- [ ] Failure scenario testing (network drops, token expiry, etc.)
- [ ] SharePoint version compatibility testing
- [ ] Performance testing (document upload → results latency)

---

### Business Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Low adoption (customers don't use)** | High | Medium | Validate with pilot customers first, ensure clear value prop |
| **High support burden** | Medium | High | Comprehensive documentation, assisted setup for first deployments |
| **Pricing misalignment** | Medium | Medium | Market research, pilot feedback on pricing |
| **Competitive response** | Low | Medium | First-mover advantage, build integration moat |

---

## Next Steps: Path to Implementation Plan

### Step 1: Stakeholder Review (This Document)
**Timeline**: 1-2 weeks
**Participants**: Product, Engineering, Sales, Legal, Finance, Security
**Outcome**: Decisions on all "Pre-Implementation Decisions Required" sections

**Deliverable**: Decision log with rationale

---

### Step 2: Technical Feasibility Validation
**Timeline**: 1-2 weeks
**Participants**: Engineering (Backend + Frontend)
**Outcome**: Validate all "Technical Investigations Needed" items

**Deliverable**: Technical feasibility report with:
- Proof-of-concept: Azure AD token validation
- Proof-of-concept: SPFx "Hello World" with ValidAI API call
- Performance benchmarks (token validation latency, document upload time)
- Risk mitigation plans for technical risks

---

### Step 3: Pilot Customer Identification
**Timeline**: 1 week
**Participants**: Sales, Customer Success
**Outcome**: Identify 2-3 pilot customers

**Deliverable**: Pilot customer profiles with:
- SharePoint version (Online vs. on-prem)
- Expected volume (docs/month)
- Use case (contract validation, compliance, etc.)
- IT team availability (setup support)

---

### Step 4: Create Implementation Plan
**Timeline**: 1 week
**Participants**: Engineering, Product
**Outcome**: Detailed implementation plan

**Deliverable**: Implementation plan document with:
- Database schema (DDL migrations)
- Edge Function specifications
- Admin Portal UI mockups
- SPFx web part architecture
- Sprint breakdown (Agile 2-week sprints)
- Testing plan (unit, integration, E2E)
- Documentation plan (IT admin guide, end-user guide)
- Go-live checklist

---

### Step 5: Development & Pilot
**Timeline**: 6-8 weeks
**Participants**: Engineering, QA, Product, Customer Success
**Outcome**: MVP deployed to pilot customers

**Deliverable**:
- Functional SharePoint integration
- Deployed to 2-3 pilot tenants
- Feedback collected (setup experience, UX, performance)
- Iteration plan based on feedback

---

### Step 6: General Availability
**Timeline**: 2-4 weeks after pilot
**Participants**: Marketing, Sales, Engineering, Support
**Outcome**: Public launch

**Deliverable**:
- Marketing materials (landing page, demo video, blog post)
- Sales enablement (training, pitch deck)
- Support documentation (KB articles, troubleshooting guides)
- SLA commitments
- Pricing published

---

## Open Questions Summary

### Product Questions
1. **Data Residency**: Copy to Supabase vs. access via SharePoint API?
2. **Results Storage**: Display in web part only vs. write to SharePoint lists?
3. **Document Size Limit**: 10 MB? 50 MB? 100 MB?
4. **SharePoint Versions**: Online only or include on-prem?
5. **Pricing Model**: Included in Enterprise vs. separate add-on?

### Technical Questions
1. **Token Validation**: Which library (jose vs. manual)? Caching strategy?
2. **Real-Time Updates**: Supabase Realtime vs. polling?
3. **Rate Limiting**: Per tenant or per user? What limits?
4. **Error Handling**: Retry logic? User feedback strategy?
5. **CORS**: Wildcard (*.sharepoint.com) or explicit tenant list?

### Business Questions
1. **Pilot Customers**: Which customers? Internal pilot first?
2. **Go-to-Market**: Private beta vs. public beta vs. enterprise-only?
3. **Support Model**: Self-service vs. assisted setup?
4. **SLA Commitments**: 99.9% uptime? 24/7 support?
5. **Competitive Positioning**: How do we differentiate?

---

## Appendix: References

### External Resources
- [SharePoint Framework Overview](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/sharepoint-framework-overview)
- [Azure AD Token Validation](https://learn.microsoft.com/en-us/azure/active-directory/develop/access-tokens)
- [Microsoft JWKS Endpoint](https://login.microsoftonline.com/common/discovery/keys)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

### Internal Resources
- ValidAI Core Architecture: `docs/architecture/validai-core-architecture.md`
- Phase 1.8 Processor Execution: `docs/planning/Phase_1.8_Processor_Execution_Implementation.md`
- Phase 1.9 Direct Upload: `docs/planning/Phase_1.9_Optional_Storage_And_Streaming_Uploads.md`
- Admin Portal Implementation: `apps/admin-portal/`

### Related Planning Documents
- `Input_for_Publish_planning.md` - Original SharePoint scenario documentation
- `Commercial_Strategy_High_Volume_Recurring_Usage.md` - Pricing strategy

---

## Document Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-11-30 | Claude | Initial draft - pre-implementation planning |

---

**Next Action**: Schedule stakeholder review meeting to make decisions on "Pre-Implementation Decisions Required" sections.
