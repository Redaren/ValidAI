# Anthropic Files API Implementation Plan

**Version:** 1.0
**Date:** 2025-01-30
**Scope:** `execute-processor-run` Edge Function only (workbench out of scope)

---

## Executive Summary

Implement Anthropic Files API support in `execute-processor-run` following the **exact same pattern** as Mistral file upload. This eliminates per-chunk document downloads from Supabase Storage, improves performance, and creates architectural consistency.

### Key Objectives
- ✅ Upload documents to Anthropic Files API **before** creating run (fail-fast pattern)
- ✅ Store `file_id` in run snapshot for reuse across all operations
- ✅ Use native `@anthropic-ai/sdk` (not Vercel AI SDK) for consistency
- ✅ Maintain legacy Vercel AI SDK path for backward compatibility
- ✅ Feature flag defaulting to TRUE (new behavior enabled by default)

---

## Architecture Overview

### Current State (Anthropic)
```
Initial Invocation:
  └─ No upload

Background Processing:
  ├─ Download document from Supabase Storage (once per chunk)
  ├─ Cache buffer in memory
  ├─ Pass buffer to Vercel AI SDK executor
  └─ Send file inline with each LLM call
```

### Target State (Anthropic with Files API)
```
Initial Invocation:
  ├─ Download document from Supabase Storage (once)
  ├─ Upload to Anthropic Files API
  ├─ Get file_id
  ├─ Store file_id in snapshot
  └─ FAIL FAST if upload fails (don't create run)

Background Processing:
  ├─ Retrieve file_id from snapshot
  ├─ Pass file_id to native Anthropic SDK executor
  └─ Reference file by ID (no downloads, no inline files)
```

### Mistral State (Reference Pattern)
```
Initial Invocation:
  ├─ Download document from Supabase Storage (once)
  ├─ Upload to Mistral Files API
  ├─ Get signed URL
  ├─ Store URL in snapshot
  └─ FAIL FAST if upload fails (don't create run)

Background Processing:
  ├─ Retrieve signed URL from snapshot
  ├─ Pass URL to Mistral SDK executor
  └─ Reference file by URL (no downloads, no inline files)
```

---

## Feature Flag Design

### Decision: Processor Settings Override

**Location:** `processor.configuration.settings_override.use_anthropic_files_api`

**Default Behavior:**
- **New processors:** `true` (Files API enabled)
- **Existing processors:** `undefined` → defaults to `true` (auto-migrate)
- **Explicit opt-out:** Set to `false` (legacy mode)

**Logic:**
```typescript
const useAnthropicFilesAPI =
  processor.configuration?.settings_override?.use_anthropic_files_api ?? true
```

### Rationale
- ✅ New behavior is better (performance, consistency)
- ✅ Simple opt-out for edge cases
- ✅ No environment variables needed
- ✅ Per-processor control if needed
- ✅ Gradual migration (can disable per-processor if issues arise)

---

## File Structure Changes

### New Files

#### 1. `supabase/functions/_shared/llm-executor-anthropic.ts`
New native Anthropic SDK executor mirroring Mistral pattern.

**Contents:**
- `uploadDocumentToAnthropic()` - Upload document, return file_id
- `executeLLMOperationAnthropic()` - Execute with file_id reference
- `executeLLMOperationAnthropicWithRetry()` - With retry logic
- Manual structured output parsing (Zod validation)
- Native prompt caching support
- Native extended thinking support

### Modified Files

#### 2. `supabase/functions/execute-processor-run/index.ts`
Add Anthropic Files API upload in initial invocation (lines 259-309 area).

#### 3. `supabase/functions/_shared/llm-executor-router.ts`
Update router to support three Anthropic paths:
- Files API (new, file_id string)
- Legacy (current, Buffer)
- Mistral (existing, URL string)

#### 4. `supabase/functions/_shared/types.ts`
Add `anthropic_file_id` to `RunSnapshot` interface.

---

## Detailed Implementation

