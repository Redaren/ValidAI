# Proposed Database Design for ValidAI Document Intelligence System

VERSION 0.1 2025-09-28

## Executive Summary

ValidAI is building a document intelligence platform that enables organizations to create reusable, AI-powered document analysis workflows. This document outlines the proposed database architecture for the MVP, building upon the existing multi-tenant infrastructure.

## Business Context

### Problem Statement
Organizations spend significant manual effort reviewing documents for compliance, extracting key information, and validating content against criteria. This process is:
- Time-consuming and repetitive
- Prone to human error and inconsistency
- Difficult to scale with growing document volumes
- Expensive due to skilled labor requirements

### Solution
An AI-powered system that:
- Defines reusable analysis templates (Processors) for document types
- Automatically executes these templates against uploaded documents
- Produces structured, actionable insights from unstructured content
- Maintains audit trails for compliance and quality assurance

### Target Use Cases
- **Legal**: Contract review, compliance checking, clause extraction
- **Finance**: Invoice processing, report validation, risk assessment
- **HR**: Policy compliance, resume screening, documentation review
- **Technical**: Documentation quality, specification validation, requirements analysis

## Core Concepts & Entities

### 1. Document
**Definition**: A file uploaded to the system for analysis.

**Purpose**: Represents any text-based content that needs to be analyzed - contracts, reports, policies, technical documentation, etc.

**Key Characteristics**:
- Owned by an organization
- Can be analyzed multiple times with different processors
- Stored securely in Supabase Storage
- Maintains metadata about origin and type

### 2. Processor
**Definition**: A reusable template that defines HOW to analyze a specific type of document.

**Purpose**: Encapsulates the knowledge and methodology for document analysis, making expertise scalable and consistent.

**Key Characteristics**:
- Created once, used many times
- Contains a collection of operations to perform
- Organization-owned with visibility controls (personal vs organization-wide)
- Can evolve over time while maintaining execution history

**Example**: "Software Development Contract Reviewer" - a processor containing 20+ operations to check payment terms, IP ownership, liability clauses, termination conditions, etc.

**Visibility Note**: Processors can be personal (visible only to creator) or organization-wide (visible to all organization members). External publishing (e.g., embedded in SharePoint for non-ValidAI users) is a future capability outside MVP scope.

### 3. Operation
**Definition**: An individual analysis task within a processor - a single question or extraction request.

**Purpose**: Atomic unit of analysis that queries the document for specific information.

**Operation Types**:
- **Extraction**: "What is the payment amount?" → Returns: $50,000
- **Validation**: "Does the contract include a confidentiality clause?" → Returns: Yes/No
- **Rating**: "Rate the clarity of termination conditions from 1-10" → Returns: 7/10
- **Classification**: "What type of liability cap is used?" → Returns: "Mutual cap"
- **Analysis**: "Summarize the intellectual property terms" → Returns: Free-form text

### 4. Run
**Definition**: An execution instance where a processor is applied to a specific document, with an immutable snapshot of the complete state.

**Purpose**: Tracks the actual analysis event, capturing when a document was processed, what the results were, and the exact processor configuration used at execution time.

**Key Characteristics**:
- Links ONE document to ONE processor via snapshot (not direct foreign keys)
- Immutable frozen snapshot of processor, operations, and document metadata
- Survives processor/document deletion (preserves audit trail)
- Tracks progress in real-time (total, completed, failed operation counts)
- Produces individual operation results stored separately
- Supports chunked background execution for unlimited operations
- Manual trigger from UI with future support for webhooks/scheduled runs

**Architecture Benefits**:
- **Decoupling**: Processor changes during run don't affect in-progress execution
- **Auditability**: Exact state preserved forever, even if processor deleted
- **Reproducibility**: Complete context available for debugging and analysis
- **Self-contained**: Single record query returns all run metadata

**Example Run Record**:
A run executing "Contract Reviewer" processor on "Agreement.pdf" stores:
- Complete processor configuration (name, system prompt, settings)
- All 20 operations with their prompts and schemas
- Document metadata (name, type, storage path)
- Progress counters updated atomically during execution
- Status transitions: pending → processing → completed

### 5. Operation Result
**Definition**: The outcome from executing a single operation within a run, with comprehensive execution metadata.

**Purpose**: Stores what the AI found when executing each operation, including raw responses, structured outputs, token usage, and error tracking.

