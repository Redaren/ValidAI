# Manual Processor Execution Architecture

**Phase 1.8 Implementation**
**Status:** ✅ Complete
**Version:** 1.0.0
**Last Updated:** 2025-10-14

## Table of Contents

- [Overview](#overview)
- [Architecture Decisions](#architecture-decisions)
- [System Architecture](#system-architecture)
- [Database Schema](#database-schema)
- [Edge Function Architecture](#edge-function-architecture)
- [UI Architecture](#ui-architecture)
- [Real-time Updates](#real-time-updates)
- [Error Handling](#error-handling)
- [Performance & Scalability](#performance--scalability)
- [Security Considerations](#security-considerations)
- [Testing Strategy](#testing-strategy)
- [Future Enhancements](#future-enhancements)

## Overview

### Purpose

Manual Processor Execution enables users to run a processor end-to-end on a document from the UI, executing all operations sequentially and storing results in the database. This feature provides:

- **Manual validation** of processor configurations before publishing
- **Historical job tracking** with complete audit trail
- **Real-time progress monitoring** during execution
- **Detailed result analysis** with structured outputs
- **Foundation for automated execution** (webhooks, scheduled runs)

### Key Features

- ✅ One-click processor execution from UI
- ✅ Document selection and validation
- ✅ Chunked background processing (avoids timeouts)
- ✅ Real-time progress updates via WebSockets
- ✅ Snapshot-based immutability (decouples runs from processor changes)
- ✅ Continue-on-failure strategy (partial results)
- ✅ Prompt caching for cost optimization
- ✅ Comprehensive error tracking and retry logic
- ✅ Run history with searchable results

## Architecture Decisions

### A. Edge Function Strategy

**Decision:** Create new `execute-processor-run` Edge Function

**Rationale:**
- Workbench has different execution model (stateful conversations, test mode)
- Production runs require different guarantees (immutability, audit trail, retries)
- Separation of concerns enables independent evolution
- Shared LLM utilities extracted for code reuse

**Alternatives Considered:**
- ❌ Extend workbench function - Too much coupling, different use cases
- ❌ API Route - Cannot leverage Supabase service-role, adds unnecessary layer

### B. Execution Model: Async with Chunking

**Decision:** Self-invoking Edge Function with 10 operations per chunk

**Rationale:**
- Edge Functions have 25-minute timeout limit
- 100 operations × 30s avg = 50 minutes (exceeds limit)
- Chunking enables processing of unlimited operations
- Self-invocation pattern is fault-tolerant (each chunk independent)
- User can navigate away immediately (non-blocking)

**Implementation:**
```typescript
// Initial invocation: Create run, return 202 immediately
// Background invocation: Process 10 ops, self-invoke for next chunk
const CHUNK_SIZE = 10

if (hasMoreOperations) {
  fetch(`${url}/execute-processor-run`, {
    body: { run_id, start_index: start_index + CHUNK_SIZE, background: true }
  })
}
```

**Alternatives Considered:**
- ❌ Synchronous execution - Timeouts inevitable for large processors
- ❌ Queue-based (BullMQ, etc.) - Adds infrastructure complexity, not needed

### C. Scope: MVP Includes All UI Pages

**Decision:** Implement trigger, detail page, and list page in single phase

**Rationale:**
- Features are tightly coupled (users expect to see results after triggering)
- Real-time progress critical for good UX (users won't wait blind)
- List page enables discovery of previous runs
- Total effort similar whether done incrementally or together

### D. Database Schema: Snapshot-Based Immutability

**Decision:** Store frozen processor state in `runs.snapshot` JSONB column

**Rationale:**
- **Decouples runs from processor mutations** - User can change processor while run executes
- **Enables true auditing** - Exact state of processor at run time is preserved
- **Supports processor deletion** - Runs remain queryable even if processor deleted
- **Simplifies queries** - All data for run in single record (no joins needed)

**Schema:**
```sql
CREATE TABLE runs (
  id uuid PRIMARY KEY,
  processor_id uuid REFERENCES processors(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL,
  snapshot jsonb NOT NULL, -- { processor, operations[], document }
  status text NOT NULL,
  total_operations integer,
  completed_operations integer,
  failed_operations integer,
  started_at timestamptz,
  completed_at timestamptz
);
```

**Alternatives Considered:**
- ❌ Reference processor/operations directly - Race conditions, deleted data issues
- ❌ Copy to separate tables - More complex, harder to query

### E. Settings Configuration

**Decision:** Use existing 3-tier LLM configuration system

**Rationale:**
- Already implemented and tested
- Processor-level defaults work for production runs
- Settings frozen in snapshot at run creation time
- No need for run-specific overrides (user can test in workbench first)

**Hierarchy:**
1. Global defaults (from `llm_global_settings`)
2. Organization config (from `organizations.llm_configuration`)
3. Processor override (from `processors.configuration.settings_override`)

### F. Error Handling: Continue on Failure

**Decision:** Mark failed operations, continue to next operation

**Rationale:**
- Partial results are valuable (e.g., 95/100 operations succeeded)
- User can identify and fix failing operations
- Retry logic handles transient failures (rate limits, timeouts)
- Run marked "completed" with failure count (not "failed")

**Retry Strategy:**
- Transient errors (429, timeouts, network): Retry 3x with exponential backoff
- Permanent errors (401, 400, validation): Fail immediately
- Max retries: 3 attempts with delays of 1s, 5s, 15s

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User clicks "Run Processor"                                │
│  2. Selects document from dropdown                             │
│  3. Clicks "Start Run"                                         │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION (Initial Invocation)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Fetch processor + operations + document                    │
│  2. Create frozen snapshot (JSONB)                             │
│  3. Insert run record (status: pending)                        │
│  4. Self-invoke for background processing                      │
│  5. Return HTTP 202 with run_id                                │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│            EDGE FUNCTION (Background Invocation)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CHUNK LOOP (10 operations per invocation):                    │
│                                                                 │
│  FOR EACH operation IN chunk:                                  │
│    1. Create operation_result (status: pending)                │
│    2. Download document from storage                           │
│    3. Execute LLM operation with retry                         │
│    4. Update operation_result (completed/failed)               │
│    5. Increment run progress counters                          │
│    6. Continue to next (even if failed)                        │
│                                                                 │
│  IF more operations remain:                                    │
│    Self-invoke with next start_index                           │
│  ELSE:                                                         │
│    Mark run as completed                                       │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE REALTIME                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Database triggers publish changes                          │
│  2. WebSocket pushes updates to browser                        │
│  3. TanStack Query refetches data                              │
│  4. UI updates progress bar, results table                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐   │
│  │ RunProcessorDialog  │  │   Run Detail Page                │   │
│  │ - Document selector │  │   - RunDetailHeader              │   │
│  │ - Trigger button    │  │   - OperationResultsTable        │   │
│  └──────────┬──────────┘  │   - Real-time subscriptions      │   │
│             │              └──────────────────────────────────┘   │
│             │                                                      │
│             │              ┌──────────────────────────────────┐   │
│             │              │   Runs List Page                 │   │
│             │              │   - RunsTable                    │   │
│             │              │   - Status badges                │   │
│             │              └──────────────────────────────────┘   │
│             │                                                      │
│  ┌──────────▼────────────────────────────────────────────────┐   │
│  │         TanStack Query Hooks (app/queries/runs.ts)        │   │
│  │  - useCreateRun()        - useRun()                       │   │
│  │  - useOperationResults() - useProcessorRuns()             │   │
│  └───────────────────────────┬────────────────────────────────┘   │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Backend Platform)                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Edge Function: execute-processor-run                    │    │
│  │  ┌─────────────────────┐  ┌─────────────────────────┐   │    │
│  │  │  Initial Handler    │  │  Background Handler     │   │    │
│  │  │  - Create snapshot  │  │  - Chunked execution    │   │    │
│  │  │  - Return 202       │  │  - Self-invocation      │   │    │
│  │  └─────────────────────┘  └─────────────────────────┘   │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │  Shared: _shared/llm-executor.ts                 │   │    │
│  │  │  - executeLLMOperation()                         │   │    │
│  │  │  - executeLLMOperationWithRetry()                │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL Database                                     │    │
│  │  ┌───────────┐  ┌────────────────────┐                  │    │
│  │  │   runs    │  │ operation_results  │                  │    │
│  │  │  - id     │  │  - id              │                  │    │
│  │  │  - snapshot│  │  - run_id         │                  │    │
│  │  │  - status │  │  - status          │                  │    │
│  │  │  - counters│  │  - response_text  │                  │    │
│  │  └───────────┘  │  - structured_out  │                  │    │
│  │                 │  - tokens_used     │                  │    │
│  │                 └────────────────────┘                  │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │  RLS Policies (organization-scoped access)       │   │    │
│  │  │  Database Functions (increment_run_progress)     │   │    │
│  │  │  Real-time Publication (runs, operation_results) │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Storage (documents bucket)                              │    │
│  │  - Stores uploaded documents                             │    │
│  │  - Accessed by Edge Function during execution            │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Anthropic Claude API                                    │    │
│  │  - Process LLM operations                                │    │
│  │  - Generate structured outputs                           │    │
│  │  - Prompt caching for cost optimization                  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables

#### `runs`

Stores metadata and frozen state for each processor execution.

```sql
CREATE TABLE runs (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References (nullable - allow deletion)
  processor_id uuid REFERENCES processors(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Frozen state (immutable snapshot)
  snapshot jsonb NOT NULL, -- { processor, operations[], document }

  -- Execution metadata
  status text NOT NULL DEFAULT 'pending', -- pending|processing|completed|failed|cancelled
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type text NOT NULL DEFAULT 'manual', -- manual|webhook|scheduled|external

  -- Progress tracking
  total_operations integer NOT NULL DEFAULT 0,
  completed_operations integer NOT NULL DEFAULT 0,
  failed_operations integer NOT NULL DEFAULT 0,

  -- Error tracking
  error_message text,

  -- Timestamps
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX idx_runs_processor ON runs(processor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_runs_organization ON runs(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_runs_status ON runs(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_runs_started ON runs(started_at DESC) WHERE deleted_at IS NULL;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE runs;
```

**Snapshot Structure:**
```typescript
interface RunSnapshot {
  processor: {
    id: string
    name: string
    system_prompt: string | null
    configuration: {
      selected_model_id?: string
      settings_override?: ProcessorSettings
    } | null
  }
  operations: Array<{
    id: string
    name: string
    operation_type: OperationType
    prompt: string
    position: number
    area: string
    configuration: Record<string, any> | null
    output_schema: Record<string, any> | null
  }>
  document: {
    id: string
    name: string
    size_bytes: number
    mime_type: string
    storage_path: string
  }
}
```

#### `operation_results`

Stores individual operation execution results.

```sql
CREATE TABLE operation_results (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  run_id uuid REFERENCES runs(id) ON DELETE CASCADE NOT NULL,
  operation_id uuid REFERENCES operations(id) ON DELETE SET NULL,

  -- Operation snapshot (for self-contained querying)
  operation_snapshot jsonb NOT NULL,
  execution_order integer NOT NULL,

  -- Execution status
  status text NOT NULL DEFAULT 'pending', -- pending|completed|failed

  -- LLM response
  response_text text,
  structured_output jsonb,
  thinking_blocks jsonb, -- Array of thinking blocks

  -- Execution metadata
  model_used text,
  tokens_used jsonb, -- { input, output, cached_read, cached_write }
  execution_time_ms integer,
  cache_hit boolean DEFAULT false,

  -- Error tracking
  error_message text,
  error_type text,
  retry_count integer DEFAULT 0,

  -- Timestamps
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- Indexes
CREATE INDEX idx_operation_results_run ON operation_results(run_id, execution_order);
CREATE INDEX idx_operation_results_status ON operation_results(status);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE operation_results;
```

### Database Functions

#### `increment_run_progress()`

Atomically updates run progress counters.

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

#### `get_llm_config_for_run()` (Updated)

Resolves LLM configuration using processor's organization_id instead of user JWT.

```sql
CREATE OR REPLACE FUNCTION get_llm_config_for_run(
  p_processor_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_proc_config jsonb;
  -- ... other variables
BEGIN
  -- Get organization ID from processor (not JWT)
  IF p_processor_id IS NOT NULL THEN
    SELECT p.organization_id, p.configuration
    INTO v_org_id, v_proc_config
    FROM processors p
    WHERE p.id = p_processor_id;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Processor not found or has no organization';
    END IF;
  ELSE
    -- Fallback to JWT for non-background calls
    v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
  END IF;

  -- ... rest of configuration resolution logic
END;
$$;
```

### RLS Policies

All tables have organization-scoped RLS policies:

```sql
-- runs: Users can only access runs in their organization
CREATE POLICY "runs_select" ON runs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "runs_insert" ON runs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- operation_results: Access via parent run's organization
CREATE POLICY "operation_results_select" ON operation_results
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM runs
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );
```

## Edge Function Architecture

### File Structure

```
supabase/functions/
├── execute-processor-run/
│   └── index.ts           # Main orchestration (566 lines)
└── _shared/
    ├── types.ts           # Common type definitions
    └── llm-executor.ts    # Reusable LLM execution logic
```

### Main Handler

```typescript
// execute-processor-run/index.ts

serve(async (req) => {
  const body = await req.json()

  // Branch: Initial vs Background invocation
  const isBackground = 'background' in body && body.background === true

  if (!isBackground) {
    // ===== INITIAL INVOCATION =====
    // 1. Fetch processor, operations, document
    // 2. Create frozen snapshot
    // 3. Insert run record (status: pending)
    // 4. Self-invoke for background processing
    // 5. Return HTTP 202 with run_id

    return new Response(
      JSON.stringify({ run_id, status: 'pending', message: 'Run created' }),
      { status: 202 }
    )
  } else {
    // ===== BACKGROUND INVOCATION =====
    // 1. Fetch run with snapshot
    // 2. Update status to processing (first chunk)
    // 3. Resolve LLM config and API key
    // 4. Process chunk of operations (CHUNK_SIZE = 10)
    // 5. Self-invoke for next chunk OR mark completed

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    )
  }
})
```

### Chunked Execution Loop

```typescript
const CHUNK_SIZE = 10
const start_index = backgroundBody.start_index || 0
const operations = snapshot.operations
const chunk = operations.slice(start_index, start_index + CHUNK_SIZE)

// Process chunk
for (const [chunkIndex, operation] of chunk.entries()) {
  const operationIndex = start_index + chunkIndex

  try {
    // Create operation_result (status: pending)
    const { data: result } = await supabase
      .from('operation_results')
      .insert({
        run_id: run.id,
        operation_id: operation.id,
        operation_snapshot: operation,
        execution_order: operationIndex,
        status: 'pending'
      })
      .select()
      .single()

    // Execute with retry logic
    const llmResult = await executeLLMOperationWithRetry({
      operation,
      document: snapshot.document,
      systemPrompt: snapshot.processor.system_prompt,
      settings: resolvedSettings,
      apiKey: apiKey,
      enableCache: operationIndex === 0 // First op creates cache
    }, supabase)

    // Update operation_result (completed)
    await supabase
      .from('operation_results')
      .update({
        status: 'completed',
        response_text: llmResult.response,
        structured_output: llmResult.structured_output,
        thinking_blocks: llmResult.thinking_blocks,
        model_used: llmResult.model,
        tokens_used: llmResult.tokens,
        execution_time_ms: llmResult.executionTime,
        cache_hit: llmResult.cacheHit,
        completed_at: new Date().toISOString()
      })
      .eq('id', result.id)

    // Increment progress
    await supabase.rpc('increment_run_progress', {
      p_run_id: run.id,
      p_status: 'completed'
    })

  } catch (error) {
    // Mark operation as failed but CONTINUE
    await supabase
      .from('operation_results')
      .update({
        status: 'failed',
        error_message: error.message,
        error_type: error.name,
        retry_count: error.retryCount || 0,
        completed_at: new Date().toISOString()
      })
      .eq('id', result.id)

    await supabase.rpc('increment_run_progress', {
      p_run_id: run.id,
      p_status: 'failed'
    })

    console.error(`Operation ${operationIndex} failed:`, error)
    // Continue to next operation
  }
}

// Check if more operations remain
const hasMoreOperations = start_index + CHUNK_SIZE < operations.length

if (hasMoreOperations) {
  // Self-invoke for next chunk
  fetch(`${supabaseUrl}/functions/v1/execute-processor-run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      run_id: run.id,
      start_index: start_index + CHUNK_SIZE,
      background: true
    })
  })
} else {
  // All operations processed - mark run as completed
  await supabase
    .from('runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', run.id)
}
```

### Shared LLM Executor

```typescript
// _shared/llm-executor.ts

export async function executeLLMOperation(
  params: LLMExecutionParams,
  supabase: any
): Promise<LLMExecutionResult> {
  const { operation, document, systemPrompt, settings, apiKey, enableCache } = params

  // 1. Download document from storage
  const { data: fileData } = await supabase.storage
    .from('documents')
    .download(document.storage_path)

  const fileBuffer = await fileData.arrayBuffer()
  const base64Data = Buffer.from(fileBuffer).toString('base64')

  // 2. Build messages with separate file message (for caching)
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: document.mime_type,
            data: base64Data
          },
          cache_control: enableCache ? { type: 'ephemeral' } : undefined
        }
      ]
    },
    {
      role: 'user',
      content: operation.prompt
    }
  ]

  // 3. Build output config based on operation type
  const outputConfig = getOutputConfig(operation)

  // 4. Execute via Vercel AI SDK
  const { text, experimental_output, usage } = await generateText({
    model: anthropic(settings.model),
    system: systemPrompt || undefined,
    messages,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    experimental_output: outputConfig
  })

  // 5. Return comprehensive result
  return {
    response: text,
    structured_output: experimental_output,
    thinking_blocks: null, // Extracted if thinking enabled
    model: settings.model,
    tokens: {
      input: usage.promptTokens,
      output: usage.completionTokens,
      cached_read: usage.cacheReadTokens || 0,
      cached_write: usage.cacheCreationTokens || 0
    },
    executionTime: Date.now() - startTime,
    cacheHit: (usage.cacheReadTokens || 0) > 0
  }
}

export async function executeLLMOperationWithRetry(
  params: LLMExecutionParams,
  supabase: any,
  maxRetries: number = 3,
  backoffMs: number[] = [1000, 5000, 15000]
): Promise<LLMExecutionResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperation(params, supabase)
    } catch (error) {
      const isTransient =
        error.status === 429 || // Rate limit
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET'

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        await sleep(backoffMs[attempt])
        continue
      }

      // Permanent error or final attempt
      error.retryCount = attempt
      throw error
    }
  }
}
```

### Prompt Caching Strategy

**First Operation (creates cache):**
```typescript
enableCache: operationIndex === 0 ? true : false
```

- Document file message gets `cache_control: { type: 'ephemeral' }`
- Anthropic caches the document embedding
- Cost: +25% for first operation (one-time)

**Subsequent Operations (hit cache):**
- Same document in file message triggers cache hit
- Cost: -90% for cached tokens
- Massive savings for multi-operation runs

**Example Cost Comparison:**
```
Without caching (100 operations):
  100 ops × $0.015 input tokens = $1.50

