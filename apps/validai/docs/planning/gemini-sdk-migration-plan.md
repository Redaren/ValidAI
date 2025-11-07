# Migration Plan: Google Gemini SDK (@google/generative-ai → @google/genai)

**Date:** 2025-11-07
**Status:** In Progress
**Priority:** High (Legacy SDK EOL: August 31, 2025)

## Executive Summary

Migrate ValidAI's Google Gemini integration from the deprecated `@google/generative-ai@0.21.0` SDK to the production-ready `@google/genai@1.29.0` SDK.

**Key Drivers:**
- Legacy SDK support ends August 31, 2025
- New SDK provides better developer experience
- Unified architecture for all Google GenAI models
- Improved caching and file handling APIs
- Full TypeScript support

**Impact:** All Gemini-based document processing operations

**Estimated Effort:** 7.5 hours

## Current State

### Existing Implementation

**SDK Version:** `@google/generative-ai@0.21.0` (DEPRECATED)

**Key Files:**
- `supabase/functions/_shared/llm-executor-gemini.ts` (578 lines)
- `supabase/functions/execute-processor-run/index.ts` (Gemini integration)
- `supabase/functions/deno.json` (dependencies)

**Current Flow:**
1. **File Upload:** Manual REST API (2-step resumable upload)
2. **Cache Creation:** `GoogleAICacheManager.create()`
3. **Model Init:** `genAI.getGenerativeModelFromCachedContent(cacheName)`
4. **Execution:** `model.generateContent()`
5. **Response:** `response.response.text()`

**Features Working:**
- ✅ Document upload to Gemini File API
- ✅ Cache creation with 5-minute TTL
- ✅ Structured output via JSON schema
- ✅ Cache reuse across multiple operations
- ✅ Token usage tracking (including cached tokens)

## Target State

### New Implementation

**SDK Version:** `@google/genai@1.29.0` (GA - Production Ready)

**New Flow:**
1. **File Upload:** `ai.files.upload()` API
2. **Cache Creation:** `ai.caches.create()` API
3. **Model Init:** Unified client pattern
4. **Execution:** `ai.models.generateContent({ config: { cachedContent } })`
5. **Response:** `response.text` (direct property)

**Architecture Change:**
- **OLD:** Separate client classes per feature
- **NEW:** Unified `GoogleGenAI` client with service namespaces (`ai.files`, `ai.caches`, `ai.models`)

## Migration Phases

### Phase 1: Documentation ✅ COMPLETE

**Objective:** Create comprehensive migration documentation

**Deliverables:**
- [x] `gemini-sdk-migration-plan.md` - This document
- [x] `gemini-new-sdk-research.md` - Research findings

**Time:** 30 minutes

### Phase 2: Update Dependencies

**Objective:** Update deno.json to use new SDK

**File:** `supabase/functions/deno.json`

**Changes:**
```diff
{
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.ns", "deno.unstable"]
  },
  "imports": {
    "supabase": "https://esm.sh/@supabase/supabase-js@2",
-   "@google/generative-ai": "https://esm.sh/@google/generative-ai@0.21.0",
+   "@google/genai": "npm:@google/genai@1.29.0",
    "zod-to-json-schema": "https://esm.sh/zod-to-json-schema@3.23.0"
  }
}
```

**Time:** 5 minutes

### Phase 3: Refactor llm-executor-gemini.ts

**Objective:** Update all Gemini executor functions to use new SDK

**File:** `supabase/functions/_shared/llm-executor-gemini.ts`

#### 3.1 Update Imports

```diff
- import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0'
- import { GoogleAICacheManager } from 'npm:@google/generative-ai@0.21.0/server'
+ import { GoogleGenAI } from 'npm:@google/genai@1.29.0'
  import { zodToJsonSchema } from 'npm:zod-to-json-schema@3.23.0'
  import { z } from 'npm:zod'
```

#### 3.2 Refactor uploadDocumentToGemini()

**Current:** Lines 152-218 (67 lines) - Manual REST API