**Key Characteristics**:
- One result per operation per run (linked by `run_id` and `execution_order`)
- Contains operation snapshot for self-contained querying
- Stores complete LLM response text and structured outputs
- Tracks token usage breakdown (input, output, cached read/write)
- Records execution timing and cache hit status
- Includes error details and retry count for failed operations
- Supports extended thinking mode with reasoning blocks
- Real-time updates published to subscribed clients

**Execution Flow**:
1. Edge Function creates result record (status: pending)
2. Downloads document from storage
3. Executes LLM operation with retry logic
4. Updates result with response/structured_output (status: completed)
5. Increments parent run progress counter
6. Continues to next operation (even if failed)

**Error Handling**:
- Transient errors (rate limits, timeouts): Retry up to 3x with exponential backoff
- Permanent errors (auth failures, invalid requests): Fail immediately
- Error message, type, and retry count stored for debugging
- Operation failure doesn't stop run execution (continue-on-failure strategy)

**Cost Tracking**:
Token usage includes prompt caching metrics:
- First operation: Creates cache (cached_write > 0)
- Subsequent operations: Hit cache (cached_read > 0, ~90% savings)
- Model used stored for accurate cost calculation

**Example Operation Result**:
```json
{
  "status": "completed",
  "response_text": "The payment amount is $50,000 due within 30 days.",
  "structured_output": { "amount": 50000, "currency": "USD", "due_days": 30 },
  "tokens_used": { "input": 617, "output": 155, "cached_read": 0, "cached_write": 617 },
  "execution_time_ms": 5432,
  "cache_hit": false,
  "model_used": "claude-3-5-sonnet-20241022"
}
```

## Database Architecture

### Design Principles

1. **Multi-Tenant Isolation**: All data scoped to organizations using Row Level Security (RLS)
2. **Leverage Supabase Platform**: Use PostgREST, RLS, Storage, and Edge Functions - avoid custom APIs
3. **Template vs Execution Separation**: Clear distinction between definitions and execution instances
4. **Immutability**: Runs capture point-in-time snapshots for reproducibility
5. **Flexibility**: JSONB fields for evolving features without migrations

### Integration with Existing Architecture

The proposed design builds upon the existing multi-tenant foundation:
- Uses existing `organizations` and `organization_members` tables
- Follows established RLS patterns with organization-based isolation
- Leverages existing authentication and JWT metadata patterns
- Maintains consistency with current database function patterns

### Data Flow MVP

```
1. User uploads document → stored in Supabase Storage → record in documents table
2. User creates/selects processor → defines operations → saves as template
3. User triggers run from UI:
   a. Drag-and-drop uploads document (if new)
   b. Invokes execute-processor-run Edge Function
   c. Edge Function creates frozen snapshot (processor + operations + document)
   d. Edge Function inserts run record (status: pending)
   e. Edge Function self-invokes for background processing
   f. Returns HTTP 202 immediately with run_id
4. Background execution (chunked):
   a. Process operations in chunks of 10
   b. Execute each operation via shared LLM executor
   c. Update operation_results table with results
   d. Increment run progress atomically
   e. Self-invoke for next chunk OR mark run completed
5. Real-time updates:
   a. Database changes published via Supabase Realtime
   b. Frontend subscribed to runs and operation_results tables
   c. TanStack Query invalidates and refetches on updates
   d. UI shows live progress bar and results table
6. Results viewing:
   a. Run detail page displays progress and status
   b. Operation results table shows expandable rows
   c. Structured outputs visualized with type-specific renderers
   d. Runs list page shows history for processor
```

**Key Architecture Decisions**:
- **Edge Functions** for execution orchestration (not API routes)
- **PostgREST** for data fetching (direct table queries)
- **Realtime** for live progress updates (WebSocket subscriptions)
- **TanStack Query** for caching and state management
- **Snapshot-based** immutability for audit trail
- **Chunked processing** to avoid 25-minute Edge Function timeout

## Proposed Tables

### Core Tables (MVP Required)

