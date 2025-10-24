# Phase 1.8: Manual Processor Execution - Implementation Plan

**Date:** 2025-10-14
**Status:** Planning Complete - Ready for Implementation
**Version:** 1.0

---

## Executive Summary

Phase 1.8 enables users to manually execute processors end-to-end on documents. The system will:
- Accept a processor + document selection from UI
- Execute all operations sequentially via Edge Function
- Store results in database with full execution history
- Provide real-time progress tracking via Supabase subscriptions
- Display runs in a table view with detail pages

**Key Innovation:** Snapshot-based immutability ensures runs are decoupled from processor templates, preventing race conditions and preserving audit trails.

---

## Architecture Decisions

### A) Edge Function Strategy ✅

**Decision:** Create NEW Edge Function `execute-processor-run`, extract shared LLM logic

**Components:**
1. **New Edge Function:** `supabase/functions/execute-processor-run/index.ts`
   - Handles run creation and orchestration
   - Self-invoking for background processing
   - Chunked execution to avoid 25-minute timeout

2. **Shared LLM Utility:** `supabase/functions/_shared/llm-executor.ts`
   - Extracted from `execute-workbench-test`
   - Reusable LLM execution logic (Vercel AI SDK integration)
   - Handles message building, caching, response parsing

3. **Workbench Function:** `execute-workbench-test` (unchanged)
   - Continues to use shared utility
   - No breaking changes to existing functionality

**Rationale:**
- Workbench is for interactive testing (user controls)
- Processor runs are for production execution (deterministic settings)
- Shared utility avoids code duplication
- Clean separation of concerns

---

### B) Asynchronous Execution ✅

**Decision:** Self-invoking Edge Function with chunked processing

**Why Async:**
- 100 operations × 30s = 50 minutes (exceeds 25-minute Edge Function limit)
- User shouldn't wait 50 minutes for completion
- LLM rate limits require pacing
- User can navigate away during processing

**Implementation: Hybrid Chunking Approach**

```typescript
// Initial invocation (from UI)
POST /execute-processor-run
  → Creates run record (status: pending)
  → Creates snapshot (frozen processor state)
  → Self-invokes for background processing
  → Returns run_id immediately (HTTP 202)
  → User redirected to run detail page

// Background invocation (self-invoked)
POST /execute-processor-run (background: true)
  → Process 10 operations (chunk)
  → Self-invoke for next chunk
  → Repeat until all operations processed
  → Update run status: completed
```

**Chunking Strategy:**
- **Chunk Size:** 10 operations per invocation
- **Timeout Safety:** 20-minute max per chunk (5-minute buffer)
- **Fault Tolerance:** Each chunk is independent invocation
- **Rate Limiting:** Built-in pacing between chunks

**Benefits:**
- No 25-minute limit (each chunk restarts timeout)
- Resilient to failures (chunk-level isolation)
- Natural rate limiting (delays between chunks)
- Simple to implement (no external queue)

---

### C) Scope - What's In/Out ✅

### ✅ Phase 1.8 MVP Includes

1. **Database Schema**
   - `runs` table with snapshot support
   - `operation_results` table
   - RLS policies for organization-scoped access
   - Real-time publication enabled

2. **Edge Function**
   - `execute-processor-run` with async chunking
   - Shared `llm-executor` utility
   - Snapshot creation and validation
   - Sequential operation execution with caching
   - Error handling with retry logic

3. **UI - Run Trigger**
   - "Run Processor" button on processor detail page
   - Document selector dialog (dropdown)
   - API call to start run
   - Redirect to run detail page

4. **UI - Run Detail Page** `/proc/[id]/runs/[run_id]`
   - Run metadata card (status, progress, duration)
   - Real-time operation results table
   - Expandable rows showing:
     - Prompt sent
     - Response text
     - Structured output (if applicable)
     - Token usage
     - Error details (if failed)
   - Live updates via Supabase subscriptions

5. **UI - Runs List Page** `/proc/[id]/runs`
   - Table of all runs for processor
   - Columns: Status, Document, Started, Duration, Progress, Triggered By
   - Real-time status updates
   - Click row → navigate to detail
   - Standard table features (sort, filter, pagination)

### ❌ Excluded from MVP (Future Phases)

- Retry failed operations (manual retry button)
- Cancel running jobs
- Scheduled/automated runs
- Bulk document processing
- Export results to CSV/PDF
- Advanced result visualization (charts, analytics)
- Run comparison (side-by-side)
- Run detail page tabs (overview, operations, tokens, logs)

---

### D) Database Schema ✅

#### 1. `runs` Table

**Purpose:** Track processor executions with immutable snapshots

```sql
CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References (can be NULL if deleted, but snapshot preserves data)
  processor_id uuid REFERENCES processors(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Immutable snapshot (frozen state at run creation)
  snapshot jsonb NOT NULL,
  -- Structure: {
  --   processor: { id, name, system_prompt, configuration },
  --   operations: [{ id, name, type, prompt, position, area, config, schema }],
  --   document: { id, name, size_bytes, mime_type, storage_path }
  -- }

  -- Status tracking
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type text NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled', 'webhook', 'external_endpoint')),

  -- Progress tracking (denormalized for performance)
  total_operations integer NOT NULL DEFAULT 0,
  completed_operations integer NOT NULL DEFAULT 0,
  failed_operations integer NOT NULL DEFAULT 0,

  -- Error tracking (only set if run itself fails, not individual operations)
  error_message text,

  -- Timestamps
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,

  -- Soft delete
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX idx_runs_processor_id ON runs(processor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_runs_organization_id ON runs(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_runs_status ON runs(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_runs_started_at ON runs(started_at DESC) WHERE deleted_at IS NULL;

-- Snapshot search indexes (for querying within JSONB)
CREATE INDEX idx_runs_snapshot_processor_id ON runs ((snapshot->'processor'->>'id'));
CREATE INDEX idx_runs_snapshot_document_id ON runs ((snapshot->'document'->>'id'));

-- RLS Policy
CREATE POLICY "Users can view runs in their organization"
  ON runs FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert runs in their organization"
  ON runs FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE runs;
```