**New Pattern:**
```typescript
export async function uploadDocumentToGemini(
  ai: GoogleGenAI,
  documentBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string = 'application/pdf'
): Promise<{ name: string; uri: string; mimeType: string }> {
  try {
    console.log(`[Gemini] Uploading document: ${fileName} (${documentBuffer.byteLength} bytes)`)

    // Convert ArrayBuffer to Blob for SDK upload
    const blob = new Blob([documentBuffer], { type: mimeType })

    const file = await ai.files.upload({
      file: blob,
      config: {
        displayName: fileName,
        mimeType: mimeType
      }
    })

    console.log(`[Gemini] File uploaded: ${file.uri}`)
    console.log(`[Gemini] File name: ${file.name}`)
    console.log(`[Gemini] File valid for 48 hours`)

    return {
      name: file.name,      // For cleanup
      uri: file.uri,        // For cache creation
      mimeType: file.mimeType
    }
  } catch (error: any) {
    console.error('[Gemini] File upload failed:', error.message)
    throw new Error(`Gemini file upload failed: ${error.message}`)
  }
}
```

**Key Changes:**
- Replace manual REST API with `ai.files.upload()`
- Convert ArrayBuffer to Blob
- Return file.name for cleanup
- Simplified error handling

#### 3.3 Refactor createGeminiCache()

**Current:** Lines 209-248 (40 lines) - `GoogleAICacheManager.create()`

**New Pattern:**
```typescript
export async function createGeminiCache(
  ai: GoogleGenAI,
  modelName: string,
  fileUri: string,
  mimeType: string,
  systemPrompt: string
): Promise<string> {
  try {
    console.log(`[Gemini] Creating cache for model: ${modelName}`)

    const cache = await ai.caches.create({
      model: modelName,  // No 'models/' prefix needed
      config: {
        contents: [{
          role: 'user',
          parts: [
            { text: 'Here is a document. Analyze it according to the instructions that follow.' },
            { fileData: { fileUri, mimeType } }
          ]
        }],
        systemInstruction: systemPrompt || 'You are a helpful AI assistant that analyzes documents and provides structured responses.',
        ttl: '300s'  // 5 minutes
      }
    })

    console.log(`[Gemini] Cache created: ${cache.name}`)
    console.log(`[Gemini] Cache expires: ${cache.expireTime}`)

    return cache.name  // Format: cachedContents/{id}
  } catch (error: any) {
    console.error('[Gemini] Cache creation failed:', error.message)
    throw new Error(`Gemini cache creation failed: ${error.message}`)
  }
}
```

**Key Changes:**
- Replace `GoogleAICacheManager` with `ai.caches.create()`
- Unified config object
- Auto-handled model name prefix
- Direct cache name return

#### 3.4 Refactor cleanupGeminiCache()

**Current:** Lines 259-273 (15 lines)

**New Pattern:**
```typescript
export async function cleanupGeminiCache(
  ai: GoogleGenAI,
  cacheName: string
): Promise<void> {
  try {
    console.log(`[Gemini] Cleaning up cache: ${cacheName}`)
    await ai.caches.delete({ name: cacheName })
    console.log(`[Gemini] Cache deleted successfully`)
  } catch (error: any) {
    // Non-critical error - cache will auto-expire in 5 minutes
    console.warn(`[Gemini] Cache cleanup failed (non-critical):`, error.message)
  }
}
```

**New Function: cleanupGeminiFile()**
```typescript
export async function cleanupGeminiFile(
  ai: GoogleGenAI,
  fileName: string
): Promise<void> {
  try {
    console.log(`[Gemini] Cleaning up file: ${fileName}`)
    await ai.files.delete({ name: fileName })
    console.log(`[Gemini] File deleted successfully`)
  } catch (error: any) {
    // Non-critical error - file will auto-delete in 48 hours
    console.warn(`[Gemini] File cleanup failed (non-critical):`, error.message)
  }
}
```

#### 3.5 Refactor executeLLMOperationGemini()

**Current:** Lines 289-454 (166 lines) - Uses `getGenerativeModelFromCachedContent()`