#### 📄 `documents`
**Purpose**: Store document metadata and reference to file in Supabase Storage

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `organization_id` | uuid (FK) | Yes | Link to organization (for RLS) |
| `name` | text | Yes | User-friendly document name |
| `original_filename` | text | Yes | Original uploaded filename |
| `mime_type` | text | Yes | File type (application/pdf, text/plain) |
| `size_bytes` | bigint | Yes | File size for quota tracking |
| `storage_path` | text | Yes | Path in Supabase Storage bucket |
| `document_type` | text | No | User-defined category |
| `metadata` | jsonb | No | Flexible custom attributes |
| `uploaded_by` | uuid (FK) | Yes | User who uploaded |
| `created_at` | timestamptz | Yes | Upload timestamp |
| `updated_at` | timestamptz | Yes | Last modified timestamp |
| `deleted_at` | timestamptz | No | Soft delete timestamp |

**Indexes**:
- `organization_id, created_at DESC`
- `organization_id, document_type` (if filtering by type)

---

#### 🔧 `processors`
**Purpose**: Reusable templates defining document analysis methodology

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `organization_id` | uuid (FK) | Yes | Organization that owns this processor |
| `name` | text | Yes | Processor name |
| `description` | text | No | Detailed description |
| `document_type` | text | No | Intended document type |
| `status` | enum | Yes | draft, published, archived |
| `visibility` | enum | Yes | personal, organization |
| `system_prompt` | text | No | System-level context for all operations |
| `area_configuration` | jsonb | No | Area names and display order |
| `configuration` | jsonb | No | Default LLM settings |
| `tags` | text[] | No | Searchable tags |
| `created_by` | uuid (FK) | Yes | User who created |
| `created_at` | timestamptz | Yes | Creation timestamp |
| `updated_at` | timestamptz | Yes | Last modified |
| `published_at` | timestamptz | No | First published date |
| `deleted_at` | timestamptz | No | Soft delete timestamp |

**Status Values**:
- `draft`: Still being edited
- `published`: Ready for use
- `archived`: No longer active

**Visibility Values** (MVP):
- `personal`: Only visible to the creator
- `organization`: Visible to all members of the organization

**Note on External Publishing** (Post-MVP):
External publishing (e.g., embedding processors in SharePoint for non-ValidAI users to submit documents and receive reports) is a separate feature outside the MVP scope. This would involve iframe embedding and email-based report delivery, not visibility within ValidAI itself.

---

#### ⚙️ `operations`
**Purpose**: Individual analysis tasks within a processor

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `processor_id` | uuid (FK) | Yes | Parent processor |
| `name` | text | Yes | Operation name |
| `description` | text | No | What this operation does |
| `operation_type` | enum | Yes | Type of operation |
| `prompt` | text | Yes | Prompt sent to LLM |
| `output_schema` | jsonb | No | Expected output structure |
| `validation_rules` | jsonb | No | Pass/fail criteria |
| `area` | text | No | Container/group name (default: "default") |
| `position` | decimal(20,10) | Yes | Fractional position for ordering |
| `required` | boolean | Yes | Must succeed for valid run |
| `configuration` | jsonb | No | Operation-specific LLM settings |
| `created_at` | timestamptz | Yes | Creation timestamp |
| `updated_at` | timestamptz | Yes | Last modified |

**Operation Types**:
- `extraction`: Extract specific values
- `validation`: Yes/no checks
- `rating`: Numerical scores
- `classification`: Categorization
- `analysis`: Free-form analysis

**Note**: Dependencies between operations are **optional** for MVP. If needed, add:
- `depends_on_operation_ids` | uuid[] | No | Simple dependency array

---

#### 🚀 `runs`
**Purpose**: Execution instance linking document to processor with immutable snapshot

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `organization_id` | uuid (FK) | Yes | Organization context (NOT NULL for RLS) |
| `document_id` | uuid (FK) | No | Document being analyzed (nullable - allow deletion) |
| `processor_id` | uuid (FK) | No | Processor template used (nullable - allow deletion) |
| `snapshot` | jsonb | Yes | Frozen processor, operations, and document state |
| `status` | text | Yes | Execution status (default: 'pending') |
| `trigger_type` | text | Yes | How run was initiated (default: 'manual') |
| `triggered_by` | uuid (FK) | No | User who initiated (nullable) |
| `total_operations` | integer | Yes | Total operation count (default: 0) |
| `completed_operations` | integer | Yes | Successfully completed count (default: 0) |
| `failed_operations` | integer | Yes | Failed operation count (default: 0) |
| `error_message` | text | No | Run-level error if failed |
| `started_at` | timestamptz | Yes | Processing start time (default: now()) |
| `completed_at` | timestamptz | No | Processing end time |
| `deleted_at` | timestamptz | No | Soft delete timestamp |