**Key Design Decisions:**

1. **Snapshot JSONB Column:**
   - Contains complete processor state at run creation
   - Decouples run from processor template mutations
   - Enables exact reproducibility
   - Provides full audit trail

2. **Nullable References:**
   - `processor_id`, `document_id` can be NULL if deleted
   - Snapshot preserves all data needed for execution
   - References kept for UI navigation convenience

3. **Progress Counters:**
   - Denormalized for fast list view queries
   - Avoids JOINs to count operation_results
   - Updated incrementally during execution

4. **Status Semantics:**
   - `pending`: Created, not started
   - `processing`: Actively executing operations
   - `completed`: All operations attempted (some may have failed)
   - `failed`: Run itself crashed (no results)
   - `cancelled`: User cancelled (future feature)

#### 2. `operation_results` Table

**Purpose:** Store individual operation outputs within a run

```sql
CREATE TABLE operation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent run (CASCADE delete when run deleted)
  run_id uuid REFERENCES runs(id) ON DELETE CASCADE NOT NULL,

  -- Reference to original operation (NULL if deleted, but snapshot has data)
  operation_id uuid REFERENCES operations(id) ON DELETE SET NULL,

  -- Operation snapshot (copy of operation from run.snapshot.operations[i])
  -- Enables self-contained querying without JOINs
  operation_snapshot jsonb NOT NULL,
  -- Structure: { id, name, type, prompt, position, area, config, schema }

  -- Execution metadata
  execution_order integer NOT NULL,  -- Position in execution sequence (0-based)

  -- Status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

  -- LLM Results
  response_text text,           -- Raw LLM response
  structured_output jsonb,      -- Parsed structured output (for validation/extraction/etc.)
  thinking_blocks jsonb,        -- Extended thinking content (if enabled)

  -- Execution Metadata
  model_used text,              -- e.g., "claude-3-5-sonnet-20241022"
  tokens_used jsonb,            -- { input, output, cached_read, cached_write }
  execution_time_ms integer,    -- Milliseconds from start to completion
  cache_hit boolean DEFAULT false,  -- Whether operation hit cache

  -- Error Tracking
  error_message text,           -- Human-readable error
  error_type text,              -- Error classification (RateLimitError, TimeoutError, etc.)
  retry_count integer DEFAULT 0,  -- Number of retries attempted

  -- Timestamps
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- Indexes
CREATE INDEX idx_operation_results_run_id ON operation_results(run_id);
CREATE INDEX idx_operation_results_status ON operation_results(status);
CREATE INDEX idx_operation_results_execution_order ON operation_results(run_id, execution_order);

-- RLS Policy
CREATE POLICY "Users can view operation results in their organization"
  ON operation_results FOR SELECT
  USING (run_id IN (
    SELECT id FROM runs WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE operation_results;
```

**Key Design Decisions:**

1. **Operation Snapshot:**
   - Duplicates operation data from `run.snapshot.operations[i]`
   - Trade-off: ~2-5 KB duplication vs simpler queries
   - Enables self-contained queries (no JOIN to runs needed)
   - Disk is cheap, query simplicity is valuable

2. **Execution Order:**
   - 0-based index (matches array position)
   - Ensures deterministic replay
   - Allows UI to show progress (Operation 47 of 100)

3. **Cache Hit Tracking:**
   - Boolean flag for debugging/cost analysis
   - Helps identify cache effectiveness
   - Useful for optimization insights

4. **Error Fields:**
   - `error_message`: User-friendly description
   - `error_type`: Machine-readable classification
   - `retry_count`: Transparency into retry attempts

#### 3. Database Functions

**Required Functions:**