### Step 1: Create Native Anthropic Executor

**File:** `supabase/functions/_shared/llm-executor-anthropic.ts`

#### 1.1 Upload Function

```typescript
import Anthropic from 'npm:@anthropic-ai/sdk'
import { Buffer } from 'https://deno.land/std@0.168.0/node/buffer.ts'

/**
 * Upload document to Anthropic Files API and get file_id
 *
 * @param anthropicClient - Initialized Anthropic client
 * @param documentBuffer - Document content as Buffer
 * @param documentName - Original document filename
 * @returns file_id for document reference
 * @throws Error if upload fails
 */
export async function uploadDocumentToAnthropic(
  anthropicClient: Anthropic,
  documentBuffer: Buffer,
  documentName: string
): Promise<string> {
  console.log(`[Anthropic] Uploading document: ${documentName} (${documentBuffer.length} bytes)`)

  // Upload file to Anthropic Files API
  const uploadedFile = await anthropicClient.files.upload(
    documentBuffer,
    {
      filename: documentName,
    }
  )

  console.log(`[Anthropic] File uploaded successfully: ${uploadedFile.id}`)
  console.log(`[Anthropic] File ID will be stored in snapshot and reused across all operations`)

  return uploadedFile.id
}
```

#### 1.2 Executor Function

**Pattern:** Mirror `llm-executor-mistral.ts` structure exactly

**Key Features:**
- Accept `fileId` parameter (string)
- Use native Anthropic SDK `messages.create()`
- Reference file via document content block: `{ type: 'document', source: { type: 'file', file_id: fileId } }`
- Beta headers: `anthropic-beta: files-api-2025-04-14,prompt-caching-2024-07-31`
- Manual structured output parsing with Zod (copy Mistral pattern)
- Support prompt caching via message-level `cache_control`
- Support extended thinking via `thinking` parameter

**Signature:**
```typescript
export async function executeLLMOperationAnthropic(
  params: LLMExecutionParams,
  supabase: any,
  fileId: string  // ← File ID from snapshot
): Promise<LLMExecutionResult>
```

#### 1.3 Retry Wrapper

**Pattern:** Exact copy of Mistral retry logic

```typescript
export async function executeLLMOperationAnthropicWithRetry(
  params: LLMExecutionParams,
  supabase: any,
  fileId: string,
  maxRetries: number = 3,
  backoffMs: number[] = [1000, 5000, 15000]
): Promise<LLMExecutionResult>
```

---

### Step 2: Update Execute Processor Run

**File:** `supabase/functions/execute-processor-run/index.ts`

#### 2.1 Initial Invocation - Upload Phase

**Location:** After Mistral upload section (after line 309), before snapshot creation (before line 311)

**Code Addition:**

```typescript
// 7. If Mistral, upload document BEFORE creating run (fail-fast)
let mistralDocumentUrl: string | null = null

if (provider === 'mistral') {
  // ... existing Mistral upload code ...
}

// 7b. If Anthropic with Files API enabled, upload document BEFORE creating run (fail-fast)
let anthropicFileId: string | null = null

if (provider === 'anthropic') {
  // Check feature flag (defaults to true)
  const useFilesAPI = processor.configuration?.settings_override?.use_anthropic_files_api ?? true

  if (useFilesAPI) {
    console.log('Processor uses Anthropic Files API - uploading document before creating run...')

    try {
      // Resolve Anthropic API key (same pattern as Mistral)
      let anthropicApiKey: string
      if (llmConfig.api_key_encrypted) {
        const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
          p_ciphertext: llmConfig.api_key_encrypted,
          p_org_id: llmConfig.organization_id
        })

        if (decryptError || !decryptedKey) {
          throw new Error(`Failed to decrypt Anthropic API key: ${decryptError?.message}`)
        }
        anthropicApiKey = decryptedKey
      } else {
        // Use global Anthropic API key
        const globalKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (!globalKey) {
          throw new Error('No Anthropic API key available (neither org-specific nor global)')
        }
        anthropicApiKey = globalKey
      }

      // Download and upload document
      const documentBuffer = await downloadDocument(supabase, document.storage_path)
      const anthropicClient = new Anthropic({ apiKey: anthropicApiKey })

      anthropicFileId = await uploadDocumentToAnthropic(
        anthropicClient,
        documentBuffer,
        document.name
      )

      console.log(`✅ Anthropic document uploaded successfully`)
      console.log(`File ID will be stored in snapshot and reused for all ${operations.length} operations`)
    } catch (error: any) {
      console.error(`❌ Failed to upload document to Anthropic: ${error.message}`)
      // FAIL FAST: Return error BEFORE creating run
      return new Response(
        JSON.stringify({
          error: 'Document upload to Anthropic failed',
          details: error.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } else {
    console.log('Processor uses Anthropic legacy mode (inline files via Vercel AI SDK)')
  }
}
```