**Status Values**:
- `pending`: Run created, not yet started
- `processing`: Currently executing operations
- `completed`: All operations processed (may have failures)
- `failed`: Run-level failure (not operation failures)
- `cancelled`: User cancelled execution

**Trigger Types**:
- `manual`: User-initiated from UI
- `webhook`: External webhook trigger (future)
- `scheduled`: Cron-based trigger (future)
- `external`: API-based trigger (future)

**Snapshot Structure** (JSONB):
```json
{
  "processor": {
    "id": "uuid",
    "name": "Contract Reviewer",
    "system_prompt": "You are...",
    "configuration": { "selected_model_id": "uuid", "settings_override": {...} }
  },
  "operations": [
    {
      "id": "uuid",
      "name": "Extract Payment Terms",
      "operation_type": "extraction",
      "prompt": "What is the payment amount?",
      "position": 1.0,
      "area": "Extractions",
      "configuration": {...},
      "output_schema": {...}
    }
  ],
  "document": {
    "id": "uuid",
    "name": "Contract.pdf",
    "size_bytes": 1024000,
    "mime_type": "application/pdf",
    "storage_path": "uuid/filename.pdf"
  }
}
```

**Indexes**:
- `idx_runs_processor` on `processor_id` WHERE `deleted_at IS NULL`
- `idx_runs_organization` on `organization_id` WHERE `deleted_at IS NULL`
- `idx_runs_status` on `status` WHERE `deleted_at IS NULL`
- `idx_runs_started` on `started_at DESC` WHERE `deleted_at IS NULL`

---

#### 📊 `operation_results`
**Purpose**: Store outcomes from each operation execution within a run

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `run_id` | uuid (FK) | Yes | Parent run (CASCADE on delete) |
| `operation_id` | uuid (FK) | No | Operation executed (nullable - allow deletion) |
| `operation_snapshot` | jsonb | Yes | Operation state at run time |
| `execution_order` | integer | Yes | Sequence position (0-indexed) |
| `status` | text | Yes | Execution status (default: 'pending') |
| `response_text` | text | No | Complete LLM text response |
| `structured_output` | jsonb | No | Parsed structured data from output schema |
| `thinking_blocks` | jsonb | No | Array of reasoning blocks (if thinking enabled) |
| `model_used` | text | No | Actual model used (e.g., 'claude-3-5-sonnet-20241022') |
| `tokens_used` | jsonb | No | Token breakdown: {input, output, cached_read, cached_write} |
| `execution_time_ms` | integer | No | Duration in milliseconds |
| `cache_hit` | boolean | No | Whether prompt cache was hit (default: false) |
| `error_message` | text | No | Error description if failed |
| `error_type` | text | No | Error class name |
| `retry_count` | integer | No | Number of retry attempts (default: 0) |
| `started_at` | timestamptz | Yes | Execution start time (default: now()) |
| `completed_at` | timestamptz | No | Execution completion time |

**Status Values**:
- `pending`: Not yet processed
- `completed`: Successfully finished
- `failed`: Error occurred (with retry exhausted)

**Tokens Used Structure** (JSONB):
```json
{
  "input": 617,
  "output": 155,
  "cached_read": 0,      // Increases after first operation
  "cached_write": 617    // Only on first operation with caching
}
```

**Thinking Blocks Structure** (JSONB):
```json
[
  {
    "type": "thinking",
    "thinking": "Let me analyze the payment terms..."
  }
]
```

**Indexes**:
- `idx_operation_results_run` on `run_id, execution_order`
- `idx_operation_results_status` on `status`

**Real-time Publication**: Enabled via `supabase_realtime` publication

---

### Database Functions (Implemented)

#### `increment_run_progress()`
**Purpose**: Atomically update run progress counters after each operation completes

```sql
CREATE OR REPLACE FUNCTION increment_run_progress(
  p_run_id uuid,
  p_status text -- 'completed' or 'failed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE runs
  SET
    completed_operations = CASE
      WHEN p_status = 'completed' THEN completed_operations + 1
      ELSE completed_operations
    END,
    failed_operations = CASE
      WHEN p_status = 'failed' THEN failed_operations + 1
      ELSE failed_operations
    END
  WHERE id = p_run_id;
END;
$$;
```