```sql
-- Increment run progress counters
CREATE OR REPLACE FUNCTION increment_run_progress(
  p_run_id uuid,
  p_status text  -- 'completed' or 'failed'
) RETURNS void AS $$
BEGIN
  UPDATE runs
  SET
    completed_operations = CASE WHEN p_status = 'completed'
      THEN completed_operations + 1
      ELSE completed_operations END,
    failed_operations = CASE WHEN p_status = 'failed'
      THEN failed_operations + 1
      ELSE failed_operations END,
    updated_at = now()
  WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### E) Settings & Configuration ✅

**Decision:** Use existing 3-tier LLM configuration with processor-level settings in snapshot

#### Configuration Source

- **Model Resolution:** Use existing `get_llm_config_for_run(processor_id)` function
- **Settings Storage:** `processors.configuration.settings_override`
- **Snapshot Inclusion:** Full configuration frozen in `run.snapshot.processor.configuration`

#### Production Run Settings

| Setting | Source | Default | Notes |
|---------|--------|---------|-------|
| **Model** | Resolved function | Processor → Org → Global | Existing 3-tier hierarchy |
| **API Key** | Resolved function | Org encrypted key → Global env var | Existing architecture |
| **Caching** | Processor setting | `true` | User can disable, massive cost savings |
| **Thinking** | Operation-type dependent | `false` (disabled) | Known Vercel SDK conflict with structured output |
| **Max Tokens** | Processor setting | `4096` | Required by Anthropic API |
| **Temperature** | Processor setting | Not set (LLM default) | Optional processor override |
| **Citations** | Fixed | `false` | Not needed for structured outputs |
| **Top-P, Top-K, Stop Sequences** | Not implemented | N/A | Future enhancement |

#### Caching Strategy

**First Operation:** Create cache
```typescript
messages = [
  { role: 'system', content: systemPrompt },  // No cache control
  {
    role: 'user',
    content: [{
      type: 'file',
      data: documentBuffer,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } }  // 5-min TTL
      }
    }]
  },
  { role: 'user', content: operation.prompt }
]
```

**Operations 2-100:** Cache hits (90% savings)
- Same system prompt + same file = cache hit
- Only prompt changes between operations
- Automatic cache creation if expired mid-run

#### Settings in Snapshot

```json
{
  "processor": {
    "configuration": {
      "selected_model_id": "opus",
      "settings_override": {
        "max_tokens": 8192,
        "temperature": 0.2,
        "thinking": {
          "enabled": false  // Disabled for MVP due to SDK conflict
        },
        "enable_caching": true
      }
    }
  }
}
```

**Immutability:** If user changes processor settings mid-run, the run continues with frozen snapshot settings.

---

### F) Error Handling Strategy ✅

**Decision:** Continue execution with graceful degradation and basic retry logic

#### Core Strategy

1. **Continue on Failure**
   - Don't stop run when operation fails
   - Mark operation as `failed`, log error
   - Continue to next operation
   - Run completes with partial results

2. **Retry Transient Errors**
   - Rate limits (429)
   - Network timeouts
   - Temporary API unavailability
   - Max 3 retries with exponential backoff: 1s, 5s, 15s

3. **Permanent Errors - No Retry**
   - Invalid API key (401)
   - Malformed request (400)
   - Content policy violation
   - Document parsing failure

4. **Cache Expiry - Auto-Recover**
   - If cache expires mid-run (after 5 minutes)
   - Automatically create new cache
   - Continue execution transparently

#### Error Handling Flow

```typescript
// Operation execution loop
for (const [index, operation] of run.snapshot.operations.entries()) {
  // Create operation_result (status: pending)
  const result = await createOperationResult(run_id, operation, index)

  try {
    // Execute with retry logic
    const output = await executeLLMOperationWithRetry({
      operation,
      document,
      systemPrompt,
      settings,
      apiKey,
      maxRetries: 3,
      backoffMs: [1000, 5000, 15000]
    })

    // Success
    await updateOperationResult(result.id, 'completed', {
      response_text: output.response,
      structured_output: output.structured_output,
      thinking_blocks: output.thinking,
      model_used: output.model,
      tokens_used: output.tokens,
      execution_time_ms: output.executionTime,
      cache_hit: output.cacheHit
    })

    await incrementRunProgress(run_id, 'completed')

  } catch (error) {
    // Failure after retries
    await updateOperationResult(result.id, 'failed', {
      error_message: error.message,
      error_type: error.name,
      retry_count: error.retryCount || 0
    })

    await incrementRunProgress(run_id, 'failed')

    // Log for debugging
    console.error(`Operation ${index} failed in run ${run_id}:`, error)

    // CONTINUE to next operation (don't throw)
  }
}