#### 2.2 Snapshot Creation

**Location:** Line 311-338

**Change:** Add `anthropic_file_id` to snapshot

```typescript
// 8. Create snapshot (frozen state)
const snapshot: RunSnapshot = {
  processor: {
    id: processor.id,
    name: processor.name,
    system_prompt: processor.system_prompt,
    configuration: processor.configuration
  },
  operations: operations.map((op: any) => ({
    id: op.id,
    name: op.name,
    description: op.description,
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
  },
  mistral_document_url: mistralDocumentUrl,  // NULL for non-Mistral
  anthropic_file_id: anthropicFileId  // ← NEW: NULL for legacy Anthropic, file_id for Files API
}
```

#### 2.3 Background Processing - Execution Phase

**Location:** Lines 596-608 (document download section)

**Replace:**

```typescript
// Current code (lines 601-608):
let documentBuffer: any = null
if (provider === 'anthropic') {
  console.log(`\n--- Downloading document: ${snapshot.document.name} ---`)
  documentBuffer = await downloadDocument(supabase, snapshot.document.storage_path)
  console.log(`Document cached in memory: ${documentBuffer.length} bytes`)
}
```

**With:**

```typescript
// Prepare document reference for executor
// - Mistral: signed URL (string)
// - Anthropic Files API: file_id (string)
// - Anthropic Legacy: document buffer (Buffer)
let documentRef: string | Buffer | null = null

if (provider === 'mistral') {
  // Existing Mistral path
  const mistralDocumentUrl = snapshot.mistral_document_url || null
  if (mistralDocumentUrl) {
    console.log(`✅ Reusing Mistral signed URL from snapshot: ${mistralDocumentUrl.substring(0, 50)}...`)
    documentRef = mistralDocumentUrl
  }
} else if (provider === 'anthropic') {
  // Check if Files API was used (file_id in snapshot)
  const anthropicFileId = snapshot.anthropic_file_id || null

  if (anthropicFileId) {
    // NEW: Anthropic Files API path
    console.log(`✅ Reusing Anthropic file_id from snapshot: ${anthropicFileId}`)
    documentRef = anthropicFileId
  } else {
    // LEGACY: Anthropic inline files path
    console.log(`Using Anthropic legacy mode - downloading document for inline passing`)
    console.log(`\n--- Downloading document: ${snapshot.document.name} ---`)
    const documentBuffer = await downloadDocument(supabase, snapshot.document.storage_path)
    console.log(`Document cached in memory: ${documentBuffer.length} bytes`)
    documentRef = documentBuffer
  }
}
```

#### 2.4 Executor Call

**Location:** Line 623-635

**No changes needed** - router handles path selection

```typescript
const result = await executeLLMOperationWithRetryRouter(
  {
    operation,
    document: snapshot.document,
    systemPrompt: snapshot.processor.system_prompt,
    settings,
    apiKey,
    enableCache: enableCaching && operationIndex === 0 ? true : enableCaching,
  },
  supabase,
  documentRef  // ← Could be: mistralUrl (string) | anthropicFileId (string) | buffer (Buffer) | null
)
```

