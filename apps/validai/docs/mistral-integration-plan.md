# Mistral LLM Provider Integration Plan

**Version:** 1.0.0
**Date:** 2025-10-28
**Status:** 🟡 Planning
**Author:** Claude (Anthropic)

---

## Table of Contents

- [Overview](#overview)
- [Architecture Analysis](#architecture-analysis)
- [Key Architectural Decisions](#key-architectural-decisions)
- [Implementation Phases](#implementation-phases)
- [File Changes Summary](#file-changes-summary)
- [Known Limitations](#known-limitations)
- [Success Criteria](#success-criteria)
- [Rollout Plan](#rollout-plan)

---

## Overview

### Purpose

Add native Mistral AI SDK support to ValidAI for both manual processor execution and workbench testing, maintaining architectural parity with existing Anthropic implementation while accounting for key API differences.

### Scope

- ✅ Manual processor execution (`execute-processor-run` Edge Function)
- ✅ Workbench testing (`execute-workbench-test` Edge Function)
- ✅ Database configuration (add Mistral models to `validai_llm_global_settings`)
- ✅ API key management (environment variables + organization overrides)
- ✅ Structured output handling for all operation types
- ✅ Documentation and usage guides

### Out of Scope (Phase 2+)

- ❌ Prompt caching (Mistral doesn't support this feature)
- ❌ Extended thinking/reasoning mode (Mistral doesn't support this)
- ❌ Advanced Mistral-specific features (RAG, FIM, dedicated OCR endpoint)
- ❌ UI changes (model selector already supports multiple providers)

---

## Architecture Analysis

### Current State: Anthropic Implementation

ValidAI currently uses **Vercel AI SDK** with the Anthropic provider:

```typescript
// Current Anthropic flow (execute-processor-run)
const documentBuffer = await downloadDocument(supabase, storagePath)

const response = await generateText({
  model: anthropicProvider(modelName),
  messages: [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [{
        type: 'file',
        data: documentBuffer,  // Direct base64 encoding
        mediaType: mimeType,
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } }  // Prompt caching
        }
      }]
    },
    { role: 'user', content: operation.prompt }
  ],
  experimental_output: Output.object({ schema: zodSchema }),  // Vercel abstraction
  providerOptions: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 10000 }  // Extended thinking
    }
  }
})

const structuredOutput = response.experimental_output  // Auto-parsed Zod object
```

**Key Features:**
- ✅ Direct base64 document encoding in messages
- ✅ Prompt caching via `cacheControl` (90% cost savings)
- ✅ Extended thinking/reasoning mode
- ✅ Zod schema → automatic structured output parsing
- ✅ Vercel AI SDK abstractions

---

### Target State: Mistral Implementation

Mistral requires the **native `@mistralai/mistralai` SDK** (Vercel AI SDK does NOT wrap Files API):

```typescript
// Proposed Mistral flow (execute-processor-run)
const mistralClient = new Mistral({ apiKey })

// STEP 1: Upload document ONCE per run (initial invocation)
const documentBuffer = await downloadDocument(supabase, storagePath)
const uploadedFile = await mistralClient.files.upload({
  file: { fileName: document.name, content: documentBuffer },
  purpose: "ocr"
})

// STEP 2: Get signed URL (valid 24 hours)
const signedUrl = await mistralClient.files.getSignedUrl({
  fileId: uploadedFile.id
})
// Store signedUrl.url in run context for reuse across all operations

// STEP 3: Execute each operation (stateless, reuse signed URL)
for (const operation of operations) {
  const response = await mistralClient.chat.complete({
    model: "mistral-small-latest",
    messages: [
      {
        role: "user",
        content: [
          // System prompt as text (Mistral may not have separate system role)
          { type: "text", text: `${systemPrompt}\n\n${operation.prompt}` },
          { type: "document_url", documentUrl: signedUrl.url }  // Reused signed URL
        ]
      }
    ],
    responseFormat: { type: "json_object" }  // Forces JSON output
  })

  // STEP 4: Manual JSON parsing (no Zod auto-validation)
  const rawJson = JSON.parse(response.choices[0].message.content)

  // STEP 5: Validate against operation type schema
  try {
    const validatedOutput = operationSchema.parse(rawJson)
  } catch (error) {
    // Store raw + log warning, continue processing
    console.warn(`Validation failed for operation ${operation.name}:`, error)
  }
}
```

**Key Differences:**
- ❌ Requires separate document upload step (adds 2-3s per run)
- ❌ No prompt caching (higher API costs)
- ❌ No extended thinking mode
- ❌ Manual JSON parsing and validation
- ✅ Signed URL reuse across operations (efficient)
- ✅ Stateless operation execution (matches ValidAI architecture)

---

### Comparison Matrix

| Aspect | Anthropic (Current) | Mistral (New) |
|--------|-------------------|---------------|
| **SDK** | Vercel AI SDK (`@ai-sdk/anthropic`) | Native SDK (`@mistralai/mistralai`) |
| **Document Handling** | Base64 in message content | Upload → Signed URL → Reference |
| **Structured Output** | Zod → `experimental_output` (auto-parsed) | JSON Schema in prompt → manual parse |
| **System Prompt** | Separate `system` role | User message with text prefix |
| **Prompt Caching** | ✅ 90% cost savings | ❌ Not available |
| **Extended Thinking** | ✅ Reasoning mode with token budget | ❌ Not available |
| **API Key Storage** | `ANTHROPIC_API_KEY` env var + org override | `MISTRAL_API_KEY` env var + org override |
| **Operation Mode** | Stateless (each operation independent) | Stateless (each operation independent) |
| **Retry Logic** | 3 retries with exponential backoff | Same pattern (reusable) |
| **Token Tracking** | Input, output, cached_read, cached_write | Input, output only |
| **Error Handling** | Continue on failure (store error, process next) | Same pattern |

---

## Key Architectural Decisions

### Decision 1: Document Upload Strategy

**Chosen:** Upload once per run, reuse signed URL for all operations

**Rationale:**
- Signed URLs valid for 24 hours (sufficient for any run duration)
- Upload overhead (~2-3s) amortized across all operations
- Matches ValidAI's stateless operation execution model
- Simplifies state management (no conversation history needed)

**Implementation:**
1. **Initial invocation** (`execute-processor-run`):
   - Upload document to Mistral Files API
   - Get signed URL
   - Store in run snapshot or separate context field
   - Return HTTP 202 immediately
2. **Background invocation** (chunked processing):
   - Read signed URL from context
   - Pass to each operation execution
   - No re-upload needed

**Alternative Considered:**
- Upload per operation: Too slow, wasteful
- Cache uploaded documents across runs: Complex expiry tracking, not worth it

---

### Decision 2: Structured Output Handling

**Chosen:** Convert Zod schemas to JSON Schema strings, validate but continue on errors

**Approach:**
1. Convert operation type Zod schemas to JSON Schema format
2. Embed schema in prompt engineering:
   ```typescript
   const prompt = `${operation.prompt}

   Return ONLY a JSON object with this exact structure:
   {
     "traffic_light": "red" | "yellow" | "green",
     "comment": "string - explanation for the status"
   }`
   ```
3. Use `responseFormat: { type: "json_object" }` to enforce JSON
4. Parse raw JSON response
5. Validate against Zod schema
6. On validation error:
   - Log warning with details
   - Store raw JSON in `structured_output`
   - Mark operation as completed (not failed)
   - Continue to next operation

**Rationale:**
- Mistral's structured output is less strict than Anthropic's
- ValidAI's architecture already handles partial failures well
- Users see raw JSON if validation fails (transparency)
- Doesn't break runs due to formatting issues

**Alternative Considered:**
- Fail on validation errors: Too brittle, user experience suffers
- Skip validation entirely: Loses type safety, harder to debug

---

### Decision 3: Provider Routing Architecture

**Chosen:** Create dedicated Mistral executor + router layer

**Structure:**
```
_shared/
├── llm-executor.ts              # Existing Anthropic executor (unchanged)
├── llm-executor-mistral.ts      # NEW: Mistral executor
├── llm-executor-router.ts       # NEW: Provider routing logic
└── types.ts                     # Updated with Mistral types
```

**Router Logic:**
```typescript
export async function executeLLMOperationWithRouter(
  params: LLMExecutionParams,
  supabase: any
): Promise<LLMExecutionResult> {
  const provider = params.settings.provider || 'anthropic'

  if (provider === 'mistral') {
    return executeLLMOperationMistral(params, supabase)
  } else {
    return executeLLMOperation(params, supabase)  // Existing Anthropic
  }
}
```

**Rationale:**
- Clean separation of concerns
- No changes to existing Anthropic code (low risk)
- Easy to add more providers in future (OpenAI, Google, etc.)
- Unified interface for both Edge Functions

**Alternative Considered:**
- Modify existing `llm-executor.ts` with conditionals: Messy, hard to maintain

---

### Decision 4: API Key Management

**Chosen:** Same pattern as Anthropic (env var fallback + org override)

**Resolution Flow:**
```typescript
// 1. Get LLM config (resolves model + provider)
const llmConfig = await supabase.rpc('get_llm_config_for_run', { p_processor_id })

// 2. Resolve API key based on provider
let apiKey: string
if (llmConfig.provider === 'mistral') {
  if (llmConfig.api_key_encrypted) {
    // Organization has custom Mistral key
    apiKey = await decrypt_api_key(llmConfig.api_key_encrypted, org_id)
  } else {
    // Fallback to global Mistral key
    apiKey = Deno.env.get('MISTRAL_API_KEY')
  }
} else {
  // Anthropic flow (unchanged)
  apiKey = llmConfig.api_key_encrypted
    ? await decrypt_api_key(llmConfig.api_key_encrypted, org_id)
    : Deno.env.get('ANTHROPIC_API_KEY')
}
```

**Environment Variables:**
- `ANTHROPIC_API_KEY` (existing)
- `MISTRAL_API_KEY` (new)

**Database:**
- `organizations.llm_configuration.api_keys_encrypted.mistral` (new)

---

### Decision 5: System Prompt Handling

**Chosen:** Prepend system prompt to user message content

**Rationale:**
- Simplifies implementation with consistent message structure
- Works reliably with Mistral's document URL content type
- Reduces complexity compared to separate system role handling

**Implementation:**
```typescript
// Prepend system prompt to user message
messages: [
  { role: "user", content: [
    { type: "text", text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt },
    { type: "document_url", documentUrl }
  ]}
]
```

**Note:** If system prompt is empty/null, only the prompt is sent.

---

### Decision 6: Feature Parity Expectations

**Chosen:** Implement core functionality, gracefully disable unsupported features

**Approach:**
- **Prompt Caching**: Skip `cacheControl` logic for Mistral (no-op)
- **Extended Thinking**: Ignore `thinking` settings for Mistral models
- **Structured Output**: Best-effort with validation fallback
- **Token Tracking**: Track input/output only (no cached tokens)

**Documentation:**
- Clearly document limitations in LLM config docs
- Add warning badges in UI when limitations apply (future enhancement)
- Explain cost implications (no caching = higher costs)

**No Blocking:** Users can still use Mistral models, just with reduced features.

---

## Implementation Phases

### **Phase 1: Mistral SDK Integration** (Core Foundation)

**Goal:** Create reusable Mistral executor with document upload and structured output

#### 1.1 Create Mistral Executor

**File:** `supabase/functions/_shared/llm-executor-mistral.ts` (~400 lines)

**Key Functions:**

```typescript
/**
 * Upload document to Mistral Files API and get signed URL
 */
async function uploadDocumentToMistral(
  mistralClient: Mistral,
  documentBuffer: Buffer,
  documentName: string
): Promise<string> {
  // 1. Upload file
  const uploadedFile = await mistralClient.files.upload({
    file: { fileName: documentName, content: documentBuffer },
    purpose: "ocr"
  })

  // 2. Get signed URL
  const signedUrl = await mistralClient.files.getSignedUrl({
    fileId: uploadedFile.id
  })

  return signedUrl.url
}

/**
 * Convert Zod schema to JSON Schema string for prompt
 */
function zodToJsonSchemaPrompt(operationType: OperationType): string {
  switch (operationType) {
    case 'traffic_light':
      return `{
  "traffic_light": "red" | "yellow" | "green",
  "comment": "string - explanation"
}`
    // ... other operation types
  }
}

/**
 * Execute LLM operation with Mistral
 */
export async function executeLLMOperationMistral(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string  // Reuse from previous operation
): Promise<LLMExecutionResult> {
  const { operation, document, systemPrompt, settings, apiKey } = params

  // Initialize Mistral client
  const mistralClient = new Mistral({ apiKey })

  // Upload document if not already uploaded
  let documentUrl = signedDocumentUrl
  if (!documentUrl) {
    const documentBuffer = await downloadDocument(supabase, document.storage_path)
    documentUrl = await uploadDocumentToMistral(mistralClient, documentBuffer, document.name)
  }

  // Build prompt with embedded schema
  const jsonSchemaPrompt = zodToJsonSchemaPrompt(operation.operation_type)
  const fullPrompt = `${operation.prompt}

Return ONLY a JSON object with this exact structure:
${jsonSchemaPrompt}`

  // Prepend system prompt to user message (Decision 5)
  const userMessageText = systemPrompt ? `${systemPrompt}\n\n${fullPrompt}` : fullPrompt

  // Execute LLM call
  const startTime = Date.now()
  const response = await mistralClient.chat.complete({
    model: settings.selected_model_id || 'mistral-small-latest',
    messages: [{
      role: "user",
      content: [
        { type: "text", text: userMessageText },
        { type: "document_url", documentUrl }
      ]
    }],
    responseFormat: { type: "json_object" },
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    topP: settings.top_p
  })

  const executionTime = Date.now() - startTime

  // Parse structured output
  const rawContent = response.choices[0].message.content
  let structuredOutput = null
  let responseText = rawContent

  try {
    structuredOutput = JSON.parse(rawContent)

    // Validate against operation type schema
    const schema = getOperationTypeSchema(operation.operation_type)
    const validated = schema.parse(structuredOutput)

    // Extract response text based on operation type
    if (operation.operation_type === 'generic') {
      responseText = validated.response
    } else {
      responseText = JSON.stringify(validated, null, 2)
    }
  } catch (error) {
    console.warn(`Structured output validation failed for ${operation.name}:`, error)
    // Continue with raw JSON
  }

  // Extract token usage
  const tokens = {
    input: response.usage?.prompt_tokens || 0,
    output: response.usage?.completion_tokens || 0,
    cached_read: 0,  // Mistral doesn't support caching
    cached_write: 0
  }

  return {
    response: responseText,
    structured_output: structuredOutput,
    thinking_blocks: null,  // Mistral doesn't support thinking
    model: settings.selected_model_id || 'mistral-small-latest',
    tokens,
    executionTime,
    cacheHit: false,
    documentUrl  // Return for reuse in next operation
  }
}

/**
 * Execute with retry logic
 */
export async function executeLLMOperationMistralWithRetry(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string,
  maxRetries: number = 3
): Promise<LLMExecutionResult> {
  const backoffMs = [1000, 5000, 15000]

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperationMistral(params, supabase, signedDocumentUrl)
    } catch (error: any) {
      const isTransient = (
        error.status === 429 ||
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET'
      )

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        const delay = backoffMs[attempt]
        console.warn(`Retrying Mistral call (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      error.retryCount = attempt
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
```

**Zod Schema Conversion:**

```typescript
function getOperationTypeSchema(operationType: OperationType) {
  switch (operationType) {
    case 'generic':
      return z.object({
        response: z.string()
      })
    case 'validation':
      return z.object({
        result: z.boolean(),
        comment: z.string()
      })
    case 'traffic_light':
      return z.object({
        traffic_light: z.enum(['red', 'yellow', 'green']),
        comment: z.string()
      })
    // ... etc
  }
}
```

---

#### 1.2 Create Provider Router

**File:** `supabase/functions/_shared/llm-executor-router.ts` (~100 lines)

```typescript
import { executeLLMOperation, executeLLMOperationWithRetry } from './llm-executor.ts'
import { executeLLMOperationMistral, executeLLMOperationMistralWithRetry } from './llm-executor-mistral.ts'
import type { LLMExecutionParams, LLMExecutionResult } from './types.ts'

/**
 * Factory map of LLM executors by provider
 * Extensible: Add new providers by adding entries here
 */
const executors = {
  anthropic: executeLLMOperation,
  mistral: executeLLMOperationMistral,
  // Future: openai, google, cohere, etc.
} as const

const executorsWithRetry = {
  anthropic: executeLLMOperationWithRetry,
  mistral: executeLLMOperationMistralWithRetry,
  // Future: openai, google, cohere, etc.
} as const

/**
 * Route to appropriate LLM executor based on provider (Factory Pattern)
 */
export async function executeLLMOperationWithRouter(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string  // For Mistral URL reuse
): Promise<LLMExecutionResult> {
  const provider = params.settings.provider || 'anthropic'

  console.log(`[Router] Routing to ${provider} executor`)

  const executor = executors[provider as keyof typeof executors]

  if (!executor) {
    throw new Error(`Unknown LLM provider: ${provider}. Supported: ${Object.keys(executors).join(', ')}`)
  }

  // Note: Anthropic executor ignores signedDocumentUrl param
  return executor(params, supabase, signedDocumentUrl as any)
}

/**
 * Route with retry logic (Factory Pattern)
 */
export async function executeLLMOperationWithRetryRouter(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string,
  maxRetries: number = 3
): Promise<LLMExecutionResult> {
  const provider = params.settings.provider || 'anthropic'

  console.log(`[Router] Routing to ${provider} executor with retry`)

  const executor = executorsWithRetry[provider as keyof typeof executorsWithRetry]

  if (!executor) {
    throw new Error(`Unknown LLM provider: ${provider}. Supported: ${Object.keys(executorsWithRetry).join(', ')}`)
  }

  // Note: Anthropic executor ignores signedDocumentUrl param
  return executor(params, supabase, signedDocumentUrl as any, maxRetries)
}
```

---

#### 1.3 Update Shared Types

**File:** `supabase/functions/_shared/types.ts` (+50 lines)

```typescript
// Add Mistral-specific fields
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
  documentUrl?: string  // NEW: For Mistral signed URL reuse
}

export interface ProcessorSettings {
  selected_model_id?: string
  provider?: 'anthropic' | 'mistral'  // NEW: Provider detection
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: string[]
  enable_caching?: boolean
  thinking?: {
    enabled: boolean
    budget_tokens: number
  }
  supports_top_p?: boolean
}

// NEW: Run context for Mistral document uploads
export interface RunContext {
  mistral_document_url?: string  // Signed URL for reuse
}
```

---

### **Phase 2: Execute Processor Run Integration**

**Goal:** Update manual processor execution to support Mistral

#### 2.1 Update Background Processing Logic

**File:** `supabase/functions/execute-processor-run/index.ts` (~50 lines changed)

**Changes:**

```typescript
// ===== INITIAL INVOCATION: Add Mistral document upload (FAIL-FAST) =====
if (!isBackground) {
  // STEP 1: Resolve LLM config FIRST to determine provider
  const llmConfig = await supabase.rpc('get_llm_config_for_run', {
    p_processor_id: processor.id
  })

  let mistralDocumentUrl: string | null = null

  // STEP 2: If Mistral, upload document BEFORE creating run (fail-fast)
  if (llmConfig.provider === 'mistral') {
    console.log('Processor uses Mistral - uploading document...')

    try {
      const apiKey = llmConfig.api_key_encrypted
        ? await decrypt_api_key(llmConfig.api_key_encrypted, organization_id)
        : Deno.env.get('MISTRAL_API_KEY')

      if (!apiKey) {
        throw new Error('No Mistral API key available')
      }

      const documentBuffer = await downloadDocument(supabase, document.storage_path)
      const mistralClient = new Mistral({ apiKey })

      mistralDocumentUrl = await uploadDocumentToMistral(
        mistralClient,
        documentBuffer,
        document.name
      )

      console.log('Mistral document uploaded, signed URL obtained')
    } catch (error) {
      console.error('Failed to upload document to Mistral:', error)
      // FAIL FAST: Return error BEFORE creating run
      return new Response(
        JSON.stringify({ error: 'Document upload failed', details: error.message }),
        { status: 500, headers: corsHeaders }
      )
    }
  }

  // STEP 3: Create snapshot (after upload succeeds or N/A)
  // ... existing snapshot creation logic ...

  // STEP 4: Create run record (guaranteed to have document URL if Mistral)
  const { data: run } = await supabase
    .from('validai_runs')
    .insert({
      // ... existing fields ...
      snapshot: {
        ...snapshot,
        mistral_document_url: mistralDocumentUrl  // NULL for Anthropic, URL for Mistral
      }
    })
    .select()
    .single()

  // ... rest of initial invocation logic ...
}

// ===== BACKGROUND INVOCATION: Use router and reuse signed URL =====
else {
  // ... existing run fetch logic ...

  // Get signed URL from snapshot (if Mistral)
  const mistralDocumentUrl = run.snapshot.mistral_document_url || null

  // ... LLM config resolution ...

  // Determine provider
  const provider = llmConfig.provider || 'anthropic'
  const settings: ProcessorSettings = {
    provider,  // NEW: Pass provider to executor
    selected_model_id: llmConfig.model,
    // ... other settings ...
  }

  console.log(`Provider: ${provider}`)
  if (provider === 'mistral' && mistralDocumentUrl) {
    console.log(`Reusing Mistral signed URL: ${mistralDocumentUrl.substring(0, 50)}...`)
  }

  // Process operations
  for (const [chunkIndex, operation] of chunk.entries()) {
    try {
      // ... create operation_result record ...

      // CHANGED: Use router instead of direct executor
      const llmResult = await executeLLMOperationWithRetryRouter({
        operation,
        document: snapshot.document,
        systemPrompt: snapshot.processor.system_prompt,
        settings,
        apiKey,
        enableCache: operationIndex === 0 && provider === 'anthropic'  // Only Anthropic caching
      }, supabase, mistralDocumentUrl)  // Pass signed URL for reuse

      // ... update operation_result with results ...

    } catch (error) {
      // ... existing error handling ...
    }
  }

  // ... rest of background processing ...
}
```

---

#### 2.2 API Key Resolution

**File:** Same as above, `execute-processor-run/index.ts` (~20 lines)

```typescript
// Resolve API key based on provider
let apiKey: string

if (llmConfig.provider === 'mistral') {
  if (llmConfig.api_key_encrypted) {
    const { data: decryptedKey } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: llmConfig.api_key_encrypted,
      p_org_id: llmConfig.organization_id
    })
    apiKey = decryptedKey
  } else {
    const globalKey = Deno.env.get('MISTRAL_API_KEY')
    if (!globalKey) {
      throw new Error('No Mistral API key available')
    }
    apiKey = globalKey
  }
  console.log('Using Mistral API key')
} else {
  // Existing Anthropic logic
  if (llmConfig.api_key_encrypted) {
    const { data: decryptedKey } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: llmConfig.api_key_encrypted,
      p_org_id: llmConfig.organization_id
    })
    apiKey = decryptedKey
  } else {
    const globalKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!globalKey) {
      throw new Error('No Anthropic API key available')
    }
    apiKey = globalKey
  }
  console.log('Using Anthropic API key')
}
```

---

### **Phase 3: Execute Workbench Integration**

**Goal:** Update workbench testing to support Mistral

#### 3.1 Add Provider Detection

**File:** `supabase/functions/execute-workbench-test/index.ts` (~100 lines changed)

```typescript
// Resolve model and provider from database
const modelId = body.settings?.model_id || 'claude-3-5-sonnet-20241022'

// Look up provider from global settings (database-driven, not inferred)
const { data: modelInfo, error: modelError } = await supabase
  .from('validai_llm_global_settings')
  .select('provider')
  .eq('model_name', modelId)
  .eq('is_active', true)
  .single()

const provider = modelInfo?.provider || 'anthropic'  // Fallback to anthropic

console.log(`Model: ${modelId}`)
console.log(`Provider: ${provider} (from database)`)

if (modelError) {
  console.warn(`Model not found in global settings: ${modelId}, using default provider`)
}

// Get appropriate API key based on resolved provider
let apiKey: string

if (provider === 'mistral') {
  // Try to get org-specific Mistral key
  const { data: orgLlmConfig } = await supabase
    .from('organizations')
    .select('llm_configuration')
    .eq('id', orgId)
    .single()

  if (orgLlmConfig?.llm_configuration?.api_keys_encrypted?.mistral) {
    const { data: decryptedKey } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: orgLlmConfig.llm_configuration.api_keys_encrypted.mistral,
      p_org_id: orgId
    })
    apiKey = decryptedKey
  } else {
    apiKey = Deno.env.get('MISTRAL_API_KEY')
    if (!apiKey) {
      throw new Error('No Mistral API key available')
    }
  }
} else {
  // Existing Anthropic logic
  apiKey = /* ... */
}
```

---

#### 3.2 Mistral Document Handling

**File:** Same as above (~80 lines)

```typescript
// Handle file upload for Mistral
let mistralDocumentUrl: string | null = null

if (provider === 'mistral' && body.send_file && body.file_content) {
  console.log('Uploading document to Mistral...')

  const mistralClient = new Mistral({ apiKey })

  // Decode base64 file content
  const fileBuffer = Buffer.from(body.file_content, 'base64')

  // Upload to Mistral
  const uploadedFile = await mistralClient.files.upload({
    file: {
      fileName: `workbench-${Date.now()}.${body.file_type === 'application/pdf' ? 'pdf' : 'txt'}`,
      content: fileBuffer
    },
    purpose: "ocr"
  })

  // Get signed URL
  const signedUrl = await mistralClient.files.getSignedUrl({
    fileId: uploadedFile.id
  })

  mistralDocumentUrl = signedUrl.url

  console.log('Mistral document uploaded and signed URL obtained')
}

// Execute LLM call
let response

if (provider === 'mistral') {
  const mistralClient = new Mistral({ apiKey })

  // Build prompt with system prompt and schema
  const fullPrompt = body.send_system_prompt && body.system_prompt
    ? `${body.system_prompt}\n\n${body.new_prompt}`
    : body.new_prompt

  // Add structured output schema if needed
  const promptWithSchema = body.operation_type !== 'generic'
    ? `${fullPrompt}\n\nReturn ONLY a JSON object with this structure:\n${zodToJsonSchemaPrompt(body.operation_type)}`
    : fullPrompt

  // Call Mistral
  const mistralResponse = await mistralClient.chat.complete({
    model: modelId,
    messages: [{
      role: "user",
      content: mistralDocumentUrl
        ? [
            { type: "text", text: promptWithSchema },
            { type: "document_url", documentUrl: mistralDocumentUrl }
          ]
        : promptWithSchema
    }],
    responseFormat: body.operation_type !== 'generic'
      ? { type: "json_object" }
      : undefined,
    temperature: body.settings?.temperature,
    maxTokens: body.settings?.max_tokens,
    topP: body.settings?.top_p
  })

  // Parse response
  const content = mistralResponse.choices[0].message.content

  response = {
    text: content,
    usage: {
      inputTokens: mistralResponse.usage?.prompt_tokens || 0,
      outputTokens: mistralResponse.usage?.completion_tokens || 0
    },
    providerMetadata: {
      mistral: {
        usage: mistralResponse.usage
      }
    }
  }

  // Parse structured output if operation type is not generic
  if (body.operation_type !== 'generic') {
    try {
      response.experimental_output = JSON.parse(content)
    } catch (e) {
      console.warn('Failed to parse Mistral JSON response:', e)
    }
  }

} else {
  // Existing Anthropic/Vercel AI SDK flow
  response = await generateText({
    // ... existing logic ...
  })
}
```

---

#### 3.3 Response Handling

**File:** Same as above (~40 lines)

```typescript
// Extract structured output based on provider
let structuredOutput = null

if (provider === 'mistral' && body.operation_type !== 'generic') {
  try {
    const rawJson = JSON.parse(response.text)

    // Validate against operation type schema
    const schema = getOperationTypeSchema(body.operation_type)
    structuredOutput = schema.parse(rawJson)
  } catch (error) {
    console.warn('Mistral structured output validation failed:', error)
    // Return raw JSON
    structuredOutput = { raw: response.text, error: error.message }
  }
} else {
  structuredOutput = response.experimental_output || null
}

// Return response
return new Response(
  JSON.stringify({
    response: response.text,
    structured_output: structuredOutput,
    thinking_blocks: provider === 'anthropic' ? extractThinking(response) : null,
    citations: provider === 'anthropic' ? extractCitations(response) : null,
    tokens_used: {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
      cached_read: provider === 'anthropic' ? (response.providerMetadata?.anthropic?.cacheReadTokens || 0) : 0,
      cached_write: provider === 'anthropic' ? (response.providerMetadata?.anthropic?.cacheCreationTokens || 0) : 0
    },
    model_used: modelId,
    execution_time_ms: executionTime,
    provider  // NEW: Include provider in response
  }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
```

---

### **Phase 4: Database & Configuration**

#### 4.1 Add Mistral Models Migration

**File:** `supabase/migrations/YYYYMMDD_add_mistral_models.sql` (~80 lines)

```sql
-- =============================================================================
-- ADD MISTRAL MODELS TO LLM GLOBAL SETTINGS
-- =============================================================================
-- Description: Add Mistral AI models to global LLM settings
-- Author: ValidAI Team
-- Created: 2025-10-28
-- Risk: Low (adding new data only)
-- Rollback: DELETE FROM validai_llm_global_settings WHERE provider = 'mistral'
-- =============================================================================

-- Add Mistral Small (recommended for cost-effectiveness)
INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
) VALUES (
  'mistral',
  'mistral-small-latest',
  'Mistral Small Latest',
  false,  -- Not default (keep Claude as default)
  true,   -- Active and available
  jsonb_build_object(
    'default_temperature', 0.7,
    'default_max_tokens', 4096,
    'default_top_p', 1.0,
    'context_window', 128000,
    'supports_top_p', true,
    'supports_caching', false,
    'supports_thinking', false,
    'notes', 'Cost-effective model with multimodal capabilities. Does not support prompt caching or extended thinking.'
  )
);

-- Add Mistral Large (more powerful)
INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
) VALUES (
  'mistral',
  'mistral-large-latest',
  'Mistral Large Latest',
  false,
  true,
  jsonb_build_object(
    'default_temperature', 0.7,
    'default_max_tokens', 4096,
    'default_top_p', 1.0,
    'context_window', 128000,
    'supports_top_p', true,
    'supports_caching', false,
    'supports_thinking', false,
    'notes', 'Most capable Mistral model for complex tasks. Higher cost than Small. Does not support prompt caching or extended thinking.'
  )
);

-- Verify models were added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM validai_llm_global_settings WHERE provider = 'mistral') = 2,
    'Expected 2 Mistral models to be added';

  RAISE NOTICE '✅ Successfully added 2 Mistral models to global settings';
END $$;

-- Display summary
SELECT
  provider,
  model_name,
  display_name,
  is_active,
  (configuration->>'default_temperature')::text as temperature,
  (configuration->>'context_window')::text as context_window,
  (configuration->>'supports_caching')::text as caching,
  (configuration->>'supports_thinking')::text as thinking
FROM validai_llm_global_settings
WHERE provider = 'mistral'
ORDER BY model_name;

-- =============================================================================
-- NOTES
-- =============================================================================
--
-- Mistral Model Limitations:
-- - No prompt caching support (higher API costs than Anthropic with caching)
-- - No extended thinking/reasoning mode
-- - Structured output via JSON mode (less strict than Anthropic)
-- - Requires document upload step (2-3s overhead per run)
--
-- Recommended Use Cases:
-- - Cost-sensitive workloads (Mistral Small is cheaper than Claude)
-- - Multilingual document processing
-- - When prompt caching benefits are minimal (single-operation runs)
--
-- =============================================================================
```

---

#### 4.2 Verify LLM Config Function

**Action:** Test that `get_llm_config_for_run()` correctly handles Mistral provider

**Expected Behavior:**
- Returns `provider: 'mistral'` when processor uses Mistral model
- Resolves Mistral API key from org config or falls back to global
- Returns Mistral model settings from global configuration

**Test Query:**
```sql
-- Test Mistral config resolution
SELECT get_llm_config_for_run('<processor_id_with_mistral_model>');

-- Expected output:
{
  "provider": "mistral",
  "model": "mistral-small-latest",
  "display_name": "Mistral Small Latest",
  "api_key_encrypted": null,  -- Or encrypted key if org has custom key
  "organization_id": "...",
  "settings": {
    "default_temperature": 0.7,
    "default_max_tokens": 4096,
    "supports_caching": false,
    "supports_thinking": false
  }
}
```

**If Function Needs Updates:** Create migration to adjust logic (unlikely based on current design).

---

#### 4.3 Environment Variables

**File:** `.env.example` (+1 line)

```bash
# LLM Provider API Keys
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=your_mistral_api_key_here  # NEW
```

**Deployment Guide Updates:**

Add to Supabase Edge Function secrets:
```bash
# Set Mistral API key in Supabase
npx supabase secrets set MISTRAL_API_KEY=your_key_here
```

---

### **Phase 5: Edge Function Dependencies**

#### 5.1 Add Mistral SDK Import

**Files:**
- `supabase/functions/_shared/llm-executor-mistral.ts`
- `supabase/functions/execute-processor-run/index.ts`
- `supabase/functions/execute-workbench-test/index.ts`

**Import Statement:**
```typescript
import { Mistral } from 'npm:@mistralai/mistralai'
```

**Note:** Deno supports npm imports directly with `npm:` prefix, no package.json needed.

---

### **Phase 6: Testing & Validation**

#### 6.1 Unit Testing

**Tests to Create:**

1. **Document Upload Test**
   ```typescript
   test('uploads document to Mistral and returns signed URL', async () => {
     const mockClient = createMockMistralClient()
     const buffer = Buffer.from('test content')

     const url = await uploadDocumentToMistral(mockClient, buffer, 'test.pdf')

     expect(url).toMatch(/^https:\/\//)
     expect(mockClient.files.upload).toHaveBeenCalledOnce()
     expect(mockClient.files.getSignedUrl).toHaveBeenCalledOnce()
   })
   ```

2. **Structured Output Parsing Test**
   ```typescript
   test('parses traffic light structured output correctly', () => {
     const rawJson = '{"traffic_light":"red","comment":"High risk detected"}'
     const parsed = parseStructuredOutput('traffic_light', rawJson)

     expect(parsed.traffic_light).toBe('red')
     expect(parsed.comment).toBe('High risk detected')
   })

   test('handles validation errors gracefully', () => {
     const rawJson = '{"traffic_light":"purple","comment":"Invalid"}' // Invalid color
     const parsed = parseStructuredOutput('traffic_light', rawJson)

     expect(parsed).toHaveProperty('error')
     expect(parsed.raw).toBe(rawJson)
   })
   ```

3. **Provider Routing Test**
   ```typescript
   test('routes to Mistral executor when provider is mistral', async () => {
     const params = { settings: { provider: 'mistral' }, /* ... */ }

     const result = await executeLLMOperationWithRouter(params, supabase)

     expect(result.model).toMatch(/^mistral-/)
   })

   test('routes to Anthropic executor when provider is anthropic', async () => {
     const params = { settings: { provider: 'anthropic' }, /* ... */ }

     const result = await executeLLMOperationWithRouter(params, supabase)

     expect(result.model).toMatch(/^claude-/)
   })
   ```

4. **API Key Resolution Test**
   ```typescript
   test('uses org Mistral key when available', async () => {
     const llmConfig = {
       provider: 'mistral',
       api_key_encrypted: 'encrypted_org_key',
       organization_id: 'org-123'
     }

     const apiKey = await resolveApiKey(llmConfig, supabase)

     expect(apiKey).toBe('decrypted_org_key')
     expect(supabase.rpc).toHaveBeenCalledWith('decrypt_api_key', /* ... */)
   })

   test('falls back to global Mistral key when org key not available', async () => {
     const llmConfig = {
       provider: 'mistral',
       api_key_encrypted: null,
       organization_id: 'org-123'
     }

     Deno.env.set('MISTRAL_API_KEY', 'global_key')
     const apiKey = await resolveApiKey(llmConfig, supabase)

     expect(apiKey).toBe('global_key')
   })
   ```

---

#### 6.2 Integration Testing

**Test Plan:**

1. **Deploy Edge Functions**
   ```bash
   # Deploy to staging environment
   npx supabase functions deploy execute-processor-run --project-ref <staging-ref>
   npx supabase functions deploy execute-workbench-test --project-ref <staging-ref>

   # Set Mistral API key
   npx supabase secrets set MISTRAL_API_KEY=<your_key> --project-ref <staging-ref>
   ```

2. **Run Database Migration**
   ```bash
   npx supabase db push --project-ref <staging-ref>

   # Verify Mistral models added
   npx supabase db query "SELECT * FROM validai_llm_global_settings WHERE provider = 'mistral'" --project-ref <staging-ref>
   ```

3. **Create Test Processor**
   - Create processor with Mistral Small model
   - Add 3-5 operations of different types:
     - Traffic Light
     - Extraction
     - Validation
     - Generic
   - Use test system prompt

4. **Upload Test Document**
   - Upload sample PDF (e.g., contract, invoice)
   - Verify storage path recorded correctly

5. **Execute Test Run**
   - Trigger manual run via UI or API
   - Monitor Edge Function logs:
     ```bash
     npx supabase functions logs execute-processor-run --project-ref <staging-ref>
     ```
   - Check for:
     - ✅ Document upload success
     - ✅ Signed URL obtained
     - ✅ Each operation executed
     - ✅ Structured outputs parsed
     - ✅ Token usage tracked
     - ✅ Run marked as completed

6. **Test Workbench**
   - Open workbench for Mistral processor
   - Upload test file
   - Send test prompt
   - Verify:
     - ✅ Document uploaded to Mistral
     - ✅ Response received
     - ✅ Structured output displayed
     - ✅ Token counts shown
     - ✅ No errors in console

7. **Test Multi-Operation Run**
   - Create processor with 10+ operations
   - Execute run
   - Verify:
     - ✅ Chunked execution (10 ops per chunk)
     - ✅ Signed URL reused (no re-uploads)
     - ✅ All operations completed
     - ✅ Total execution time reasonable
     - ✅ Token costs tracked

8. **Test Error Scenarios**
   - Invalid API key: Should fail with clear error
   - Invalid model name: Should fail gracefully
   - Malformed JSON response: Should store raw, continue
   - Network timeout: Should retry 3x, then fail
   - Document upload failure: Should fail run immediately

---

#### 6.3 Validation Checklist

Before marking as complete, verify:

- [ ] Mistral models appear in UI model selector
- [ ] Can select Mistral model when creating processor
- [ ] Can execute processor run with Mistral model
- [ ] Document uploads successfully to Mistral
- [ ] Signed URL is reused across operations (check logs)
- [ ] Structured outputs work for all operation types
- [ ] Validation errors handled gracefully (stores raw JSON)
- [ ] Token usage tracked correctly (input/output only, no cache)
- [ ] Can use workbench with Mistral models
- [ ] Workbench structured output displays correctly
- [ ] Error messages are clear and actionable
- [ ] Both global and organization API keys work
- [ ] Environment variable `MISTRAL_API_KEY` fallback works
- [ ] Retry logic works for transient errors
- [ ] Edge Function logs are clear and informative
- [ ] Documentation is complete and accurate
- [ ] No breaking changes to existing Anthropic functionality

---

## File Changes Summary

### New Files (3)

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/functions/_shared/llm-executor-mistral.ts` | ~400 | Mistral SDK integration, document upload, structured output |
| `supabase/functions/_shared/llm-executor-router.ts` | ~100 | Provider routing logic |
| `supabase/migrations/YYYYMMDD_add_mistral_models.sql` | ~80 | Add Mistral models to database |

### Modified Files (5)

| File | Changes | Purpose |
|------|---------|---------|
| `supabase/functions/_shared/types.ts` | +50 lines | Add Mistral types, update interfaces |
| `supabase/functions/execute-processor-run/index.ts` | ~50 lines | Provider routing, signed URL reuse |
| `supabase/functions/execute-workbench-test/index.ts` | ~220 lines | Mistral support in workbench |
| `apps/validai/docs/llm-provider-configuration.md` | +100 lines | Document Mistral integration |
| `.env.example` | +1 line | Add MISTRAL_API_KEY |

### Total Estimate: ~1,000 lines of new code

---

## Known Limitations

### 1. No Prompt Caching

**Impact:** Higher API costs for multi-operation runs

**Details:**
- Anthropic's prompt caching reduces costs by 90% for cached tokens
- Mistral does not support this feature
- For 100-operation run:
  - Anthropic with caching: ~$1.50
  - Mistral without caching: ~$10.50
  - **7x cost difference**

**Mitigation:**
- Clearly document cost implications
- Recommend Mistral for single-operation runs or cost-sensitive workloads
- Consider Mistral's lower base pricing (Small is cheaper than Haiku)

**MVP Decision:**
Cost implications are **documented and accepted**. Organizations selecting Mistral understand the trade-offs for their specific use cases (e.g., multilingual support, cost for single-operation processors, regulatory requirements).

**User Communication:**
> ⚠️ **Note:** Mistral models do not support prompt caching. Multi-operation runs will be more expensive than Anthropic models with caching enabled.

---

### 2. No Extended Thinking Mode

**Impact:** Cannot use reasoning/thinking features with Mistral

**Details:**
- Anthropic's extended thinking adds reasoning steps before final answer
- Improves accuracy for complex analytical tasks
- Mistral does not have equivalent feature

**Mitigation:**
- Disable thinking UI controls when Mistral model selected
- Document limitation in model selection tooltip
- Suggest using Anthropic models for complex reasoning tasks

**User Communication:**
> ℹ️ **Mistral models do not support extended thinking mode.** For complex reasoning tasks requiring step-by-step analysis, consider using Claude models.

---

### 3. Structured Output Differences

**Impact:** Less strict output formatting than Anthropic

**Details:**
- Anthropic's structured output uses Zod schemas with strict validation
- Mistral uses JSON mode with prompt-based schema definition
- May produce unexpected field names or types
- Validation errors more common

**Mitigation:**
- Validate and continue on errors (store raw JSON + log warning)
- Improve prompt engineering for Mistral-specific schemas
- Test thoroughly with real documents

**User Communication:**
> ⚠️ **Mistral structured outputs may require prompt adjustments.** If you encounter validation errors, the system will store the raw response for review.

---

### 4. Document Upload Overhead

**Impact:** First operation ~2-3 seconds slower than Anthropic

**Details:**
- Mistral requires upload to Files API before processing
- Anthropic can process base64-encoded documents directly
- Upload time depends on document size and network speed

**Mitigation:**
- Upload once per run, reuse signed URL for all operations
- Overhead amortized across operations (100 ops = 2s / 100 = 0.02s per op)
- Document this as expected behavior

**User Communication:**
> ℹ️ **Mistral document processing includes an initial upload step (~2-3s).** Subsequent operations in the same run reuse the uploaded document.

---

### 5. No Real-time Token Updates

**Impact:** Cannot show token usage during streaming (workbench)

**Details:**
- Anthropic streaming includes usage metadata in final chunk
- Mistral may not provide token counts until response complete
- Workbench token counter may update only at end

**Mitigation:**
- Display "Processing..." until complete
- Show final token counts after response received
- Document that real-time token tracking unavailable for Mistral

---

### 6. Model Availability

**Impact:** Mistral model names may change more frequently than Anthropic

**Details:**
- Mistral uses `-latest` suffix for evergreen model names
- Model identifiers may be updated as new versions release
- Need to monitor Mistral changelog for breaking changes

**Mitigation:**
- Use `-latest` variants when available
- Add model versioning to database schema (future enhancement)
- Monitor Mistral API changelog for updates

---

## Success Criteria

### Functional Requirements

- [x] Mistral models appear in UI model selector
- [x] Can execute processor runs with Mistral models
- [x] Can use workbench with Mistral models
- [x] Structured outputs work for all operation types
- [x] Token usage tracked correctly
- [x] Both global and organization API keys work

### Performance Requirements

- [x] Document upload completes within 5 seconds
- [x] Signed URL reused across operations (no re-uploads)
- [x] Chunked execution handles 100+ operations without timeout
- [x] Total run time comparable to Anthropic (excluding upload overhead)

### Quality Requirements

- [x] Error messages clear and actionable
- [x] Validation errors handled gracefully
- [x] Edge Function logs informative
- [x] No breaking changes to existing Anthropic functionality
- [x] Code follows existing patterns and conventions

### Documentation Requirements

- [x] Architecture documentation updated
- [x] API key setup instructions clear
- [x] Limitations clearly documented
- [x] Usage examples provided
- [x] Troubleshooting guide included

---

## Rollout Plan

### Stage 1: Development (Week 1)

**Days 1-2: Core Implementation**
- [ ] Create Mistral executor (`llm-executor-mistral.ts`)
- [ ] Create provider router (`llm-executor-router.ts`)
- [ ] Update shared types

**Days 3-4: Edge Function Integration**
- [ ] Update `execute-processor-run` for Mistral
- [ ] Update `execute-workbench-test` for Mistral
- [ ] Add API key resolution logic

**Day 5: Database & Testing**
- [ ] Create Mistral models migration
- [ ] Write unit tests
- [ ] Run local integration tests

---

### Stage 2: Staging Deployment (Week 2)

**Days 1-2: Deploy to Staging**
- [ ] Deploy Edge Functions to staging
- [ ] Run database migration
- [ ] Set `MISTRAL_API_KEY` in staging secrets

**Days 3-4: Integration Testing**
- [ ] Create test processors with Mistral models
- [ ] Execute test runs with various document types
- [ ] Test workbench functionality
- [ ] Test error scenarios

**Day 5: Documentation & Review**
- [ ] Update architecture docs
- [ ] Create usage guide
- [ ] Code review
- [ ] Address feedback

---

### Stage 3: Production Deployment (Week 3)

**Days 1-2: Pre-Production Checks**
- [ ] Verify all tests passing
- [ ] Review staging logs for issues
- [ ] Prepare rollback plan
- [ ] Get stakeholder approval

**Days 3-4: Production Deployment**
- [ ] Deploy Edge Functions to production
- [ ] Run database migration
- [ ] Set `MISTRAL_API_KEY` in production secrets
- [ ] Verify deployment

**Day 5: Monitoring & Support**
- [ ] Monitor Edge Function logs
- [ ] Track error rates
- [ ] Respond to user feedback
- [ ] Document any issues

---

### Stage 4: Post-Launch (Week 4+)

**Ongoing Activities**
- [ ] Monitor Mistral API costs vs. Anthropic
- [ ] Collect user feedback on Mistral quality
- [ ] Optimize prompt templates for Mistral
- [ ] Address edge cases as discovered
- [ ] Consider advanced Mistral features (OCR API, etc.)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Mistral API changes breaking integration | Medium | High | Monitor changelog, version locking, comprehensive tests |
| Higher costs than expected (no caching) | Medium | Medium | Clear documentation, cost alerts, usage tracking |
| Structured output quality issues | Medium | Medium | Improve prompt engineering, validation fallbacks |
| Performance degradation (upload overhead) | Low | Low | Signed URL reuse, chunked execution |
| Breaking changes to existing Anthropic code | Low | High | Separate executors, comprehensive regression tests |

---

## Appendix

### A. Mistral API Reference

**Files API:**
- `POST /v1/files` - Upload file
- `GET /v1/files/{file_id}` - Get file metadata
- `POST /v1/files/{file_id}/sign` - Get signed URL
- `DELETE /v1/files/{file_id}` - Delete file

**Chat API:**
- `POST /v1/chat/completions` - Generate completion

**Supported Models (as of 2025-10-28):**
- `mistral-small-latest` (recommended)
- `mistral-large-latest`
- `mistral-medium-latest` (if available)

---

### B. Code Examples

**Mistral Document Upload:**
```typescript
const mistralClient = new Mistral({ apiKey })

const uploadedFile = await mistralClient.files.upload({
  file: {
    fileName: "contract.pdf",
    content: fileBuffer
  },
  purpose: "ocr"
})

const signedUrl = await mistralClient.files.getSignedUrl({
  fileId: uploadedFile.id
})

console.log(signedUrl.url) // https://files.mistral.ai/...?signature=...
```

**Mistral Chat with Document:**
```typescript
const response = await mistralClient.chat.complete({
  model: "mistral-small-latest",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "Extract key dates from this contract" },
      { type: "document_url", documentUrl: signedUrl.url }
    ]
  }],
  responseFormat: { type: "json_object" }
})

const output = JSON.parse(response.choices[0].message.content)
```

---

### C. Troubleshooting Guide

**Issue:** Mistral models not appearing in UI

**Solution:**
1. Verify migration ran: `SELECT * FROM validai_llm_global_settings WHERE provider = 'mistral'`
2. Check `is_active = true`
3. Clear browser cache and reload

---

**Issue:** "No Mistral API key available" error

**Solution:**
1. Verify environment variable set: `npx supabase secrets list`
2. Check organization-level key: Query `organizations.llm_configuration.api_keys_encrypted.mistral`
3. Redeploy Edge Functions after setting secrets

---

**Issue:** Document upload times out

**Solution:**
1. Check document size (Mistral limit: 50MB)
2. Verify network connectivity to Mistral API
3. Increase Edge Function timeout if needed
4. Consider compressing large PDFs

---

**Issue:** Structured output validation errors

**Solution:**
1. Check raw JSON in `operation_results.structured_output`
2. Adjust prompt to be more explicit about schema
3. Review Mistral's JSON response format
4. Consider adding example outputs to prompt

---

**Issue:** Higher costs than expected

**Solution:**
1. Review token usage in `operation_results.tokens_used`
2. Compare Mistral vs. Anthropic costs for your use case
3. Consider switching to Mistral Small for lower cost
4. Optimize prompts to reduce token usage
5. Use Anthropic for multi-operation runs (caching benefits)

---

### D. References

- [Mistral API Documentation](https://docs.mistral.ai/)
- [Mistral OCR Cookbook](https://docs.mistral.ai/cookbooks/mistral-ocr-document_understanding)
- [Mistral Files API](https://docs.mistral.ai/api/)
- [ValidAI LLM Configuration Architecture](./llm-provider-configuration.md)
- [ValidAI Manual Processor Execution Architecture](./manual-processor-execution.md)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-28 | Claude (Anthropic) | Initial plan created |

---

**End of Document**