**New Pattern:**
```typescript
export async function executeLLMOperationGemini(
  params: LLMExecutionParams,
  supabase: any,
  cacheRef: GeminiCacheRef
): Promise<LLMExecutionResult> {
  const { operation, settings } = params
  const apiKey = settings.api_key || Deno.env.get('GOOGLE_API_KEY')

  if (!apiKey) {
    throw new Error('No Google API key available')
  }

  const ai = new GoogleGenAI({ apiKey })

  // Get operation schema and convert to JSON Schema
  const operationSchema = getOperationTypeSchema(operation.operation_type)
  const jsonSchema = zodToJsonSchema(operationSchema, {
    name: `${operation.operation_type}Schema`,
    $refStrategy: 'none'  // Inline all references
  })

  // Clean the schema - remove fields Google doesn't accept
  const cleanedSchema = { ...jsonSchema }
  delete cleanedSchema.$schema
  delete cleanedSchema.definitions
  delete cleanedSchema.$ref

  const startTime = Date.now()

  try {
    console.log(`[Gemini] Executing ${operation.operation_type} operation with cached document`)

    // NEW: Unified API call
    const response = await ai.models.generateContent({
      model: settings.model,
      contents: operation.prompt,  // Simplified - just the prompt text
      config: {
        cachedContent: cacheRef.cacheName,  // Reference to cached content
        temperature: settings.temperature ?? 1.0,
        maxOutputTokens: settings.max_tokens ?? 8192,
        topP: settings.top_p,
        topK: settings.top_k,
        responseMimeType: 'application/json',
        responseSchema: cleanedSchema
      }
    })

    const executionTime = Date.now() - startTime

    // NEW: Direct .text property
    const rawText = response.text
    console.log(`[Gemini] Response received (${rawText.length} chars in ${executionTime}ms)`)

    // Parse and validate JSON
    let parsedResult: any
    try {
      parsedResult = JSON.parse(rawText)
    } catch (parseError: any) {
      console.error('[Gemini] JSON parse failed:', parseError.message)
      throw new Error(`Failed to parse Gemini response as JSON: ${parseError.message}`)
    }

    // Validate against operation schema
    let validatedResult: any
    try {
      validatedResult = operationSchema.parse(parsedResult)
      console.log('[Gemini] Result validated successfully')
    } catch (validationError: any) {
      console.error('[Gemini] Schema validation failed:', validationError.message)
      throw new Error(`Gemini response failed schema validation: ${validationError.message}`)
    }

    // NEW: Direct usage metadata access
    const usageMetadata = response.usageMetadata
    const totalTokens = usageMetadata?.totalTokenCount || 0
    const cachedTokens = usageMetadata?.cachedContentTokenCount || 0
    const promptTokens = usageMetadata?.promptTokenCount || 0
    const completionTokens = usageMetadata?.candidatesTokenCount || 0

    console.log(`[Gemini] Token usage: ${totalTokens} total, ${cachedTokens} cached`)

    return {
      result: validatedResult,
      raw_llm_response: rawText,
      execution_time_ms: executionTime,
      tokens_used: totalTokens,
      cached_tokens: cachedTokens,
      provider_metadata: {
        model: settings.model,
        provider: 'google',
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        cachedTokens: cachedTokens,
        totalTokens: totalTokens
      }
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime
    console.error(`[Gemini] Operation failed after ${executionTime}ms:`, error.message)

    // Map error types for retry logic
    const errorType = classifyGeminiError(error)

    throw {
      ...error,
      type: errorType,
      isTransient: errorType === 'rate_limit' || errorType === 'service_unavailable'
    }
  }
}
```

**Key Changes:**
- NEW: Initialize `GoogleGenAI` client
- NEW: Unified `ai.models.generateContent()` call
- NEW: Direct `response.text` property (not `response.response.text()`)
- NEW: Direct `response.usageMetadata` access
- Simplified contents (just prompt string, cache has document)
- Same validation logic (Zod schema)

#### 3.6 Update GeminiCacheRef Interface