---

### Step 3: Update Router

**File:** `supabase/functions/_shared/llm-executor-router.ts`

#### 3.1 Import New Executor

```typescript
import { executeLLMOperation, executeLLMOperationWithRetry } from './llm-executor.ts'
import { executeLLMOperationMistral, executeLLMOperationMistralWithRetry } from './llm-executor-mistral.ts'
import { executeLLMOperationAnthropic, executeLLMOperationAnthropicWithRetry } from './llm-executor-anthropic.ts'  // ← NEW
import type { LLMExecutionParams, LLMExecutionResult } from './types.ts'
```

#### 3.2 Update Router Logic

**Replace existing `executeLLMOperationWithRetryRouter` function:**

```typescript
/**
 * Route to appropriate LLM executor with retry logic
 *
 * @param params - Execution parameters (includes settings.provider)
 * @param supabase - Supabase client
 * @param documentRef - Document reference (string for file_id/URL, Buffer for inline, null for none)
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Execution result from provider-specific executor
 * @throws Error if provider is unknown or max retries exceeded
 *
 * @description
 * Routes to correct provider executor based on:
 * - Mistral: documentRef is signed URL (string)
 * - Anthropic Files API: documentRef is file_id (string)
 * - Anthropic Legacy: documentRef is Buffer or undefined
 *
 * Decision logic:
 * 1. If provider is 'mistral' → Mistral executor
 * 2. If provider is 'anthropic' AND documentRef is string → Anthropic Files API executor (NEW)
 * 3. If provider is 'anthropic' AND documentRef is Buffer/undefined → Legacy executor (EXISTING)
 */
export async function executeLLMOperationWithRetryRouter(
  params: LLMExecutionParams,
  supabase: any,
  documentRef?: string | Buffer,
  maxRetries: number = 3
): Promise<LLMExecutionResult> {
  const provider = (params.settings.provider || 'anthropic') as LLMProvider

  console.log(`[Router] Routing LLM execution to ${provider} executor (retry enabled, max: ${maxRetries})`)

  if (provider === 'mistral') {
    // Mistral path: documentRef is signed URL (string)
    console.log('[Router] → Mistral executor with signed URL')
    return await executeLLMOperationMistralWithRetry(
      params,
      supabase,
      documentRef as string,
      maxRetries
    )
  }

  if (provider === 'anthropic') {
    // Determine Anthropic execution path based on documentRef type
    if (typeof documentRef === 'string') {
      // NEW: Anthropic Files API path (documentRef is file_id)
      console.log('[Router] → Anthropic Files API executor with file_id')
      return await executeLLMOperationAnthropicWithRetry(
        params,
        supabase,
        documentRef,  // file_id (string)
        maxRetries
      )
    } else {
      // LEGACY: Anthropic inline files path (documentRef is Buffer or undefined)
      console.log('[Router] → Anthropic legacy executor (Vercel AI SDK) with inline file')
      return await executeLLMOperationWithRetry(
        params,
        supabase,
        documentRef as Buffer | undefined,
        maxRetries
      )
    }
  }

  throw new Error(
    `Unknown LLM provider: ${provider}. Supported providers: anthropic, mistral`
  )
}
```

---

### Step 4: Update Types

**File:** `supabase/functions/_shared/types.ts`

#### 4.1 Update RunSnapshot Interface

**Location:** Line 102-115 in execute-processor-run/index.ts (interface declaration)

**Add field:**

```typescript
/**
 * Run snapshot structure
 */
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
  operations: OperationSnapshot[]
  document: DocumentSnapshot
  mistral_document_url?: string  // Signed URL for Mistral document reuse (valid 24 hours)
  anthropic_file_id?: string     // ← NEW: File ID for Anthropic Files API (indefinite storage)
}
```

#### 4.2 Update ProcessorSettings Interface