**Usage**: Called by Edge Function after each operation execution to maintain accurate progress counters.

#### `get_llm_config_for_run()` (Updated for Phase 1.8)
**Purpose**: Resolve LLM configuration using processor's organization context (not user JWT)

```sql
CREATE OR REPLACE FUNCTION get_llm_config_for_run(
  p_processor_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
```

**Key Change**: Uses processor's `organization_id` instead of JWT `app_metadata` to enable service-role calls from Edge Functions during background processing.

**Resolution Hierarchy**:
1. Global defaults from `llm_global_settings` table
2. Organization config from `organizations.llm_configuration`
3. Processor override from `processors.configuration.settings_override`

---

### Optional Tables (Future Enhancements)

#### 🔗 `operation_dependencies` (Optional - Complex Dependencies)
Only needed if simple array field in operations table is insufficient.

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Unique identifier |
| `operation_id` | uuid (FK) | Dependent operation |
| `depends_on_operation_id` | uuid (FK) | Dependency |
| `dependency_type` | enum | Type of dependency |
| `condition` | jsonb | Conditional logic |

---

#### 🌐 `processor_external_endpoints` (Post-MVP - External Publishing)
Enable processors to be exposed for external use (e.g., SharePoint embedding).

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Unique identifier |
| `processor_id` | uuid (FK) | Processor to expose |
| `endpoint_slug` | text | URL-safe identifier |
| `allowed_domains` | text[] | Domains allowed to embed |
| `notification_email` | text | Where to send results |
| `is_active` | boolean | Enable/disable endpoint |
| `created_by` | uuid (FK) | User who created |
| `expires_at` | timestamptz | Optional expiration |

**Note**: This table represents future capability for non-ValidAI users to use processors via embedding, completely separate from internal visibility settings.

## Security Implementation

### Row Level Security (RLS)
All tables will implement organization-based RLS policies with visibility considerations:

```sql
-- Example for documents table
CREATE POLICY "Users can view their organization's documents"
  ON documents FOR SELECT
  USING (organization_id = auth.jwt() -> 'app_metadata' ->> 'organization_id');

-- Example for processors table with visibility
CREATE POLICY "Users can view processors based on visibility"
  ON processors FOR SELECT
  USING (
    organization_id = auth.jwt() -> 'app_metadata' ->> 'organization_id'
    AND (
      visibility = 'organization'
      OR (visibility = 'personal' AND created_by = auth.uid())
    )
  );
```

### Storage Integration
Documents stored in Supabase Storage with RLS:
- Bucket: `documents` (single shared bucket)
- Path structure: `{document_id}/{filename}`
- Organization isolation via RLS policies on the bucket
- Document UUID provides uniqueness without exposing organization structure

**Security Note**: Using document_id as the primary path component prevents information leakage about organization structure while maintaining clean URLs. The organization_id relationship is enforced through database RLS policies and Storage RLS policies that reference the documents table.

**Storage RLS Example**:
```sql
-- Storage policy checks organization via documents table
CREATE POLICY "Users can access their organization's documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.storage_path = storage.objects.name
    AND documents.organization_id = auth.jwt() -> 'app_metadata' ->> 'organization_id'
  )
);
```

## Drag-and-Drop Ordering System

### How Operation and Area Ordering Works

The system supports flexible drag-and-drop UI with operations organized in areas/containers:

#### Fractional Positioning System
- **`position`** field uses decimal(20,10) for nearly infinite precision
- Operations start at positions 1.0, 2.0, 3.0, etc.
- Inserting between 1.0 and 2.0 creates position 1.5
- Moving operations requires updating only ONE database row

#### Area/Container Support
- Operations belong to an **`area`** (e.g., "Validations", "Extractions", "Analysis")
- Each area has its own position space (independent numbering)
- Areas themselves have a display order stored in processor's `area_configuration`

#### Example Scenario
**Initial state:**
```
Area: "Validations" (display_order: 1)
  - Check compliance: position 1.0
  - Verify signatures: position 2.0

Area: "Extractions" (display_order: 2)
  - Get payment terms: position 1.0
  - Get parties: position 2.0
```