**Current:**
```typescript
export interface GeminiCacheRef {
  fileUri: string
  cacheName: string
}
```

**New:**
```typescript
export interface GeminiCacheRef {
  fileUri: string      // File URI from ai.files.upload()
  fileName: string     // File name for cleanup (NEW)
  cacheName: string    // Cache name from ai.caches.create()
}
```

**Time:** 2 hours

### Phase 4: Update execute-processor-run Edge Function

**Objective:** Update integration points to use new SDK patterns

**File:** `supabase/functions/execute-processor-run/index.ts`

#### 4.1 Update Imports (Top of file)

```diff
+ import { GoogleGenAI } from 'npm:@google/genai@1.29.0'
  import {
    uploadDocumentToGemini,
    createGeminiCache,
-   cleanupGeminiCache
+   cleanupGeminiCache,
+   cleanupGeminiFile
  } from '../_shared/llm-executor-gemini.ts'
```

#### 4.2 Update Document Upload & Cache Creation (Lines 393-446)

**Current Pattern:**
```typescript
if (provider === 'google') {
  let geminiApiKey: string
  // ... resolve API key

  const geminiFileResult = await uploadDocumentToGemini(
    geminiApiKey, documentBuffer, document.name, document.mime_type
  )
  geminiFileUri = geminiFileResult.fileUri

  geminiCacheName = await createGeminiCache(
    geminiApiKey, llmConfig.model, geminiFileUri, ...
  )
}
```

**New Pattern:**
```typescript
if (provider === 'google') {
  // Resolve Google API key
  let geminiApiKey: string
  if (llmConfig.api_key_encrypted) {
    const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: llmConfig.api_key_encrypted,
      p_org_id: llmConfig.organization_id
    })
    if (decryptError || !decryptedKey) {
      console.error(`Failed to decrypt Google API key: ${decryptError?.message}`)
      throw new Error('Google API key decryption failed')
    }
    geminiApiKey = decryptedKey
  } else {
    const globalKey = Deno.env.get('GOOGLE_API_KEY')
    if (!globalKey) {
      console.error('No Google API key available (org or environment)')
      throw new Error('No Google API key configured')
    }
    geminiApiKey = globalKey
  }
  console.log('Google API key resolved successfully')

  // Initialize GoogleGenAI client
  const ai = new GoogleGenAI({ apiKey: geminiApiKey })

  // Upload document using new SDK
  const documentBuffer = await downloadDocument(supabase, document.storage_path)
  const geminiFile = await uploadDocumentToGemini(
    ai,  // NEW: Pass client instance
    documentBuffer,
    document.name,
    document.mime_type
  )
  geminiFileUri = geminiFile.uri
  geminiFileName = geminiFile.name  // NEW: Store for cleanup

  console.log(`[Google] Document uploaded: ${geminiFileUri}`)

  // Create cache using new SDK
  geminiCacheName = await createGeminiCache(
    ai,  // NEW: Pass client instance
    llmConfig.model,
    geminiFileUri,
    document.mime_type || 'application/pdf',
    baseSystemPrompt
  )

  console.log(`[Google] Cache created: ${geminiCacheName}`)
}
```

#### 4.3 Update Snapshot Storage (Lines 459-498)

**Current:**
```typescript
cached_document_reference: provider === 'google'
  ? JSON.stringify({ fileUri: geminiFileUri, cacheName: geminiCacheName })
  : ...
```

**New:**
```typescript
cached_document_reference: provider === 'google'
  ? JSON.stringify({
      fileUri: geminiFileUri,
      fileName: geminiFileName,  // NEW: Include for cleanup
      cacheName: geminiCacheName
    })
  : ...
```

#### 4.4 Update Cleanup Section (Lines 888-906)

**Current:**
```typescript
if (provider === 'google' && geminiCacheName) {
  await cleanupGeminiCache(geminiApiKey, geminiCacheName)
}
```