**Location:** types.ts, line 59-73

**Add field:**

```typescript
export interface ProcessorSettings {
  provider?: LLMProvider
  selected_model_id?: string
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  thinking?: {
    enabled: boolean
    budget_tokens: number
  }
  enable_caching?: boolean
  stop_sequences?: string[]
  supports_top_p?: boolean
  use_anthropic_files_api?: boolean  // ← NEW: Enable Anthropic Files API (defaults to true)
}
```

---

## Implementation Steps (Execution Order)

### Phase 1: Foundation (Day 1)
1. ✅ Create `llm-executor-anthropic.ts`
   - Implement `uploadDocumentToAnthropic()`
   - Implement `executeLLMOperationAnthropic()`
   - Implement `executeLLMOperationAnthropicWithRetry()`
   - Manual structured output parsing (copy Mistral pattern)
   - Prompt caching via native messages
   - Extended thinking support

2. ✅ Update `types.ts`
   - Add `anthropic_file_id?: string` to `RunSnapshot`
   - Add `use_anthropic_files_api?: boolean` to `ProcessorSettings`

### Phase 2: Integration (Day 1-2)
3. ✅ Update `execute-processor-run/index.ts` - Initial Invocation
   - Add Anthropic upload section (after Mistral, before snapshot)
   - Add feature flag check
   - Add API key resolution
   - Add document upload
   - Add fail-fast error handling
   - Update snapshot creation to include `anthropic_file_id`

4. ✅ Update `execute-processor-run/index.ts` - Background Processing
   - Update document reference preparation logic
   - Add file_id retrieval from snapshot
   - Add legacy path detection
   - Keep buffer download for legacy path

5. ✅ Update `llm-executor-router.ts`
   - Add import for new Anthropic executor
   - Update routing logic with type-based detection
   - Add logging for path selection

### Phase 3: Testing (Day 2-3)
6. ✅ Unit test Anthropic executor
   - Test file upload
   - Test execution with file_id
   - Test structured output parsing
   - Test error handling

7. ✅ Integration test execute-processor-run
   - Test with Files API enabled (new path)
   - Test with Files API disabled (legacy path)
   - Test upload failures (fail-fast)
   - Test multi-operation runs (file_id reuse)

8. ✅ End-to-end test
   - Create processor with Anthropic
   - Execute run on real document
   - Verify file upload
   - Verify all operations use file_id
   - Verify structured outputs
   - Compare token usage vs legacy

### Phase 4: Deployment & Monitoring (Day 3-4)
9. ✅ Deploy to production
   - Deploy Edge Function updates
   - Monitor logs for routing decisions
   - Track file upload success rates
   - Monitor performance improvements

10. ✅ Documentation
    - Update README/docs with new behavior
    - Document feature flag usage
    - Add troubleshooting guide

---

## Testing Strategy

### Unit Tests

#### Test: Upload Document to Anthropic
```typescript
// Mock Anthropic client
const mockClient = {
  files: {
    upload: async (buffer, options) => ({
      id: 'file_abc123',
      filename: options.filename,
      size_bytes: buffer.length,
      created_at: new Date().toISOString()
    })
  }
}

const fileId = await uploadDocumentToAnthropic(mockClient, buffer, 'test.pdf')
assert(fileId === 'file_abc123')
```

#### Test: Execute with File ID
```typescript
// Test that executor uses file_id in document content block
// Verify no inline file data is sent
// Verify structured output parsing works
```

#### Test: Router Path Selection
```typescript
// Test 1: Mistral → Mistral executor (string URL)
// Test 2: Anthropic + string → Files API executor
// Test 3: Anthropic + Buffer → Legacy executor
// Test 4: Anthropic + undefined → Legacy executor
```

### Integration Tests

#### Test: Fail-Fast on Upload Error
```typescript
// Mock failing Anthropic upload
// Verify run is NOT created
// Verify error response returned to user
```

