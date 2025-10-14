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
**Definition**: An execution instance where a processor is applied to a specific document.

**Purpose**: Tracks the actual analysis event, capturing when a document was processed and what the results were.

**Key Characteristics**:
- Links ONE document to ONE processor
- Immutable record of what happened
- Captures processor configuration at execution time
- Produces operation results

### 5. Operation Result
**Definition**: The outcome from executing a single operation within a run.

**Purpose**: Stores what the AI found when executing each operation, including both raw responses and structured data.

**Key Characteristics**:
- One result per operation per run
- Contains both AI response and parsed values
- Includes execution metadata (tokens, timing)
- Can be evaluated against predefined rules

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
3. User triggers run → creates run record → executes each operation → stores results. User get realtime feedback on the run (leveraging Supabase)
4. Results accessed via PostgREST → transformed in frontend → displayed to user
```

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
**Purpose**: Execution instance linking document to processor

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `organization_id` | uuid (FK) | Yes | Organization context |
| `document_id` | uuid (FK) | Yes | Document being analyzed |
| `processor_id` | uuid (FK) | Yes | Processor template used |
| `processor_snapshot` | jsonb | Yes | Processor state at run time |
| `status` | enum | Yes | Execution status |
| `configuration` | jsonb | No | Run-specific overrides |
| `started_at` | timestamptz | No | Processing start time |
| `completed_at` | timestamptz | No | Processing end time |
| `error_message` | text | No | Error if failed |
| `total_input_tokens` | integer | No | Aggregate input tokens used |
| `total_output_tokens` | integer | No | Aggregate output tokens used |
| `total_llm_cost` | decimal | No | Direct LLM API cost (not customer price) |
| `triggered_by` | uuid (FK) | Yes | User who initiated |
| `created_at` | timestamptz | Yes | Run creation time |

**Status Values**:
- `pending`: Queued for processing
- `processing`: Currently executing
- `completed`: Successfully finished
- `failed`: Error occurred
- `cancelled`: User cancelled

---

#### 📊 `operation_results`
**Purpose**: Store outcomes from each operation execution

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | uuid (PK) | Yes | Unique identifier |
| `run_id` | uuid (FK) | Yes | Parent run |
| `operation_id` | uuid (FK) | Yes | Operation executed |
| `operation_snapshot` | jsonb | Yes | Operation state at run time |
| `status` | enum | Yes | Execution status |
| `raw_response` | text | Yes | Complete LLM response |
| `parsed_value` | jsonb | No | Structured extraction |
| `evaluation_result` | enum | No | Validation outcome |
| `evaluation_details` | jsonb | No | Why passed/failed |
| `citations_enabled` | boolean | No | Whether citations were used in API call |
| `input_tokens_used` | integer | No | Input tokens consumed |
| `output_tokens_used` | integer | No | Output tokens generated |
| `execution_time_ms` | integer | No | Duration in milliseconds |
| `error_message` | text | No | Error if failed |
| `executed_at` | timestamptz | Yes | Execution timestamp |
| `created_at` | timestamptz | Yes | Creation timestamp |

**Status Values**:
- `pending`: Not yet processed
- `processing`: Currently executing
- `success`: Completed successfully
- `failed`: Error occurred
- `skipped`: Skipped due to dependency

**Evaluation Results** (Optional):
- `passed`: Meets criteria
- `failed`: Does not meet criteria
- `warning`: Partially meets criteria
- `not_applicable`: Cannot evaluate

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
```

### Database Functions for Complex Operations
Multi-table operations use database functions:
```sql
-- Create processor with operations
CREATE FUNCTION create_processor_with_operations(
  processor_data jsonb,
  operations_data jsonb[]
) RETURNS TABLE(...)

-- Execute run
CREATE FUNCTION execute_run(
  document_id uuid,
  processor_id uuid
) RETURNS TABLE(...)
```

### Edge Functions (Service-Role Only)
For operations requiring elevated privileges:
- LLM API calls for operation execution
- Batch processing coordination
- Complex run orchestration

## MVP Scope Boundaries

### ✅ In Scope (MVP)
- Document upload and storage
- Processor creation with operations
- Manual run execution
- Basic operation results
- Organization-based isolation
- Simple sequential operation execution

### ❌ Out of Scope (Post-MVP)
- Processor versioning
- External processor publishing (SharePoint embedding, iframe access)
- Automated run triggers
- Complex operation dependencies
- Formatted run reports
- Batch document processing
- Custom LLM model selection
- Webhook notifications
- Email-based report delivery for external users
- API access for external systems

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

5. **Phase 2**: Create execution tables (runs, operation_results)
6. **Phase 3**: Implement RLS policies for execution tables
7. **Phase 4**: Create database functions for run execution
8. **Phase 5**: Enhance Storage integration with direct upload
9. **Phase 6**: Add performance optimizations and monitoring

## Success Criteria

The database design successfully enables:
1. Multiple organizations to independently manage documents and processors
2. Reusable analysis templates across multiple documents
3. Complete audit trail of all analysis activities
4. Secure, isolated data access per organization
5. Direct database access via PostgREST (no custom APIs needed)

## Next Steps

1. Review and approve database design
2. Create migration files for tables
3. Implement RLS policies
4. Create necessary database functions
5. Set up Storage buckets
6. Generate TypeScript types
7. Build frontend components using PostgREST

---

*This design leverages Supabase's platform capabilities to minimize custom code while providing a robust foundation for the document intelligence system.*