**New:**
```typescript
if (provider === 'google') {
  // Reinitialize client for cleanup
  const ai = new GoogleGenAI({ apiKey: geminiApiKey })

  // Cleanup cache
  if (geminiCacheName) {
    await cleanupGeminiCache(ai, geminiCacheName)
  }

  // Cleanup uploaded file (NEW)
  if (geminiFileName) {
    await cleanupGeminiFile(ai, geminiFileName)
  }
}
```

**Time:** 1 hour

### Phase 5: Update Type Definitions

**Objective:** Ensure all TypeScript types are correct for new SDK

**Files to Check:**
- `supabase/functions/_shared/types.ts`
- `supabase/functions/_shared/llm-executor-gemini.ts`

**Changes:**
- ✅ `GeminiCacheRef` interface updated (see Phase 3.6)
- ✅ All function signatures updated to accept `GoogleGenAI` client

**Time:** 30 minutes

### Phase 6: Testing Strategy

**Objective:** Comprehensive testing before production deployment

#### 6.1 Local Testing (Deno)

Create test file: `supabase/functions/_shared/llm-executor-gemini.test.ts`

```typescript
import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts"
import { GoogleGenAI } from "npm:@google/genai@1.29.0"
import {
  uploadDocumentToGemini,
  createGeminiCache,
  cleanupGeminiCache,
  cleanupGeminiFile
} from "./llm-executor-gemini.ts"

const apiKey = Deno.env.get('GOOGLE_API_KEY')!

Deno.test("File upload and cleanup", async () => {
  const ai = new GoogleGenAI({ apiKey })
  const testContent = "This is a test document for ValidAI Gemini integration."
  const testBuffer = new TextEncoder().encode(testContent).buffer

  // Upload
  const file = await uploadDocumentToGemini(
    ai,
    testBuffer,
    "test-document.txt",
    "text/plain"
  )

  assertExists(file.uri)
  assertExists(file.name)
  assertEquals(file.mimeType, "text/plain")

  // Cleanup
  await cleanupGeminiFile(ai, file.name)
})

Deno.test("Cache creation and cleanup", async () => {
  const ai = new GoogleGenAI({ apiKey })
  const testContent = "Test document content"
  const testBuffer = new TextEncoder().encode(testContent).buffer

  // Upload file first
  const file = await uploadDocumentToGemini(ai, testBuffer, "test.txt", "text/plain")

  // Create cache
  const cacheName = await createGeminiCache(
    ai,
    "gemini-2.5-flash",
    file.uri,
    file.mimeType,
    "You are a test assistant."
  )

  assertExists(cacheName)

  // Cleanup
  await cleanupGeminiCache(ai, cacheName)
  await cleanupGeminiFile(ai, file.name)
})
```

**Run tests:**
```bash
cd supabase/functions
deno test --allow-env --allow-net _shared/llm-executor-gemini.test.ts
```

#### 6.2 Integration Testing

**Test Document:** Use existing test contract PDF

**Test Scenario:**
1. Create processor with Gemini 2.5 Pro model
2. Upload test document via UI
3. Execute processor run with 7 operations
4. Verify all operations complete successfully
5. Check structured output validates against schemas
6. Verify token usage shows cached tokens
7. Check cleanup succeeded

**Expected Results:**
- ✅ File upload succeeds (returns URI and name)
- ✅ Cache creation succeeds (returns cacheName)
- ✅ All 7 operations execute successfully
- ✅ Structured output matches Zod schemas
- ✅ Token usage shows `cachedContentTokenCount > 0`
- ✅ Execution time similar to legacy SDK
- ✅ Cache cleanup succeeds
- ✅ File cleanup succeeds

#### 6.3 Validation Checklist

**Pre-Deployment:**
- [ ] deno.json updated with @google/genai@1.29.0
- [ ] All imports updated to GoogleGenAI
- [ ] uploadDocumentToGemini() uses ai.files.upload()
- [ ] createGeminiCache() uses ai.caches.create()
- [ ] executeLLMOperationGemini() uses ai.models.generateContent()
- [ ] GeminiCacheRef includes fileName
- [ ] Cleanup functions updated for new SDK
- [ ] TypeScript compilation succeeds
- [ ] No linter errors