#### Test: File ID Reuse Across Operations
```typescript
// Create run with 5 operations
// Verify file uploaded once
// Verify all 5 operations use same file_id
// Verify no downloads from Supabase Storage during execution
```

#### Test: Legacy Path Still Works
```typescript
// Set use_anthropic_files_api: false
// Verify no file upload
// Verify document downloaded per-chunk
// Verify execution completes successfully
```

### Performance Tests

#### Test: Compare Upload vs Download Approach
```typescript
// Scenario 1: Legacy (3 chunks, 3 downloads)
// Scenario 2: Files API (1 upload, 0 downloads)
// Measure: Total execution time, API costs, bandwidth usage
```

**Expected Results:**
- Upload approach: 1 upload (2-3s) + 0 downloads = ~3s overhead
- Legacy approach: 3 downloads (1-2s each) = ~3-6s overhead
- **Net benefit:** Marginal on time, but eliminates Supabase egress costs

---

## Rollback Strategy

### Immediate Rollback (Feature Flag)

**Option 1: Per-Processor Disable**
```sql
-- Disable Files API for specific processor
UPDATE validai_processors
SET configuration = jsonb_set(
  COALESCE(configuration, '{}'::jsonb),
  '{settings_override,use_anthropic_files_api}',
  'false'
)
WHERE id = '<processor-id>';
```

**Option 2: Global Disable (Code Change)**
```typescript
// In execute-processor-run/index.ts, line ~315
const useFilesAPI = processor.configuration?.settings_override?.use_anthropic_files_api ?? false  // ← Change to false
```

### Full Rollback (Revert Deployment)

If critical issues arise:
1. Revert Edge Function deployment to previous version
2. All processors automatically fall back to legacy behavior
3. No data loss (snapshots with `anthropic_file_id` gracefully ignore field)

---

## Migration Path

### Timeline

**Week 1: Deploy with Default Enabled**
- New processors: Files API enabled by default
- Existing processors: Auto-migrate (feature flag defaults to true)
- Monitor logs, error rates, performance

**Week 2-4: Monitoring & Adjustment**
- Collect metrics on:
  - File upload success rate
  - Execution time improvements
  - Token usage (should be identical)
  - Error patterns
- Disable Files API for problematic processors if needed

**Month 2: Evaluate Legacy Removal**
- If Files API stable, plan deprecation of legacy path
- Add warnings in logs for legacy usage
- Communication plan for any edge cases

**Month 3+: Cleanup**
- Remove `llm-executor.ts` (Vercel AI SDK version)
- Remove legacy path from router
- Remove Vercel AI SDK dependency
- Update documentation

---

## Dependencies

### NPM Packages (Deno)

**Required:**
- `npm:@anthropic-ai/sdk` - Native Anthropic SDK for Files API
  - Already present in workbench executor
  - Verify version supports Files API (v0.29.0+)

**Existing:**
- `npm:@ai-sdk/anthropic` - Vercel AI SDK (legacy path only)
- `npm:@mistralai/mistralai` - Mistral SDK (reference pattern)
- `npm:zod` - Structured output validation
- `npm:ai` - Vercel AI SDK core (legacy path only)

### Environment Variables

**Required:**
- `ANTHROPIC_API_KEY` - Global fallback API key (already exists)
- `SUPABASE_URL` - Supabase instance URL (already exists)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (already exists)

**Optional:**
- Organization-specific API keys (stored encrypted in database)

---

## Success Criteria

### Performance Metrics
- ✅ Upload success rate > 99%
- ✅ Zero mid-execution download failures
- ✅ Execution time parity or improvement vs legacy
- ✅ Token usage identical to legacy (no hidden costs)

### Code Quality
- ✅ Router cleanly handles three paths (Mistral, Anthropic Files API, Anthropic Legacy)
- ✅ Feature flag defaults to optimal path (true)
- ✅ Fail-fast pattern prevents bad runs
- ✅ Logging clearly identifies execution path