// After all operations attempted
await updateRunStatus(run_id, 'completed', {
  completed_at: new Date()
})
```

#### Retry Logic Implementation

```typescript
async function executeLLMOperationWithRetry(params) {
  const { maxRetries, backoffMs } = params

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperation(params)

    } catch (error) {
      const isTransient = (
        error.status === 429 ||  // Rate limit
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET'
      )

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        // Wait and retry
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

#### Run Status Semantics

**`status: 'completed'`**
- All operations were attempted
- Some may have failed (check `failed_operations` count)
- User gets partial results
- Success rate: `completed_operations / total_operations`

**`status: 'failed'`**
- Run itself crashed (not operation failures)
- Examples:
  - Edge Function timeout
  - Document missing from storage
  - Invalid snapshot data
  - System error
- No operation results available

#### UI Display Logic

```typescript
// Run status badge
if (status === 'completed') {
  if (failed_operations === 0) {
    // 🟢 All succeeded
    <Badge variant="success">✓ Completed ({total_operations}/{total_operations})</Badge>
  } else if (completed_operations > 0) {
    // 🟡 Partial success
    <Badge variant="warning">
      ⚠ Completed ({completed_operations}/{total_operations} succeeded)
    </Badge>
  } else {
    // 🔴 All failed
    <Badge variant="destructive">✗ All operations failed</Badge>
  }
} else if (status === 'failed') {
  // 🔴 Run failed (system error)
  <Badge variant="destructive">✗ Run Failed</Badge>
  <p className="text-sm text-muted-foreground">{error_message}</p>
}
```

#### Error Message Display

**Operation result expandable row:**
```tsx
{result.status === 'failed' && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Operation Failed</AlertTitle>
    <AlertDescription>
      <p>{result.error_message}</p>
      {result.retry_count > 0 && (
        <p className="text-xs mt-2">
          Attempted {result.retry_count + 1} times before failing
        </p>
      )}
    </AlertDescription>
  </Alert>
)}
```

---

## Implementation Steps

### Phase 1: Database Migration

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_create_runs_and_operation_results.sql`

**Tasks:**
1. Create `runs` table with all indexes
2. Create `operation_results` table with all indexes
3. Create RLS policies for both tables
4. Create `increment_run_progress()` function
5. Add tables to `supabase_realtime` publication
6. Test migration locally
7. Generate TypeScript types (`npm run supabase:types`)

**Validation:**
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('runs', 'operation_results');

-- Verify indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN ('runs', 'operation_results');

-- Test RLS policies
SELECT * FROM runs;  -- Should respect organization membership
```

---

### Phase 2: Shared LLM Utility

**Files:**
- `supabase/functions/_shared/llm-executor.ts`
- `supabase/functions/_shared/types.ts` (shared type definitions)

**Extract from `execute-workbench-test`:**
1. Message building logic (system prompt, file handling, content blocks)
2. Vercel AI SDK integration (`generateText`, `generateObject`)
3. Cache control marker logic
4. Response parsing (text, structured output, thinking blocks)
5. Token usage extraction
6. Error handling

**Function Signature:**
```typescript
export interface LLMExecutionParams {
  operation: OperationSnapshot
  document: DocumentSnapshot
  systemPrompt: string
  settings: ProcessorSettings
  apiKey: string
  enableCache: boolean
  previousMessages?: Message[]  // For conversation history (future)
}

export interface LLMExecutionResult {
  response: string
  structured_output: any | null
  thinking_blocks: any[] | null
  model: string
  tokens: {
    input: number
    output: number
    cached_read: number
    cached_write: number
  }
  executionTime: number
  cacheHit: boolean
}

export async function executeLLMOperation(
  params: LLMExecutionParams
): Promise<LLMExecutionResult>
```

**Implementation:**
```typescript
export async function executeLLMOperation(params) {
  const { operation, document, systemPrompt, settings, apiKey, enableCache } = params

  // Initialize Anthropic provider
  const anthropicProvider = createAnthropic({ apiKey })
  const modelToUse = resolveModel(settings.selected_model_id)

  // Build messages
  const messages = []

  // System message (no cache control on system in separate-file architecture)
  const system = systemPrompt

  // File message (separate user message with cache control)
  const documentBuffer = await downloadDocument(document.storage_path)
  if (enableCache) {
    messages.push({
      role: 'user',
      content: [{
        type: 'file',
        data: documentBuffer,
        mediaType: document.mime_type,
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      }]
    })
  } else {
    messages.push({
      role: 'user',
      content: [{
        type: 'file',
        data: documentBuffer,
        mediaType: document.mime_type
      }]
    })
  }

  // Prompt message
  messages.push({
    role: 'user',
    content: operation.prompt
  })

  // Determine execution mode
  const useStructuredOutput = operation.operation_type !== 'generic'
  const outputSchema = getSchemaForOperationType(operation.operation_type)

  const startTime = Date.now()

  // Execute LLM call
  let response, responseText, structuredOutput, thinkingBlocks

  if (useStructuredOutput && outputSchema) {
    // Structured output mode (generateObject)
    response = await generateObject({
      model: anthropicProvider(modelToUse),
      schema: outputSchema,
      messages,
      system,
      maxTokens: settings.max_tokens || 4096,
      ...(settings.temperature !== undefined && { temperature: settings.temperature })
    })

    structuredOutput = response.object
    responseText = JSON.stringify(response.object)
    thinkingBlocks = null  // Not supported with generateObject

  } else {
    // Generic text mode (generateText)
    response = await generateText({
      model: anthropicProvider(modelToUse),
      messages,
      system,
      maxTokens: settings.max_tokens || 4096,
      ...(settings.temperature !== undefined && { temperature: settings.temperature })
    })

    responseText = response.text
    structuredOutput = null
    thinkingBlocks = response.reasoning || null
  }

  const executionTime = Date.now() - startTime

  // Extract token usage
  const tokens = {
    input: response.usage?.promptTokens || 0,
    output: response.usage?.completionTokens || 0,
    cached_read: response.providerMetadata?.anthropic?.cacheReadInputTokens || 0,
    cached_write: response.providerMetadata?.anthropic?.cacheCreationInputTokens || 0
  }

  // Detect cache hit
  const cacheHit = tokens.cached_read > 0

  return {
    response: responseText,
    structured_output: structuredOutput,
    thinking_blocks: thinkingBlocks,
    model: modelToUse,
    tokens,
    executionTime,
    cacheHit
  }
}
```

**Refactor `execute-workbench-test` to use shared utility:**
```typescript
// Before: Inline LLM logic

// After: Call shared utility
import { executeLLMOperation } from '../_shared/llm-executor.ts'

const result = await executeLLMOperation({
  operation: {
    operation_type: body.operation_type,
    prompt: body.new_prompt
  },
  document: { storage_path: '...', mime_type: 'application/pdf' },
  systemPrompt: body.system_prompt,
  settings: body.settings,
  apiKey: decryptedApiKey,
  enableCache: body.settings.create_cache
})
```

**Testing:**
- Verify workbench still works (no regressions)
- Test all operation types (generic, validation)
- Test caching behavior (write, hit, miss)
- Test error handling

---

### Phase 3: Edge Function - `execute-processor-run`

**Files:**
- `supabase/functions/execute-processor-run/index.ts`

**Request Schema:**
```typescript
interface InitialRequest {
  processor_id: string
  document_id: string
}

interface BackgroundRequest {
  run_id: string
  start_index: number
  background: true
}
```

**Implementation Outline:**

```typescript
Deno.serve(async (req) => {
  // Parse request
  const body = await req.json()

  // Authenticate
  const authHeader = req.headers.get('Authorization')
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader)
  if (authError) return new Response('Unauthorized', { status: 401 })

  // Branch: Initial invocation vs Background invocation
  const isBackgroundInvocation = body.background === true

  if (!isBackgroundInvocation) {
    // ===== INITIAL INVOCATION (from UI) =====

    // 1. Validate input
    if (!body.processor_id || !body.document_id) {
      return new Response('Missing required fields', { status: 400 })
    }

    // 2. Fetch processor, operations, document
    const { data: processor } = await supabase
      .from('processors')
      .select('*')
      .eq('id', body.processor_id)
      .single()

    const { data: operations } = await supabase
      .from('operations')
      .select('*')
      .eq('processor_id', body.processor_id)
      .order('position', { ascending: true })

    const { data: document } = await supabase
      .from('documents')
      .select('*')
      .eq('id', body.document_id)
      .single()

    // 3. Get organization_id from user
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    // 4. Create snapshot
    const snapshot = {
      processor: {
        id: processor.id,
        name: processor.name,
        system_prompt: processor.system_prompt,
        configuration: processor.configuration
      },
      operations: operations.map(op => ({
        id: op.id,
        name: op.name,
        operation_type: op.operation_type,
        prompt: op.prompt,
        position: op.position,
        area: op.area,
        configuration: op.configuration,
        output_schema: op.output_schema
      })),
      document: {
        id: document.id,
        name: document.name,
        size_bytes: document.size_bytes,
        mime_type: document.mime_type,
        storage_path: document.storage_path
      }
    }

    // 5. Create run record
    const { data: run } = await supabase
      .from('runs')
      .insert({
        processor_id: processor.id,
        document_id: document.id,
        organization_id: membership.organization_id,
        snapshot: snapshot,
        status: 'pending',
        triggered_by: user.id,
        trigger_type: 'manual',
        total_operations: operations.length,
        started_at: new Date()
      })
      .select()
      .single()

    // 6. Kick off background processing (self-invoke)
    const edgeFunctionUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/execute-processor-run'
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        run_id: run.id,
        start_index: 0,
        background: true
      })
    }).catch(err => console.error('Background invocation failed:', err))

    // 7. Return immediately to user
    return new Response(
      JSON.stringify({ run_id: run.id, status: 'pending' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    )

  } else {
    // ===== BACKGROUND INVOCATION (self-invoked) =====

    const { run_id, start_index } = body
    const CHUNK_SIZE = 10

    // 1. Fetch run with snapshot
    const { data: run } = await supabase
      .from('runs')
      .select('*')
      .eq('id', run_id)
      .single()

    // 2. Update run status to processing (if first chunk)
    if (start_index === 0) {
      await supabase
        .from('runs')
        .update({ status: 'processing' })
        .eq('id', run_id)
    }

    // 3. Get LLM configuration
    const { data: llmConfig } = await supabase.rpc('get_llm_config_for_run', {
      p_processor_id: run.processor_id,
      p_user_id: run.triggered_by
    })

    // 4. Decrypt API key
    const apiKey = llmConfig.api_key_encrypted
      ? await decryptApiKey(llmConfig.api_key_encrypted, llmConfig.organization_id)
      : Deno.env.get('ANTHROPIC_API_KEY')

    // 5. Process chunk of operations
    const operations = run.snapshot.operations
    const chunk = operations.slice(start_index, start_index + CHUNK_SIZE)

    for (const [chunkIndex, operation] of chunk.entries()) {
      const operationIndex = start_index + chunkIndex

      try {
        // Create operation_result (pending)
        const { data: opResult } = await supabase
          .from('operation_results')
          .insert({
            run_id: run_id,
            operation_id: operation.id,
            operation_snapshot: operation,
            execution_order: operationIndex,
            status: 'pending'
          })
          .select()
          .single()

        // Update to processing
        await supabase
          .from('operation_results')
          .update({
            status: 'processing',
            started_at: new Date()
          })
          .eq('id', opResult.id)

        // Execute LLM operation with retry
        const result = await executeLLMOperationWithRetry({
          operation,
          document: run.snapshot.document,
          systemPrompt: run.snapshot.processor.system_prompt,
          settings: run.snapshot.processor.configuration.settings_override || {},
          apiKey,
          enableCache: run.snapshot.processor.configuration.settings_override?.enable_caching !== false,
          maxRetries: 3,
          backoffMs: [1000, 5000, 15000]
        })

        // Update operation_result (completed)
        await supabase
          .from('operation_results')
          .update({
            status: 'completed',
            response_text: result.response,
            structured_output: result.structured_output,
            thinking_blocks: result.thinking_blocks,
            model_used: result.model,
            tokens_used: result.tokens,
            execution_time_ms: result.executionTime,
            cache_hit: result.cacheHit,
            completed_at: new Date()
          })
          .eq('id', opResult.id)

        // Increment run progress
        await supabase.rpc('increment_run_progress', {
          p_run_id: run_id,
          p_status: 'completed'
        })

      } catch (error) {
        // Operation failed (after retries)
        await supabase
          .from('operation_results')
          .update({
            status: 'failed',
            error_message: error.message,
            error_type: error.name,
            retry_count: error.retryCount || 0,
            completed_at: new Date()
          })
          .eq('id', opResult.id)

        // Increment run progress
        await supabase.rpc('increment_run_progress', {
          p_run_id: run_id,
          p_status: 'failed'
        })

        console.error(`Operation ${operationIndex} failed in run ${run_id}:`, error)
      }
    }

    // 6. Check if more chunks remain
    const hasMoreOperations = (start_index + CHUNK_SIZE) < operations.length

    if (hasMoreOperations) {
      // Invoke next chunk
      const edgeFunctionUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/execute-processor-run'
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

      fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          run_id: run_id,
          start_index: start_index + CHUNK_SIZE,
          background: true
        })
      }).catch(err => console.error('Next chunk invocation failed:', err))

    } else {
      // All operations processed, mark run as completed
      await supabase
        .from('runs')
        .update({
          status: 'completed',
          completed_at: new Date()
        })
        .eq('id', run_id)
    }

    // 7. Return success
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

**Helper Functions:**

```typescript
async function executeLLMOperationWithRetry(params) {
  const { maxRetries, backoffMs } = params

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperation(params)

    } catch (error) {
      const isTransient = (
        error.status === 429 ||  // Rate limit
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET'
      )

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        await sleep(backoffMs[attempt])
        continue
      }

      error.retryCount = attempt
      throw error
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

**Testing:**
- Test initial invocation (creates run, returns 202)
- Test background processing (single chunk)
- Test chunking (100+ operations)
- Test error handling (operation fails, run continues)
- Test retry logic (transient errors)
- Test cache behavior (first op creates, subsequent hit)

---

### Phase 4: UI - Run Trigger

**Files:**
- `app/proc/[id]/page.tsx` (add "Run Processor" button)
- `components/processor/run-processor-dialog.tsx` (new dialog)
- `app/queries/runs.ts` (new query hooks)

**Button on Processor Detail Page:**

```tsx
// app/proc/[id]/page.tsx

import { RunProcessorDialog } from '@/components/processor/run-processor-dialog'

export default function ProcessorDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      {/* Existing processor details */}

      <div className="flex gap-2">
        <Button asChild>
          <Link href={`/proc/${params.id}/edit`}>Edit Processor</Link>
        </Button>

        <RunProcessorDialog processorId={params.id} />
      </div>
    </div>
  )
}
```

**Run Processor Dialog Component:**

```tsx
// components/processor/run-processor-dialog.tsx

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDocuments } from '@/app/queries/documents'
import { useCreateRun } from '@/app/queries/runs'

export function RunProcessorDialog({ processorId }: { processorId: string }) {
  const [open, setOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>()
  const router = useRouter()

  const { data: documents } = useDocuments()
  const createRun = useCreateRun()

  const handleRun = async () => {
    if (!selectedDocumentId) return

    const { run_id } = await createRun.mutateAsync({
      processor_id: processorId,
      document_id: selectedDocumentId
    })

    setOpen(false)
    router.push(`/proc/${processorId}/runs/${run_id}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Play className="mr-2 h-4 w-4" />
          Run Processor
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Processor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Select Document</label>
            <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a document to process" />
              </SelectTrigger>
              <SelectContent>
                {documents?.map(doc => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.name} ({formatFileSize(doc.size_bytes)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleRun}
            disabled={!selectedDocumentId || createRun.isPending}
            className="w-full"
          >
            {createRun.isPending ? 'Starting...' : 'Start Run'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Query Hook:**

```typescript
// app/queries/runs.ts

import { useMutation } from '@tanstack/react-query'
import { createTypedClient } from '@/lib/supabase/typed-clients'

export function useCreateRun() {
  const supabase = createTypedClient()

  return useMutation({
    mutationFn: async ({ processor_id, document_id }: {
      processor_id: string
      document_id: string
    }) => {
      const { data, error } = await supabase.functions.invoke('execute-processor-run', {
        body: { processor_id, document_id }
      })

      if (error) throw error
      return data as { run_id: string, status: string }
    }
  })
}
```

---

### Phase 5: UI - Run Detail Page

**Files:**
- `app/proc/[id]/runs/[run_id]/page.tsx` (new route)
- `components/runs/run-detail-header.tsx` (run metadata card)
- `components/runs/operation-results-table.tsx` (results table with expandable rows)
- `app/queries/runs.ts` (add query hooks)

**Page Structure:**

```tsx
// app/proc/[id]/runs/[run_id]/page.tsx

'use client'

import { useRun, useOperationResults } from '@/app/queries/runs'
import { RunDetailHeader } from '@/components/runs/run-detail-header'
import { OperationResultsTable } from '@/components/runs/operation-results-table'

export default function RunDetailPage({
  params
}: {
  params: { id: string, run_id: string }
}) {
  const { data: run } = useRun(params.run_id)
  const { data: operationResults } = useOperationResults(params.run_id)

  if (!run) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <RunDetailHeader run={run} />
      <OperationResultsTable results={operationResults || []} />
    </div>
  )
}
```

**Run Detail Header:**

```tsx
// components/runs/run-detail-header.tsx

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export function RunDetailHeader({ run }: { run: Run }) {
  const progress = (run.completed_operations + run.failed_operations) / run.total_operations * 100
  const duration = run.completed_at
    ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    : Date.now() - new Date(run.started_at).getTime()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{run.snapshot.processor.name}</CardTitle>
          <RunStatusBadge status={run.status} failedCount={run.failed_operations} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Document</p>
            <p className="font-medium">{run.snapshot.document.name}</p>
          </div>

          <div>
            <p className="text-muted-foreground">Started</p>
            <p className="font-medium">{formatDateTime(run.started_at)}</p>
          </div>

          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{formatDuration(duration)}</p>
          </div>

          <div>
            <p className="text-muted-foreground">Triggered By</p>
            <p className="font-medium">{run.triggered_by_name || 'Unknown'}</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Progress</span>
            <span>
              {run.completed_operations + run.failed_operations} / {run.total_operations}
              {run.failed_operations > 0 && (
                <span className="text-destructive ml-2">
                  ({run.failed_operations} failed)
                </span>
              )}
            </span>
          </div>
          <Progress value={progress} />
        </div>
      </CardContent>
    </Card>
  )
}
```

**Operation Results Table:**

```tsx
// components/runs/operation-results-table.tsx

'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StructuredOutputVisualizer } from '@/components/workbench/structured-output-visualizer'

export function OperationResultsTable({ results }: { results: OperationResult[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead className="w-[60px]">#</TableHead>
            <TableHead>Operation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Tokens</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {results.map((result) => {
            const isExpanded = expandedRows.has(result.id)
            const op = result.operation_snapshot

            return (
              <>
                <TableRow key={result.id} className="cursor-pointer" onClick={() => toggleRow(result.id)}>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>

                  <TableCell>{result.execution_order + 1}</TableCell>

                  <TableCell>
                    <div>
                      <p className="font-medium">{op.name}</p>
                      <p className="text-xs text-muted-foreground">{op.area}</p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <OperationStatusBadge status={result.status} />
                  </TableCell>

                  <TableCell>
                    {result.execution_time_ms ? `${(result.execution_time_ms / 1000).toFixed(1)}s` : '-'}
                  </TableCell>

                  <TableCell>
                    {result.tokens_used && (
                      <div className="text-xs">
                        <p>{result.tokens_used.input} in / {result.tokens_used.output} out</p>
                        {result.cache_hit && (
                          <p className="text-green-600">✓ Cache hit ({result.tokens_used.cached_read})</p>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <OperationResultDetail result={result} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function OperationResultDetail({ result }: { result: OperationResult }) {
  return (
    <div className="p-4 space-y-4 bg-muted/50">
      {/* Prompt */}
      <div>
        <h4 className="font-medium mb-2">Prompt</h4>
        <div className="bg-background p-3 rounded border text-sm">
          {result.operation_snapshot.prompt}
        </div>
      </div>

      {/* Response */}
      {result.status === 'completed' && (
        <>
          {result.structured_output ? (
            <div>
              <h4 className="font-medium mb-2">Structured Output</h4>
              <StructuredOutputVisualizer
                data={result.structured_output}
                originalType="json"
                showRawToggle={true}
              />
            </div>
          ) : (
            <div>
              <h4 className="font-medium mb-2">Response</h4>
              <div className="bg-background p-3 rounded border text-sm whitespace-pre-wrap">
                {result.response_text}
              </div>
            </div>
          )}

          {/* Thinking blocks */}
          {result.thinking_blocks && result.thinking_blocks.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Thinking Process</h4>
              <div className="bg-background p-3 rounded border text-sm whitespace-pre-wrap">
                {result.thinking_blocks.map((block: any, i: number) => (
                  <div key={i}>{block.text}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Error */}
      {result.status === 'failed' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Operation Failed</AlertTitle>
          <AlertDescription>
            <p>{result.error_message}</p>
            {result.retry_count > 0 && (
              <p className="text-xs mt-2">
                Attempted {result.retry_count + 1} times before failing
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Model</p>
          <p>{result.model_used}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Execution Time</p>
          <p>{result.execution_time_ms}ms</p>
        </div>
        <div>
          <p className="text-muted-foreground">Cache Hit</p>
          <p>{result.cache_hit ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Retries</p>
          <p>{result.retry_count}</p>
        </div>
      </div>
    </div>
  )
}
```

**Query Hooks with Real-time:**

```typescript
// app/queries/runs.ts

import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createTypedClient } from '@/lib/supabase/typed-clients'

export function useRun(runId: string) {
  const supabase = createTypedClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['run', runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runs')
        .select('*')
        .eq('id', runId)
        .single()

      if (error) throw error
      return data
    }
  })

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`run:${runId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'runs',
        filter: `id=eq.${runId}`
      }, (payload) => {
        queryClient.setQueryData(['run', runId], payload.new)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [runId, supabase, queryClient])

  return query
}

export function useOperationResults(runId: string) {
  const supabase = createTypedClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['operation_results', runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operation_results')
        .select('*')
        .eq('run_id', runId)
        .order('execution_order', { ascending: true })

      if (error) throw error
      return data
    }
  })

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`operation_results:${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'operation_results',
        filter: `run_id=eq.${runId}`
      }, () => {
        // Refetch all operation results on any change
        queryClient.invalidateQueries(['operation_results', runId])
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [runId, supabase, queryClient])

  return query
}
```

---

### Phase 6: UI - Runs List Page

**Files:**
- `app/proc/[id]/runs/page.tsx` (new route)
- `components/runs/runs-table.tsx` (table component)
- `app/queries/runs.ts` (add list query)

**Page Structure:**

```tsx
// app/proc/[id]/runs/page.tsx

'use client'

import { useProcessorRuns } from '@/app/queries/runs'
import { RunsTable } from '@/components/runs/runs-table'

export default function ProcessorRunsPage({ params }: { params: { id: string } }) {
  const { data: runs, isLoading } = useProcessorRuns(params.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Run History</h1>
      </div>

      {isLoading ? (
        <div>Loading runs...</div>
      ) : (
        <RunsTable runs={runs || []} processorId={params.id} />
      )}
    </div>
  )
}
```

**Runs Table Component:**

```tsx
// components/runs/runs-table.tsx

'use client'

import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export function RunsTable({ runs, processorId }: { runs: Run[], processorId: string }) {
  const router = useRouter()

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Triggered By</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {runs.map((run) => {
            const duration = run.completed_at
              ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
              : Date.now() - new Date(run.started_at).getTime()

            return (
              <TableRow
                key={run.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/proc/${processorId}/runs/${run.id}`)}
              >
                <TableCell>
                  <RunStatusBadge
                    status={run.status}
                    failedCount={run.failed_operations}
                  />
                </TableCell>

                <TableCell>
                  <div>
                    <p className="font-medium">{run.snapshot.document.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(run.snapshot.document.size_bytes)}
                    </p>
                  </div>
                </TableCell>

                <TableCell>
                  {formatDateTime(run.started_at)}
                </TableCell>

                <TableCell>
                  {formatDuration(duration)}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {run.completed_operations + run.failed_operations} / {run.total_operations}
                    </span>
                    <div className="w-24">
                      <Progress
                        value={(run.completed_operations + run.failed_operations) / run.total_operations * 100}
                      />
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {run.triggered_by_name || 'Unknown'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {runs.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No runs yet. Click "Run Processor" to start your first run.
        </div>
      )}
    </div>
  )
}
```

**Query Hook:**

```typescript
// app/queries/runs.ts