**Post-Deployment:**
- [ ] First Gemini request succeeds
- [ ] Structured output validates correctly
- [ ] Cache is reused across operations
- [ ] Token usage includes cached tokens
- [ ] File and cache cleanup succeed
- [ ] No errors in Supabase logs
- [ ] Performance comparable to legacy SDK

**Time:** 2 hours

### Phase 7: Deployment & Monitoring

**Objective:** Deploy to production and monitor for issues

#### 7.1 Pre-Deployment

1. **Commit all changes**
   ```bash
   git add .
   git commit -m "feat: Migrate to @google/genai SDK (v1.29.0)

   - Replace deprecated @google/generative-ai with @google/genai
   - Update file upload to use ai.files.upload() API
   - Update cache creation to use ai.caches.create() API
   - Migrate to unified ai.models.generateContent() pattern
   - Add file cleanup in addition to cache cleanup
   - Update GeminiCacheRef to include fileName
   - Simplify API calls with unified client architecture

   Migration driven by legacy SDK EOL (Aug 31, 2025)

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

2. **Backup current deployment**
   ```bash
   # Document current version number
   echo "Current: Version 32 (legacy SDK)"
   ```

#### 7.2 Deployment

```bash
cd supabase/functions
npx supabase functions deploy execute-processor-run --project-ref xczippkxxdqlvaacjexj
```

**Expected output:**
```
Deployed Functions on project xczippkxxdqlvaacjexj: execute-processor-run
Version: 33
```

#### 7.3 Smoke Testing

**Test 1: Simple Gemini Request**
- Create test processor with Gemini 2.5 Flash
- Execute with 3 operations
- Verify success

**Test 2: Large Document**
- Use 50-page PDF document
- Execute with 7 operations
- Verify cache reuse

**Test 3: Structured Output Validation**
- Test all operation types (extraction, rating, validation, analysis, generic)
- Verify schema validation works

#### 7.4 Monitoring

**Watch for:**
- ✅ Successful file uploads (check logs for file.uri)
- ✅ Successful cache creation (check logs for cacheName)
- ✅ Cache reuse (cachedContentTokenCount > 0)
- ✅ Structured output validation success
- ⚠️ File upload failures
- ⚠️ Cache creation failures
- ⚠️ Schema validation errors
- ⚠️ Increased error rates

**Metrics to Track:**
- Average execution time per operation
- Token usage (total vs cached)
- Success rate (operations completed / attempted)
- Error rate by type

#### 7.5 Rollback Plan

If critical issues detected:

```bash
# 1. Revert deno.json
git checkout HEAD~1 -- supabase/functions/deno.json

# 2. Revert llm-executor-gemini.ts
git checkout HEAD~1 -- supabase/functions/_shared/llm-executor-gemini.ts

# 3. Revert execute-processor-run
git checkout HEAD~1 -- supabase/functions/execute-processor-run/index.ts

# 4. Redeploy
npx supabase functions deploy execute-processor-run --project-ref xczippkxxdqlvaacjexj
```

**Time:** 1 hour

### Phase 8: Documentation Updates

**Objective:** Update all relevant documentation

#### 8.1 Update Technical Documentation

**Files to Update:**

1. **This file** - Mark phases as complete
2. **llm-executor-gemini.ts header** - Update version and SDK info
3. **execute-processor-run comments** - Update inline comments

#### 8.2 Update Header Comments

```typescript
/**
 * Google Gemini LLM Executor
 *
 * @module _shared/llm-executor-gemini
 * @description
 * Executes LLM operations using Google Gemini models with context caching.
 * Uses @google/genai SDK (v1.29.0) - Production-ready GA release.
 *
 * ## SDK Migration
 * - Migrated from @google/generative-ai@0.21.0 (deprecated)
 * - Migration date: 2025-11-07
 * - Reason: Legacy SDK EOL August 31, 2025
 *
 * ## Key Features
 * - Unified client architecture (GoogleGenAI)
 * - File API: ai.files.upload()
 * - Cache API: ai.caches.create()
 * - Model API: ai.models.generateContent()
 * - Structured output via JSON schema
 * - 5-minute cache TTL for cost optimization
 *
 * @version 2.0.0
 * @since 2025-11-07
 */