### User Experience
- ✅ Transparent to users (no behavior changes)
- ✅ Faster or equivalent run times
- ✅ Clear error messages on upload failures
- ✅ No regressions in output quality

---

## Risk Assessment

### High Risk
- **Upload failures blocking runs**
  - Mitigation: Fail-fast pattern, clear error messages
  - Rollback: Feature flag disable per-processor

### Medium Risk
- **Files API quota limits (100GB org storage)**
  - Mitigation: Delete files after run completion
  - Monitoring: Track total file storage per org

- **Beta API instability**
  - Mitigation: Retry logic on transient errors
  - Rollback: Feature flag to legacy

### Low Risk
- **Token usage differences**
  - Mitigation: Per documentation, usage cost is identical
  - Monitoring: Track token counts in operation_results

- **File persistence issues**
  - Mitigation: Files persist indefinitely per Anthropic docs
  - Fallback: Legacy path always available

---

## Open Questions

1. **File Cleanup Strategy**
   - Delete after run completes? (conservative)
   - Keep for 24-48 hours? (potential reuse across runs)
   - **Recommendation:** Delete after run for MVP, add reuse logic later

2. **Workbench Integration**
   - Out of scope now (confirmed)
   - Future: Migrate workbench to native SDK too?
   - **Recommendation:** Defer to future iteration

3. **Error Recovery**
   - If upload succeeds but run creation fails, orphaned file exists
   - **Recommendation:** Accept orphans for MVP (Anthropic cleans up old files), add cleanup cron later

4. **Legacy Deprecation Timeline**
   - How long to maintain both paths?
   - **Recommendation:** 3-6 months based on adoption metrics

---

## Appendix: Code Comparison

### Mistral Pattern (Reference)
```typescript
// UPLOAD (Initial Invocation)
let mistralDocumentUrl: string | null = null
if (provider === 'mistral') {
  try {
    const apiKey = resolveApiKey(llmConfig, 'MISTRAL_API_KEY')
    const documentBuffer = await downloadDocument(supabase, document.storage_path)
    const mistralClient = new Mistral({ apiKey })
    mistralDocumentUrl = await uploadDocumentToMistral(mistralClient, documentBuffer, document.name)
    console.log('✅ Mistral document uploaded')
  } catch (error) {
    return errorResponse('Upload failed', error.message)  // FAIL FAST
  }
}

// SNAPSHOT
const snapshot = {
  // ...
  mistral_document_url: mistralDocumentUrl
}

// EXECUTION (Background)
const mistralUrl = snapshot.mistral_document_url
const result = await executeLLMOperationMistralWithRetry(params, supabase, mistralUrl, maxRetries)
```

### Anthropic Files API Pattern (New - Identical Structure)
```typescript
// UPLOAD (Initial Invocation)
let anthropicFileId: string | null = null
if (provider === 'anthropic') {
  const useFilesAPI = processor.configuration?.settings_override?.use_anthropic_files_api ?? true
  if (useFilesAPI) {
    try {
      const apiKey = resolveApiKey(llmConfig, 'ANTHROPIC_API_KEY')
      const documentBuffer = await downloadDocument(supabase, document.storage_path)
      const anthropicClient = new Anthropic({ apiKey })
      anthropicFileId = await uploadDocumentToAnthropic(anthropicClient, documentBuffer, document.name)
      console.log('✅ Anthropic document uploaded')
    } catch (error) {
      return errorResponse('Upload failed', error.message)  // FAIL FAST
    }
  }
}

// SNAPSHOT
const snapshot = {
  // ...
  anthropic_file_id: anthropicFileId
}

// EXECUTION (Background)
const fileId = snapshot.anthropic_file_id
if (fileId) {
  result = await executeLLMOperationAnthropicWithRetry(params, supabase, fileId, maxRetries)
} else {
  result = await executeLLMOperationWithRetry(params, supabase, documentBuffer, maxRetries)  // LEGACY
}
```

---

**End of Implementation Plan**