With caching (100 operations):
  Op 1:  $0.015 × 1.25 = $0.01875 (create cache)
  Op 2-100: $0.015 × 0.10 × 99 = $0.14850 (cache hits)
  Total: $0.16725

Savings: 89% ($1.33 saved)
```

## UI Architecture

### Component Hierarchy

```
ProcessorDetailClient (processor detail page)
  └── DropdownMenu
      ├── RunProcessorDialog ──────────┐
      │   ├── Select (document)        │
      │   └── Button (Start Run)       │
      │                                 │
      └── Link (View Runs) ─────┐      │
                                 │      │
                                 ▼      ▼
ProcessorRunsPage ◄──────────────┘      │
  └── RunsTable                         │
      └── TableRow (click) ─────┐       │
                                 │       │
                                 ▼       ▼
RunDetailPage ◄──────────────────┴───────┘
  ├── RunDetailHeader
  │   ├── Status badge
  │   ├── Progress bar
  │   └── Metadata grid
  └── OperationResultsTable
      └── TableRow (expandable)
          ├── Collapsed: Status, time, tokens
          └── Expanded: Full response, structured output, thinking
```

### State Management

**TanStack Query** for server state:
```typescript
// app/queries/runs.ts

export function useRun(runId: string) {
  const supabase = createTypedClient()
  const queryClient = useQueryClient()

  // Fetch query
  const query = useQuery({
    queryKey: ['run', runId],
    queryFn: async () => {
      const { data } = await supabase
        .from('runs')
        .select('*')
        .eq('id', runId)
        .single()
      return data
    }
  })

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`run:${runId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'runs',
        filter: `id=eq.${runId}`
      }, () => {
        queryClient.invalidateQueries(['run', runId])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [runId])

  return query
}
```

### Key Hooks

| Hook | Purpose | Real-time |
|------|---------|-----------|
| `useCreateRun()` | Invoke Edge Function | ❌ |
| `useRun(runId)` | Fetch single run | ✅ |
| `useOperationResults(runId)` | Fetch operation results | ✅ |
| `useProcessorRuns(processorId)` | List all runs | ❌ |
| `useDocuments()` | Fetch documents | ❌ |

### Page Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/proc/[id]` | ProcessorDetailClient | Processor detail with Run menu |
| `/proc/[id]/runs` | ProcessorRunsPage | List all runs for processor |
| `/proc/[id]/runs/[run_id]` | RunDetailPage | Run detail with live updates |

## Real-time Updates

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Component mounts                                        │
│  2. useRun(runId) hook executes                            │
│  3. Initial data fetch via PostgREST                       │
│  4. WebSocket subscription created                          │
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │  useEffect(() => {                                │     │
│  │    const channel = supabase                        │     │
│  │      .channel(`run:${runId}`)                      │     │
│  │      .on('postgres_changes', {                     │     │
│  │        event: 'UPDATE',                            │     │
│  │        table: 'runs',                              │     │
│  │        filter: `id=eq.${runId}`                    │     │
│  │      }, () => {                                    │     │
│  │        queryClient.invalidateQueries(['run'])      │     │
│  │      })                                            │     │
│  │      .subscribe()                                  │     │
│  │  }, [runId])                                       │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              SUPABASE REALTIME SERVER                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Listens to PostgreSQL replication stream               │
│  2. Filters changes matching subscriptions                  │
│  3. Pushes updates to connected clients                     │
│                                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Replication
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  POSTGRESQL                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Edge Function updates runs table                        │
│  2. Database trigger fires                                  │
│  3. Change published to replication slot                    │
│                                                             │
│  UPDATE runs SET                                            │
│    completed_operations = completed_operations + 1,         │
│    status = 'processing'                                    │
│  WHERE id = 'uuid';                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Update Flow

1. **Edge Function updates database**
   ```typescript
   await supabase.rpc('increment_run_progress', { p_run_id, p_status: 'completed' })
   ```

2. **PostgreSQL publishes change**
   - Replication slot captures UPDATE
   - Change forwarded to Realtime server

3. **Realtime server broadcasts**
   - Filters subscribers by table/filter
   - Pushes event to matching WebSocket connections

4. **Browser receives event**
   - WebSocket callback fires
   - TanStack Query invalidation triggered

5. **UI refetches and updates**
   - Query refetches from PostgREST
   - Component re-renders with new data
   - Progress bar animates to new percentage

### Performance Optimizations

- **Debouncing:** TanStack Query deduplicates rapid invalidations
- **Selective subscriptions:** Only subscribe to active run (not all runs)
- **Channel cleanup:** Unsubscribe on component unmount
- **Optimistic updates:** Not used (server is source of truth)

## Error Handling

### Error Categories

| Category | Examples | Strategy | Retry |
|----------|----------|----------|-------|
| **Transient** | 429 Rate limit, Network timeout, ECONNRESET | Retry with exponential backoff | 3 attempts |
| **Permanent** | 401 Auth failed, 400 Invalid request, 403 Forbidden | Fail immediately, log error | 0 attempts |
| **Validation** | Missing document, Invalid prompt, Schema mismatch | Fail immediately, user-facing error | 0 attempts |

### Retry Logic

```typescript
async function executeLLMOperationWithRetry(params, maxRetries = 3) {
  const backoffMs = [1000, 5000, 15000]

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperation(params)
    } catch (error) {
      const isTransient =
        error.status === 429 ||
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET'

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        console.warn(`Retry ${attempt + 1}/${maxRetries} after ${backoffMs[attempt]}ms`)
        await sleep(backoffMs[attempt])
        continue
      }

      // Permanent error or final attempt failed
      error.retryCount = attempt
      throw error
    }
  }
}
```

### Error Tracking

All errors stored in database for auditing:

```sql
-- In operation_results table
error_message text,        -- Human-readable error
error_type text,           -- Error class (TimeoutError, etc.)
retry_count integer,       -- Number of retry attempts
```

### User-Facing Errors

**Toast Notifications:**
```typescript
// Run creation failure
toast.error('Failed to start processor run', {
  description: error.message
})

// Run success
toast.success('Processor run started', {
  description: 'Processing in background. Monitor progress on run detail page.'
})
```

**Error UI in Run Detail:**
```tsx
{run.error_message && (
  <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
    <p className="font-medium text-destructive">Error</p>
    <p className="text-sm">{run.error_message}</p>
  </div>
)}
```

**Error UI in Operation Results:**
```tsx
{result.error_message && (
  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
    <p className="font-medium">Error {result.error_type && `(${result.error_type})`}</p>
    <p className="text-sm">{result.error_message}</p>
    {result.retry_count > 0 && (
      <p className="text-xs text-muted-foreground">
        Retried {result.retry_count} time(s)
      </p>
    )}
  </div>
)}
```

### Continue-on-Failure

When an operation fails:
1. Error is logged to `operation_results`
2. `runs.failed_operations` counter incremented
3. **Execution continues to next operation**
4. Run marked "completed" (not "failed") with partial results

**Rationale:**
- Partial results are valuable (e.g., 99/100 succeeded)
- User can identify and fix specific failing operation
- Avoids all-or-nothing brittleness

## Performance & Scalability

### Throughput Analysis

**Single Run Performance:**
- Average operation time: 5.4 seconds (from test run)
- Chunk size: 10 operations
- Chunk processing time: ~54 seconds
- Self-invocation overhead: ~1 second
- **100 operations:** ~550 seconds (~9 minutes)

**Concurrent Runs:**
- Each run is independent (no shared state)
- Limited only by:
  - Anthropic API rate limits (organization-level)
  - Supabase Edge Function concurrency limits
  - PostgreSQL connection pool

**Recommended Limits:**
- Max concurrent runs per organization: 10
- Max operations per run: 1000
- Chunk size: 10 operations (tunable)

### Cost Optimization

**Prompt Caching:**
- First operation: +25% cost (create cache)
- Subsequent operations: -90% cost (cache hit)
- **Overall savings: ~89% for 100-operation run**

**Token Usage Tracking:**
```typescript
tokens_used: {
  input: 617,
  output: 155,
  cached_read: 0,      // Increases after first op
  cached_write: 617    // Only on first op
}
```

**Cost Calculation Example:**
```
Input tokens (cached): $0.003 / 1K
Input tokens (non-cached): $0.015 / 1K
Output tokens: $0.075 / 1K

Operation 1 (creates cache):
  Input: 617 tokens × $0.015 = $0.009255
  Cache write: 617 tokens × $0.003 = $0.001851
  Output: 155 tokens × $0.075 = $0.011625
  Total: $0.022731

Operation 2-100 (cache hits):
  Input: 617 tokens × $0.003 = $0.001851 (cached)
  Output: 155 tokens × $0.075 = $0.011625
  Total per op: $0.013476
  Total for 99 ops: $1.334124

Full run total: $1.357
Without caching: $10.50
Savings: 87%
```

### Database Indexing

Critical indexes for performance:

```sql
-- Fast lookup by processor (runs list page)
CREATE INDEX idx_runs_processor ON runs(processor_id)
WHERE deleted_at IS NULL;

-- Fast lookup by organization (RLS filtering)
CREATE INDEX idx_runs_organization ON runs(organization_id)
WHERE deleted_at IS NULL;

-- Fast sorting by start time (newest first)
CREATE INDEX idx_runs_started ON runs(started_at DESC)
WHERE deleted_at IS NULL;

-- Fast operation results lookup
CREATE INDEX idx_operation_results_run ON operation_results(run_id, execution_order);
```

### Query Performance

**Runs List (with 1000 runs):**
```sql
EXPLAIN ANALYZE
SELECT * FROM runs
WHERE processor_id = 'uuid'
  AND deleted_at IS NULL
ORDER BY started_at DESC
LIMIT 20;

-- Uses: idx_runs_processor + idx_runs_started
-- Cost: ~0.5ms (index scan)
```

**Run Detail (with snapshot):**
```sql
EXPLAIN ANALYZE
SELECT * FROM runs WHERE id = 'uuid';

-- Uses: Primary key
-- Cost: ~0.1ms (single row lookup)
```

**Operation Results (100 operations):**
```sql
EXPLAIN ANALYZE
SELECT * FROM operation_results
WHERE run_id = 'uuid'
ORDER BY execution_order;

-- Uses: idx_operation_results_run
-- Cost: ~1ms (index scan + sort)
```

### Scalability Limits

| Component | Current Limit | Bottleneck | Mitigation |
|-----------|---------------|------------|------------|
| **Edge Function** | 25 min timeout | Anthropic API speed | Chunking ✅ |
| **Database Connections** | ~200 | Supabase plan | Connection pooling |
| **Realtime Subscriptions** | ~1000 concurrent | Supabase plan | Upgrade if needed |
| **Storage Bandwidth** | ~50 GB/month | Supabase plan | CDN for large files |
| **Anthropic Rate Limits** | Org-level | API tier | Queue system (future) |

## Security Considerations

### Authentication & Authorization

**Edge Function:**
- Initial invocation: Requires valid user JWT (via Authorization header)
- Background invocation: Service-role key (self-invocation only)
- Service-role bypass: Checks `authHeader?.includes(serviceRoleKey)`

**Database:**
- All tables protected by RLS policies
- Organization-scoped access (users can't see other orgs' runs)
- Service-role can bypass RLS (for Edge Function background processing)

### Data Access Control

**RLS Policy Example:**
```sql
CREATE POLICY "runs_select" ON runs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
```

**Effect:**
- Users can only SELECT runs from their organization
- Enforced at database level (not application level)
- Cannot be bypassed by malicious frontend code

### Snapshot Security

**Concern:** Snapshots contain sensitive data (prompts, configurations)

**Mitigation:**
- Snapshots stored as JSONB (structured, validated)
- RLS policies prevent unauthorized access
- Soft delete (deleted_at) preserves audit trail
- No PII in snapshots (only references to documents)

### API Key Security

**Storage:**
- Organization API keys encrypted at rest
- Encrypted using `pgcrypto` extension
- Decrypted in database function (not client-side)

**Edge Function:**
```typescript
// Decrypt API key securely
const { data: apiKey } = await supabase.rpc('decrypt_api_key', {
  p_ciphertext: llmConfig.api_key_encrypted,
  p_org_id: llmConfig.organization_id
})
```

**Never exposed to client:**
- API key never sent to browser
- Only used in Edge Function (server-side)
- Service-role credentials in environment variables

### Input Validation

**Document Selection:**
- Documents filtered by organization (RLS)
- File size limits enforced at upload time
- MIME type validation

**Processor Selection:**
- Processor must belong to user's organization
- Operations frozen in snapshot (no injection risk)
- Prompts sanitized during processor creation

### Rate Limiting

**Current:** No explicit rate limiting (relies on Anthropic API limits)

**Future Enhancements:**
- Rate limit runs per organization (e.g., 100/day)
- Rate limit concurrent runs (e.g., 10 simultaneous)
- Implement in Edge Function or database trigger

## Testing Strategy

### Unit Tests

**Database Functions:**
```sql
-- Test increment_run_progress
BEGIN;
  INSERT INTO runs (id, total_operations, completed_operations, failed_operations)
  VALUES ('test-id', 10, 0, 0);

  SELECT increment_run_progress('test-id', 'completed');

  SELECT completed_operations FROM runs WHERE id = 'test-id';
  -- Expected: 1
ROLLBACK;
```

**LLM Executor:**
```typescript
describe('executeLLMOperationWithRetry', () => {
  it('retries on transient errors', async () => {
    const mockExecute = vi.fn()
      .mockRejectedValueOnce({ status: 429 }) // Retry 1
      .mockRejectedValueOnce({ status: 429 }) // Retry 2
      .mockResolvedValueOnce({ response: 'success' }) // Success

    const result = await executeLLMOperationWithRetry(params)

    expect(mockExecute).toHaveBeenCalledTimes(3)
    expect(result.response).toBe('success')
  })

  it('fails immediately on permanent errors', async () => {
    const mockExecute = vi.fn()
      .mockRejectedValueOnce({ status: 401 })

    await expect(executeLLMOperationWithRetry(params)).rejects.toThrow()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })
})
```

### Integration Tests

**End-to-End Run:**
```typescript
describe('Processor Run', () => {
  it('executes all operations and stores results', async () => {
    // 1. Create test processor with 3 operations
    const processor = await createTestProcessor()

    // 2. Upload test document
    const document = await uploadTestDocument()

    // 3. Trigger run
    const { run_id } = await supabase.functions.invoke('execute-processor-run', {
      body: { processor_id: processor.id, document_id: document.id }
    })

    // 4. Wait for completion (poll or subscribe)
    await waitForRunCompletion(run_id, { timeout: 60000 })

    // 5. Verify results
    const { data: run } = await supabase
      .from('runs')
      .select('*')
      .eq('id', run_id)
      .single()

    expect(run.status).toBe('completed')
    expect(run.completed_operations).toBe(3)
    expect(run.failed_operations).toBe(0)

    const { data: results } = await supabase
      .from('operation_results')
      .select('*')
      .eq('run_id', run_id)

    expect(results).toHaveLength(3)
    expect(results.every(r => r.status === 'completed')).toBe(true)
  })
})
```

### Manual Testing

**Test Execution (Performed):**
```bash
# Test run with 7 operations
Run ID: 03bfbf46-c1a4-413d-af8c-f2d7d474c72d
Status: completed
Total operations: 7
Completed: 7
Failed: 0
Duration: ~38 seconds

# Verified:
✅ All operation types work (extraction, rating, validation, analysis, generic)
✅ Structured outputs extracted correctly
✅ Token usage tracked
✅ Cache hits working (after first operation)
✅ Real-time updates functioning
✅ Progress bar animating correctly
✅ Expandable rows showing full details
```

### Performance Tests

**Load Test (Future):**
```typescript
// Simulate 10 concurrent runs
const runs = await Promise.all(
  Array.from({ length: 10 }, () =>
    createRun({ processor_id, document_id })
  )
)

// Verify all complete successfully
for (const run of runs) {
  await waitForCompletion(run.run_id)
}

// Check database load
// Check Anthropic API rate limits
// Measure total execution time
```

## Future Enhancements

### Phase 2: Scheduled Runs

**Trigger:** Cron-based scheduling

**Implementation:**
- Add `schedule` field to processors (cron expression)
- Create `pg_cron` extension
- Schedule Edge Function invocations
- Track scheduled vs manual runs

### Phase 3: Webhook Triggers

**Trigger:** External HTTP webhooks

**Implementation:**
- Create webhook Edge Function endpoint
- Validate webhook signatures
- Accept document via URL or inline
- Return run_id immediately (async processing)

**Use Cases:**
- Process documents uploaded to external systems
- Integrate with CRMs, storage providers
- Automate document workflows

### Phase 4: Batch Processing

**Trigger:** Upload multiple documents

**Implementation:**
- UI for multi-document selection
- Create parent "batch" record
- Create multiple runs (one per document)
- Aggregate results view

**Use Cases:**
- Process folder of contracts
- Bulk document analysis
- Mass data extraction

### Phase 5: Run Comparison

**Feature:** Compare results across runs

**Implementation:**
- UI for selecting 2+ runs
- Side-by-side diff view
- Highlight changed outputs
- Track performance deltas

**Use Cases:**
- A/B test processor changes
- Validate prompt improvements
- Regression testing

### Phase 6: Export & Reporting

**Feature:** Export run results

**Formats:**
- CSV (tabular operation results)
- JSON (full structured outputs)
- PDF (formatted report)
- Excel (with charts)

**Implementation:**
- Export Edge Function
- Template system for PDF/Excel
- Async generation for large exports

### Phase 7: Run Analytics

**Metrics:**
- Average execution time per operation type
- Token usage trends
- Cache hit rates
- Error rate analysis
- Cost per run tracking

**Implementation:**
- Materialized views for aggregations
- Charting library (Recharts)
- Analytics dashboard page

### Phase 8: Approval Workflows

**Feature:** Require approval before publishing results

**Implementation:**
- Add `approval_status` to runs
- Notification system for approvers
- Comments/feedback on results
- Track approval history

**Use Cases:**
- Legal document review
- Compliance checking
- Quality assurance

## Appendix

### File Inventory

**Database:**
- Migration: `create_runs_and_operation_results.sql` (150 lines)
- Migration: `fix_get_llm_config_for_run_null_user.sql` (120 lines)
- Types: `lib/database.types.ts` (auto-generated)

**Edge Functions:**
- Handler: `supabase/functions/execute-processor-run/index.ts` (566 lines)
- Shared Types: `supabase/functions/_shared/types.ts` (150 lines)
- Shared Executor: `supabase/functions/_shared/llm-executor.ts` (250 lines)

**UI Components:**
- Dialog: `components/processors/run-processor-dialog.tsx` (220 lines)
- Header: `components/runs/run-detail-header.tsx` (195 lines)
- Table: `components/runs/operation-results-table.tsx` (367 lines)
- List: `components/runs/runs-table.tsx` (256 lines)

**UI Pages:**
- Detail: `app/proc/[id]/runs/[run_id]/page.tsx` (144 lines)
- List: `app/proc/[id]/runs/page.tsx` (116 lines)

**Query Hooks:**
- Runs: `app/queries/runs.ts` (240 lines)
- Documents: `app/queries/documents.ts` (49 lines)

**Modified:**
- Processor Detail: `app/proc/[id]/processor-detail-client.tsx` (2 menu items added)

**Total:** ~2,823 lines of production code

### References

- **LLM Configuration:** [llm-provider-configuration.md](./llm-provider-configuration.md)
- **Implementation Plan:** [Phase_1.8_Manual_Processor_Execution_Implementation_Plan.md](../planning/Phase_1.8_Manual_Processor_Execution_Implementation_Plan.md)
- **Supabase Docs:** https://supabase.com/docs
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **Anthropic API:** https://docs.anthropic.com/claude/reference

### Glossary

| Term | Definition |
|------|------------|
| **Run** | A single execution of a processor on a document |
| **Snapshot** | Frozen state of processor at run creation time |
| **Operation Result** | Output from executing one operation in a run |
| **Chunking** | Processing operations in batches to avoid timeouts |
| **Self-invocation** | Edge Function calling itself for next chunk |
| **Prompt Caching** | Anthropic feature to reduce cost of repeated context |
| **RLS** | Row-Level Security (Postgres feature for authorization) |
| **PostgREST** | Automatic REST API from Postgres schema |
| **Real-time** | Supabase WebSocket service for live updates |

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-14
**Author:** Claude (Anthropic)
**Status:** ✅ Complete