```

#### 8.3 Create Migration Summary

Add to this file:

```markdown
## Migration Results

**Deployment:** Version 33
**Date:** 2025-11-07
**Status:** ✅ Success / ⚠️ Issues / ❌ Rolled Back

### Metrics

| Metric | Legacy SDK | New SDK | Change |
|--------|-----------|---------|--------|
| Avg Execution Time | XXms | XXms | +X% / -X% |
| Token Cost (cached) | XX tokens | XX tokens | -X% |
| Cache Hit Rate | XX% | XX% | +X% |
| Error Rate | X% | X% | ±X% |

### Issues Encountered

(None / List any issues)

### Lessons Learned

(Document any insights from migration)
```

**Time:** 30 minutes

## API Comparison Reference

### File Upload

| Aspect | Legacy SDK | New SDK |
|--------|-----------|---------|
| **Import** | Manual REST API | `import { GoogleGenAI }` |
| **Method** | `fetch()` 2-step upload | `ai.files.upload()` |
| **Input** | ArrayBuffer | Blob or file path |
| **Output** | `{ fileUri, mimeType }` | `{ name, uri, mimeType, ...}` |
| **Lines of Code** | 67 lines | ~15 lines |

### Cache Creation

| Aspect | Legacy SDK | New SDK |
|--------|-----------|---------|
| **Import** | `GoogleAICacheManager` | `GoogleGenAI` |
| **Method** | `cacheManager.create()` | `ai.caches.create()` |
| **Config** | Scattered params | Single `config` object |
| **Model Prefix** | Manual `models/` | Auto-handled |
| **Output** | `cacheName` string | Cache object with metadata |

### Model Execution

| Aspect | Legacy SDK | New SDK |
|--------|-----------|---------|
| **Init** | `getGenerativeModelFromCachedContent()` | `ai.models.generateContent()` |
| **Contents** | Array of Content objects | String or Content array |
| **Config** | `generationConfig` param | `config` object |
| **Cache Ref** | Via model init | Via `config.cachedContent` |
| **Response** | `response.response.text()` | `response.text` |
| **Usage** | `usageMetadata` object | `response.usageMetadata` |

### Complete Example

**Legacy SDK:**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai@0.21.0'
import { GoogleAICacheManager } from '@google/generative-ai@0.21.0/server'

const genAI = new GoogleGenerativeAI(apiKey)
const cacheManager = new GoogleAICacheManager(apiKey)

// Upload (manual REST)
const fileUri = await uploadViaREST(...)

// Cache
const cache = await cacheManager.create({
  model: 'models/gemini-2.5-pro',
  ttl: '300s',
  systemInstruction: { parts: [{ text: prompt }] },
  contents: [{ role: 'user', parts: [{ fileData: { fileUri, mimeType } }] }]
})

// Execute
const model = genAI.getGenerativeModelFromCachedContent(cache.name)
const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  generationConfig: { temperature: 0.7, responseMimeType: 'application/json', responseSchema: schema }
})

const text = result.response.text()
```

**New SDK:**
```typescript
import { GoogleGenAI } from '@google/genai@1.29.0'

const ai = new GoogleGenAI({ apiKey })

// Upload
const file = await ai.files.upload({
  file: blob,
  config: { displayName: name, mimeType }
})

// Cache
const cache = await ai.caches.create({
  model: 'gemini-2.5-pro',
  config: {
    systemInstruction: prompt,
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: file.uri, mimeType } }] }],
    ttl: '300s'
  }
})

// Execute
const response = await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents: userPrompt,
  config: {
    cachedContent: cache.name,
    temperature: 0.7,
    responseMimeType: 'application/json',
    responseSchema: schema
  }
})

const text = response.text
```

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Deno runtime incompatibility with new SDK | Low | High | Test in staging first |
| Blob API not available in Deno | Low | High | Use ArrayBuffer wrapper if needed |
| Breaking changes in API responses | Low | Medium | Comprehensive testing |
| Performance degradation | Low | Medium | Monitor metrics closely |
| File cleanup failures | Medium | Low | Non-critical, auto-delete after 48h |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Increased operation failures | Low | High | Rollback plan ready |
| Cost increase from failed uploads | Low | Medium | Monitor file/cache usage |
| User-facing errors | Low | High | Staged rollout, monitoring |
| Data loss during migration | Very Low | Critical | No data migration needed |