**User drags "Verify signatures" between the two Extraction operations:**
1. System calculates new position: (1.0 + 2.0) / 2 = 1.5
2. Updates single row: `SET area = 'Extractions', position = 1.5`
3. No other rows need updating

#### Area Configuration
Stored in processor's `area_configuration` field:
```json
{
  "areas": [
    {"name": "Validations", "display_order": 1},
    {"name": "Extractions", "display_order": 2},
    {"name": "Analysis", "display_order": 3}
  ]
}
```

#### Execution Order
During a run, operations execute in display order:
```sql
SELECT * FROM operations
WHERE processor_id = ?
ORDER BY area, position;
```
Combined with area_configuration to determine final sequence.

## Implementation with Supabase

### Using PostgREST (Primary Approach)
Simple CRUD operations use PostgREST directly:
```typescript
// Fetch documents
await supabase.from('documents').select('*')

// Create processor
await supabase.from('processors').insert({...})

// Fetch run with real-time subscription
const { data: run } = await supabase
  .from('runs')
  .select('*')
  .eq('id', runId)
  .single()
```

### Database Functions for Complex Operations
Multi-table operations and atomic updates use database functions:
```sql
-- Create processor with operations (transactional)
CREATE FUNCTION create_processor_with_operations(
  processor_data jsonb,
  operations_data jsonb[]
) RETURNS TABLE(...)

-- Atomically increment run progress
CREATE FUNCTION increment_run_progress(
  p_run_id uuid,
  p_status text -- 'completed' or 'failed'
) RETURNS void

-- Get LLM configuration with organization context
CREATE FUNCTION get_llm_config_for_run(
  p_processor_id uuid,
  p_user_id uuid
) RETURNS jsonb
```

### Edge Functions (Service-Role Only)
For operations requiring elevated privileges or external API calls:

**`execute-processor-run`**: Main orchestration function
- Creates immutable snapshot from processor + operations + document
- Inserts run record and returns immediately (HTTP 202)
- Self-invokes for background chunked execution
- Processes 10 operations per invocation to avoid timeouts
- Uses shared `llm-executor` utility for all LLM calls
- Updates progress atomically via `increment_run_progress()`
- Implements retry logic for transient errors
- Continues on operation failures (partial results strategy)

**Shared Utilities**:
- `_shared/llm-executor.ts`: Reusable LLM execution with retry logic
- `_shared/types.ts`: TypeScript type definitions for snapshots

## MVP Scope Boundaries

### ✅ Implemented (MVP Complete - Phase 1-1.8)
- ✅ Document upload and storage with drag-and-drop UI
- ✅ Processor creation with operations and drag-and-drop ordering
- ✅ Manual run execution via Edge Function
- ✅ Comprehensive operation results with structured outputs
- ✅ Organization-based isolation with RLS
- ✅ Sequential operation execution with chunking
- ✅ Real-time progress updates via Supabase Realtime
- ✅ Run history and detail pages with live updates
- ✅ Snapshot-based immutability for audit trail
- ✅ Prompt caching for cost optimization (90% savings)
- ✅ Error handling with retry logic and continue-on-failure
- ✅ Token tracking and execution metrics
- ✅ Extended thinking mode support
- ✅ 7 operation types (Generic, True/False, Extraction, Rating, Classification, Analysis, Traffic Light)
- ✅ Workbench for testing operations
- ✅ 3-tier LLM configuration system

### ❌ Out of Scope (Post-MVP / Future Phases)
- Processor versioning and change tracking
- External processor publishing (SharePoint embedding, iframe access)
- Automated run triggers (webhooks, scheduled cron jobs)
- Complex operation dependencies and conditional execution
- Formatted run reports (PDF, Excel exports)
- Batch document processing (multiple documents at once)
- Webhook notifications for run completion
- Email-based report delivery for external users
- Public API access for external systems
- Run comparison and diff views
- Analytics dashboard with aggregated metrics
- Approval workflows for run results

## Migration Strategy

1. **Phase 1**: ✅ **COMPLETED** - Create core tables (documents, processors, operations)
   - Created all three core tables with exact field specifications
   - Implemented complete RLS policies for all CRUD operations
   - Set up storage bucket configuration with security functions
   - Created essential database functions (get_ordered_operations, create_processor_with_operations, etc.)
   - Generated TypeScript types
   - *Completed on: 2025-09-29*