export function useProcessorRuns(processorId: string) {
  const supabase = createTypedClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['processor_runs', processorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runs')
        .select('*')
        .eq('processor_id', processorId)
        .is('deleted_at', null)
        .order('started_at', { ascending: false })

      if (error) throw error
      return data
    }
  })

  // Subscribe to real-time updates for this processor's runs
  useEffect(() => {
    const channel = supabase
      .channel(`processor_runs:${processorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'runs',
        filter: `processor_id=eq.${processorId}`
      }, () => {
        queryClient.invalidateQueries(['processor_runs', processorId])
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [processorId, supabase, queryClient])

  return query
}
```

---

## Testing Plan

### Unit Tests

1. **Shared LLM Utility** (`llm-executor.ts`)
   - Test message building with/without cache
   - Test structured output vs generic text modes
   - Test error handling (API errors, timeouts)
   - Test token usage extraction

2. **Database Functions**
   - Test `increment_run_progress()` with completed/failed statuses
   - Verify counter accuracy

3. **Edge Function Logic**
   - Test snapshot creation (complete, valid structure)
   - Test retry logic (transient vs permanent errors)
   - Test chunking logic (10 operations, 100 operations, 1000 operations)

### Integration Tests

1. **End-to-End Run Execution**
   - Create processor with 5 operations
   - Upload document
   - Trigger run
   - Verify:
     - Run record created with snapshot
     - 5 operation_results created
     - All operations executed sequentially
     - Run status updated to completed
     - Progress counters accurate

2. **Error Scenarios**
   - Operation fails (mock LLM error)
   - Verify run continues to next operation
   - Verify failed operation recorded with error details

3. **Caching Behavior**
   - First operation creates cache (cached_write > 0)
   - Subsequent operations hit cache (cached_read > 0)
   - Verify cost savings

4. **Real-time Updates**
   - Start run
   - Subscribe to updates
   - Verify UI receives status changes
   - Verify operation results appear in real-time

### Manual Testing Checklist

- [ ] Create processor with 10 operations
- [ ] Upload test document (PDF)
- [ ] Click "Run Processor" button
- [ ] Select document from dropdown
- [ ] Click "Start Run"
- [ ] Redirected to run detail page
- [ ] See "Processing" status
- [ ] See operations completing in real-time
- [ ] Expand operation row to see details
- [ ] Verify structured output displays correctly
- [ ] Verify token usage shown
- [ ] Wait for all operations to complete
- [ ] See "Completed" status with progress (10/10)
- [ ] Navigate to runs list page
- [ ] See completed run in table
- [ ] Click row to navigate back to detail

**Error Testing:**
- [ ] Edit processor mid-run (verify run uses snapshot, unaffected)
- [ ] Delete operation mid-run (verify run continues with snapshot)
- [ ] Cause operation to fail (mock API error)
- [ ] Verify run continues, shows failed operation
- [ ] Verify error message displayed in UI

---

## Deployment Checklist

### Database

- [ ] Run migration in development
- [ ] Verify tables created correctly
- [ ] Test RLS policies (can view own organization's runs)
- [ ] Generate TypeScript types
- [ ] Commit migration to git

### Edge Functions

- [ ] Deploy `_shared/llm-executor.ts`
- [ ] Deploy `execute-processor-run`
- [ ] Set environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY` (global fallback)
- [ ] Test initial invocation (returns 202)
- [ ] Test background processing (logs show chunk execution)

### Frontend

- [ ] Deploy UI components
- [ ] Test document selector
- [ ] Test run detail page real-time updates
- [ ] Test runs list page
- [ ] Verify navigation flow

### Monitoring

- [ ] Add logging for run creation
- [ ] Add logging for chunk processing
- [ ] Add error tracking (Sentry/LogRocket)
- [ ] Monitor Edge Function execution times
- [ ] Monitor database query performance

---

## Success Metrics

### Phase 1.8 is complete when:

1. **Core Functionality**
   - ✅ Users can trigger processor runs from UI
   - ✅ Runs execute all operations sequentially
   - ✅ Results stored in database with full snapshot
   - ✅ Real-time progress tracking works

2. **UI/UX**
   - ✅ Run detail page shows live updates
   - ✅ Runs list page displays all runs
   - ✅ Operation results expandable to see details
   - ✅ Error messages displayed clearly

3. **Performance**
   - ✅ Handles 100+ operations without timeout
   - ✅ Cache hits achieve 90% cost savings
   - ✅ Real-time updates appear within 1 second

4. **Reliability**
   - ✅ Retry logic handles transient errors
   - ✅ Partial results available if some operations fail
   - ✅ Runs unaffected by processor edits/deletions (snapshot isolation)

---

## Future Enhancements (Post-MVP)

### Phase 1.9: Run Management
- Retry failed operations
- Cancel in-progress runs
- Delete completed runs
- Compare runs side-by-side

### Phase 2.0: Scheduling & Automation
- Scheduled runs (cron)
- Webhook triggers
- Bulk document processing
- Email notifications on completion

### Phase 2.1: Advanced Results
- Export to CSV/PDF
- Run analytics dashboard
- Cost tracking per run
- Performance metrics

### Phase 2.2: External Publishing
- Public processor endpoints (from planning doc)
- Anonymous runs without auth
- Embeddable widgets

---

## Glossary

**Run:** Single execution of a processor on a document, containing multiple operation results.

**Snapshot:** Frozen state of processor configuration, operations, and document metadata at run creation time. Ensures immutability.

**Operation Result:** Output of a single operation within a run, including prompt, response, tokens, and metadata.

**Chunking:** Breaking run execution into smaller pieces (10 operations) to avoid Edge Function timeout.

**Self-Invocation:** Edge Function calling itself asynchronously for background processing.

**Transient Error:** Temporary error (rate limit, timeout) that can be retried.

**Permanent Error:** Non-recoverable error (auth, validation) that should not be retried.

**Cache Hit:** LLM operation reuses previously cached content, saving 90% on token costs.

---

## Appendix: Key Files Reference

### Database
- `supabase/migrations/*_create_runs_and_operation_results.sql`
- `lib/database.types.ts` (auto-generated types)

### Edge Functions
- `supabase/functions/_shared/llm-executor.ts`
- `supabase/functions/_shared/types.ts`
- `supabase/functions/execute-processor-run/index.ts`
- `supabase/functions/execute-workbench-test/index.ts` (refactored)

### Frontend - Queries
- `app/queries/runs.ts`
- `app/queries/documents.ts`

### Frontend - Components
- `components/processor/run-processor-dialog.tsx`
- `components/runs/run-detail-header.tsx`
- `components/runs/operation-results-table.tsx`
- `components/runs/runs-table.tsx`

### Frontend - Pages
- `app/proc/[id]/page.tsx` (add run button)
- `app/proc/[id]/runs/page.tsx` (runs list)
- `app/proc/[id]/runs/[run_id]/page.tsx` (run detail)

---

**End of Implementation Plan**

**Status:** Ready for implementation
**Next Step:** Begin Phase 1 (Database Migration)
**Estimated Timeline:** 5-7 days for full implementation and testing