## Success Criteria

### Technical Success

✅ **Must Have:**
- All Gemini operations execute successfully
- Structured output validates against Zod schemas
- Token usage shows cached content usage
- File upload/download works in Deno runtime
- Zero regressions in existing functionality
- Cache cleanup succeeds
- File cleanup succeeds

✅ **Should Have:**
- Execution time within ±10% of legacy SDK
- Code reduction (simpler, more maintainable)
- Better error messages from new SDK
- Improved type safety

✅ **Nice to Have:**
- Performance improvements
- Reduced boilerplate code
- Better debugging experience

### Business Success

✅ **Must Have:**
- No increase in operation failure rate
- No customer-facing errors
- Successful migration before EOL deadline

✅ **Should Have:**
- Token cost reduction from improved caching
- Faster time to implement future Gemini features
- Better developer experience for team

## Timeline

| Phase | Duration | Start | End | Status |
|-------|----------|-------|-----|--------|
| Phase 1: Documentation | 30 min | 2025-11-07 | 2025-11-07 | ✅ Complete |
| Phase 2: Dependencies | 5 min | 2025-11-07 | 2025-11-07 | 🔄 In Progress |
| Phase 3: Refactor Executor | 2 hours | 2025-11-07 | 2025-11-07 | ⏳ Pending |
| Phase 4: Update Edge Function | 1 hour | 2025-11-07 | 2025-11-07 | ⏳ Pending |
| Phase 5: Type Updates | 30 min | 2025-11-07 | 2025-11-07 | ⏳ Pending |
| Phase 6: Testing | 2 hours | 2025-11-07 | 2025-11-07 | ⏳ Pending |
| Phase 7: Deployment | 1 hour | 2025-11-07 | 2025-11-07 | ⏳ Pending |
| Phase 8: Documentation | 30 min | 2025-11-07 | 2025-11-07 | ⏳ Pending |
| **Total** | **7.5 hours** | | | **10% Complete** |

## Key Learnings

_(To be filled during/after migration)_

### What Went Well


### What Could Be Improved


### Unexpected Challenges


## References

- **Migration Guide:** https://ai.google.dev/gemini-api/docs/migrate
- **New SDK Docs:** https://googleapis.github.io/js-genai/
- **Structured Output:** https://ai.google.dev/gemini-api/docs/structured-output
- **Context Caching:** https://ai.google.dev/gemini-api/docs/caching
- **Files API:** https://ai.google.dev/gemini-api/docs/files
- **npm Package:** https://www.npmjs.com/package/@google/genai

## Appendix

### Code Size Comparison

| File | Legacy Lines | New Lines | Change |
|------|-------------|-----------|--------|
| llm-executor-gemini.ts | 578 | ~450 | -22% |
| execute-processor-run.ts (Gemini section) | ~100 | ~80 | -20% |

### Migration Checklist

**Pre-Migration:**
- [x] Research new SDK capabilities
- [x] Create migration plan
- [x] Document API differences
- [x] Identify all affected files
- [ ] Backup current implementation

**During Migration:**
- [ ] Update dependencies
- [ ] Refactor file upload
- [ ] Refactor cache creation
- [ ] Refactor execution
- [ ] Update types
- [ ] Write tests
- [ ] Code review

**Post-Migration:**
- [ ] Deploy to staging
- [ ] Run integration tests
- [ ] Monitor metrics
- [ ] Deploy to production
- [ ] Document results
- [ ] Update team documentation

---

**Document Version:** 1.0
**Last Updated:** 2025-11-07
**Next Review:** After Phase 7 completion