2. **Phase 1.5**: ✅ **COMPLETED** - Create UI for creation and management of Processors and operations
   - Built processors listing page with TanStack Table
   - Implemented processor detail view with drag-and-drop operations
   - Added operation management (create, edit, delete) with Sheet UI
   - Created vertical layout with collapsible areas for operation grouping
   - Established 3-tier LLM provider configuration system
   - Enhanced UI with dynamic breadcrumbs and improved header components
   - *Completed on: 2025-10-02*

3. **Phase 1.6**: ✅ **COMPLETED** - Create Workbench for Operations and LLMs
   - Integrated Vercel AI SDK with Anthropic provider for unified LLM interface
   - Implemented message composition system with explicit user controls
   - Built stateful mode (multi-turn conversations) and stateless mode (independent queries)
   - Created operation types system (Generic text and True/False validation with structured outputs)
   - Added operation type selector UI with Sheet modal pattern
   - Implemented structured output visualization with traffic-light display for boolean results
   - Implemented prompt caching with 90% cost reduction and separate file message architecture
   - Added extended thinking mode with reasoning block display
   - Integrated citations support with document grounding)
   - Added model selector UI for LLM configuration
   - Created comprehensive architecture documentation
   - *Completed on: 2025-10-14*

4. **Phase 1.7**: ✅ **COMPLETED** - Expand Operation Types with Structured Outputs
   - Implemented 7 operation types: Generic, True/False, Extraction, Rating, Classification, Analysis, Traffic Light
   - Added Zod schemas for structured validation and TypeScript type safety
   - Enhanced visualizer with operation-specific rendering (traffic lights, badges, cards)
   - All types support thinking mode and prompt caching
   - *Completed on: 2025-10-14*

5. **Phase 1.8**: ✅ **COMPLETED** - Manual Processor Execution (Runs & Results)
   - Created `runs` table with snapshot-based immutability architecture
   - Created `operation_results` table with comprehensive execution tracking
   - Implemented RLS policies for organization-scoped access to runs and results
   - Created database functions (`increment_run_progress`, updated `get_llm_config_for_run`)
   - Built execute-processor-run Edge Function with chunked background processing
   - Implemented shared LLM executor utilities for code reuse
   - Created TanStack Query hooks with real-time subscriptions for live updates
   - Built complete UI: RunProcessorDialog (drag-drop upload), RunDetailPage (progress tracking), RunsTable (history)
   - Integrated run trigger and navigation into processor detail page
   - Implemented prompt caching (90% cost reduction) and retry logic
   - Added Storage policies for documents bucket access
   - End-to-end testing with 7-operation processor validated all features
   - *Completed on: 2025-10-14*

## Success Criteria

The database design successfully enables:
1. ✅ Multiple organizations to independently manage documents and processors
2. ✅ Reusable analysis templates across multiple documents
3. ✅ Complete audit trail of all analysis activities via immutable snapshots
4. ✅ Secure, isolated data access per organization via RLS
5. ✅ Direct database access via PostgREST (no custom APIs needed)
6. ✅ Real-time progress tracking during execution
7. ✅ Scalable execution via chunked background processing
8. ✅ Cost-effective LLM operations via prompt caching

## Implementation Status

**MVP Complete** ✅ (as of 2025-10-14)

All core functionality has been implemented and tested:
- Database schema with immutable snapshots
- Edge Function orchestration with chunking
- Real-time UI with live progress updates
- Comprehensive error handling and retry logic
- End-to-end testing validated with 7-operation processor

## Related Documentation

For detailed implementation architecture, see:
- **[Manual Processor Execution Architecture](../architecture/manual-processor-execution.md)** - Complete Phase 1.8 implementation details including:
  - Edge Function architecture with chunked execution
  - Database schema and functions
  - UI component hierarchy
  - Real-time update flow
  - Error handling strategies
  - Performance optimization
  - Testing approach
  - Future enhancement roadmap (566 lines, 2,823 total production code)

---

**Document History**:
- **Version 0.1** (2025-09-28): Initial database design proposal
- **Version 0.2** (2025-10-15): Updated with Phase 1.8 implementation details, actual schemas, and Edge Function architecture

*This design leverages Supabase's platform capabilities to minimize custom code while providing a robust foundation for the document intelligence system.*