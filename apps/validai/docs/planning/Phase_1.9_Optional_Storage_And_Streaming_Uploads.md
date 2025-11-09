# Phase 1.9: Optional Storage & Streaming Uploads

**Status:** 📋 Planning
**Created:** 2025-11-09
**Target Completion:** TBD

## Table of Contents

- [Overview](#overview)
- [Phase 1: Make Storage Optional](#phase-1-make-storage-optional)
- [Phase 2: Streamable Upload Support](#phase-2-streamable-upload-support)
- [Implementation Order](#implementation-order)
- [Testing Strategy](#testing-strategy)
- [Rollback Plan](#rollback-plan)

---

## Overview

### Goals

1. **Phase 1:** Enable direct file upload to Edge Function, bypassing Supabase Storage
   - Reduce latency by 3-7 seconds (eliminate Storage round trip)
   - Make Storage optional for use cases that don't need persistence
   - Maintain backward compatibility with existing Storage flow

2. **Phase 2:** Implement streaming upload for memory efficiency ⚠️ **DEFERRED - See Investigation Results**
   - Eliminate Edge Function memory buffering
   - Enable larger file support (>500MB)
   - **Note:** Requires custom HTTP implementation (SDK doesn't support streaming)

### Non-Goals

- ❌ Remove Storage entirely (still needed for audit trail, re-runs)
- ❌ Change Steps D→E (Gemini upload, cache, operations)
- ❌ Modify existing run detail/list pages
- ❌ Change authentication/authorization flow

### Success Metrics

**Phase 1: Optional Storage** (Ready to implement)
- ✅ Time to first operation reduced by 3-7 seconds
- ✅ Both Storage and direct upload paths work
- ✅ Support files up to 10MB (buffered)
- ✅ Zero breaking changes to existing runs
- ✅ All tests pass

**Phase 2: Streaming** ⚠️ DEFERRED
- Phase 2 deferred until SDK adds streaming support or file size requirements increase
- See "Gemini Streaming Upload Investigation" section for details

---

## Phase 1: Make Storage Optional

### Architecture Changes

#### Current Flow
```
Browser → Supabase Storage (2-5s) → document_id
       ↓
Edge Function → Download from Storage (1-2s) → Gemini Upload
```

#### New Flow (Storage Optional)
```
Browser → Edge Function (with file in body)
       ↓
Edge Function → Gemini Upload (direct)

OR

Browser → Supabase Storage → document_id
       ↓
Edge Function → Download from Storage → Gemini Upload (existing)
```

### Implementation Steps

#### **Step 1.1: Database Schema Updates**

**File:** `supabase/migrations/20251109000000_optional_document_storage.sql`

```sql
-- Make document_id nullable (runs can exist without Storage)
ALTER TABLE validai_runs
  ALTER COLUMN document_id DROP NOT NULL;

-- Add storage_status tracking
ALTER TABLE validai_runs
  ADD COLUMN storage_status text DEFAULT 'not_stored';
-- Values: 'not_stored' | 'pending' | 'completed' | 'failed'

-- Add comment
COMMENT ON COLUMN validai_runs.storage_status IS
  'Tracks whether document was stored in Supabase Storage. not_stored = direct upload, pending/completed/failed = Storage upload';

-- Ensure snapshot.document always has metadata even without Storage
-- (Already in JSONB, no schema change needed)
```

**Backward Compatibility:**
- Existing runs have `document_id` set → no migration needed
- New runs can have `document_id = NULL` → direct upload
- `storage_status = 'not_stored'` indicates no Storage used

---

#### **Step 1.2: Edge Function Request Schema**

**File:** `supabase/functions/execute-processor-run/index.ts`

**Update request interface:**

```typescript
interface ExecuteProcessorRunRequest {
  processor_id: string

  // EITHER document_id (existing flow)
  document_id?: string

  // OR file_upload (new direct upload flow)
  file_upload?: {
    file: string           // base64 encoded file
    filename: string
    mime_type: string
    size_bytes: number
  }

  // Optional: explicit storage preference
  skip_storage?: boolean  // If true, never store to Supabase Storage
}
```

**Validation logic:**

```typescript
// Validate exactly one of document_id or file_upload provided
if (!document_id && !file_upload) {
  return new Response(
    JSON.stringify({ error: 'Either document_id or file_upload required' }),
    { status: 400 }
  )
}

if (document_id && file_upload) {
  return new Response(
    JSON.stringify({ error: 'Cannot provide both document_id and file_upload' }),
    { status: 400 }
  )
}
```

---

#### **Step 1.3: Edge Function Document Handling**

**File:** `supabase/functions/execute-processor-run/index.ts`

**Add document resolution logic:**

```typescript
// Determine document source and get buffer
let documentBuffer: Buffer
let documentMetadata: DocumentMetadata
let documentId: string | null = null
let storageStatus: string = 'not_stored'

if (body.document_id) {
  // EXISTING PATH: Download from Storage
  console.log(`[Storage] Downloading document: ${body.document_id}`)

  const { data: doc, error: docError } = await supabase
    .from('validai_documents')
    .select('*')
    .eq('id', body.document_id)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${body.document_id}`)
  }

  // Download from Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(doc.storage_path)

  if (downloadError || !fileData) {
    throw new Error(`Failed to download document: ${downloadError?.message}`)
  }

  documentBuffer = Buffer.from(await fileData.arrayBuffer())
  documentMetadata = {
    id: doc.id,
    name: doc.name,
    size_bytes: doc.size_bytes,
    mime_type: doc.mime_type,
    storage_path: doc.storage_path
  }
  documentId = doc.id
  storageStatus = 'completed'

} else if (body.file_upload) {
  // NEW PATH: Direct upload (no Storage)
  console.log(`[Direct Upload] Processing file: ${body.file_upload.filename}`)

  // Validate file size (10MB limit for now)
  if (body.file_upload.size_bytes > 10 * 1024 * 1024) {
    throw new Error('File size exceeds 10MB limit')
  }

  // Decode base64 file
  documentBuffer = Buffer.from(body.file_upload.file, 'base64')

  // Verify decoded size matches
  if (documentBuffer.byteLength !== body.file_upload.size_bytes) {
    throw new Error('File size mismatch after decoding')
  }

  // Create metadata (no storage_path, no id)
  documentMetadata = {
    id: null,  // No database record
    name: body.file_upload.filename,
    size_bytes: body.file_upload.size_bytes,
    mime_type: body.file_upload.mime_type,
    storage_path: null
  }
  documentId = null
  storageStatus = 'not_stored'
}

// Rest of processing uses documentBuffer (same for both paths)
```

**Key Points:**
- Single code path after document resolution
- `documentBuffer` always available regardless of source
- `documentId` nullable (stored in run record)
- `storageStatus` tracks which path was used

---

#### **Step 1.4: Run Snapshot Updates**

**File:** `supabase/functions/execute-processor-run/index.ts`

**Update snapshot creation:**

```typescript
// Create run snapshot (frozen state)
const snapshot: RunSnapshot = {
  processor: {
    id: processor.id,
    name: processor.name,
    system_prompt: processor.system_prompt,
    configuration: processor.configuration
  },
  operations: operations.map(op => ({
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
  document: documentMetadata,  // May have id=null, storage_path=null

  // Provider-specific fields (populated during Gemini/Mistral/Anthropic upload)
  gemini_file_uri: undefined,
  gemini_file_name: undefined,
  gemini_cache_name: undefined,
  gemini_file_mime_type: undefined,
  mistral_document_url: undefined,
  anthropic_file_id: undefined
}

// Insert run record
const { data: run, error: runError } = await supabase
  .from('validai_runs')
  .insert({
    processor_id: processor.id,
    document_id: documentId,  // NULL for direct uploads
    organization_id: processor.organization_id,
    snapshot: snapshot,
    status: 'pending',
    triggered_by: userId,
    trigger_type: 'manual',
    total_operations: operations.length,
    completed_operations: 0,
    failed_operations: 0,
    storage_status: storageStatus,  // NEW: Track storage state
    started_at: new Date().toISOString()
  })
  .select()
  .single()

if (runError || !run) {
  throw new Error(`Failed to create run: ${runError?.message}`)
}
```

**Important:**
- `document_id` can be `NULL` (direct upload)
- `snapshot.document` always has metadata (even if `id=null`)
- `storage_status` indicates which path was used
- No changes to Gemini upload logic (uses `documentBuffer` regardless of source)

---

#### **Step 1.5: Browser/UI Changes**

**File:** `apps/validai/components/processors/run-processor-dialog.tsx`

**Update dialog to use direct upload (no Storage):**

```typescript
interface RunProcessorDialogProps {
  processor: Processor
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RunProcessorDialog({
  processor,
  open,
  onOpenChange
}: RunProcessorDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const createRun = useCreateRun()

  const handleRun = async () => {
    if (!selectedFile) return

    try {
      // TODO: In MVP, we always use direct upload (no Storage).
      // In future, consider adding user option to save document for re-runs.
      // Possible approaches:
      //   1. UI toggle: "Save document for later re-runs"
      //   2. Automatic: Save to Storage in background (non-blocking)
      //   3. Smart: Only save if document used multiple times
      // For now: Keep it simple, optimize for speed.

      console.log('[Direct Upload] Sending file to Edge Function')

      // Convert file to base64
      const base64File = await fileToBase64(selectedFile)

      // Create run with file in request body
      const { data, error } = await createRun.mutateAsync({
        processor_id: processor.id,
        file_upload: {
          file: base64File,
          filename: selectedFile.name,
          mime_type: selectedFile.type,
          size_bytes: selectedFile.size
        }
      })

      if (error) throw error

      // Navigate to run detail
      router.push(`/proc/${processor.id}/runs/${data.run_id}`)
      onOpenChange(false)

    } catch (error) {
      toast.error('Failed to start run', {
        description: error.message
      })
    }
  }

  // ... rest of component
}
```

**Helper function:**

```typescript
// apps/validai/lib/utils/file.ts

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64.split(',')[1]
      resolve(base64Data)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
```

---

#### **Step 1.6: TanStack Query Hook Updates**

**File:** `apps/validai/app/queries/runs.ts`

**Update `useCreateRun` hook:**

```typescript
export function useCreateRun() {
  const supabase = createTypedClient()

  return useMutation({
    mutationFn: async (params: {
      processor_id: string
      document_id?: string
      file_upload?: {
        file: string
        filename: string
        mime_type: string
        size_bytes: number
      }
    }) => {
      // Validate exactly one of document_id or file_upload
      if (!params.document_id && !params.file_upload) {
        throw new Error('Either document_id or file_upload required')
      }

      if (params.document_id && params.file_upload) {
        throw new Error('Cannot provide both document_id and file_upload')
      }

      const { data, error } = await supabase.functions.invoke('execute-processor-run', {
        body: params
      })

      if (error) throw error
      if (!data?.run_id) throw new Error('No run_id returned')

      return data
    },
    onError: (error) => {
      console.error('Failed to create run:', error)
    }
  })
}
```

---

### Phase 1 Testing Strategy

#### **Unit Tests**

```typescript
// supabase/functions/execute-processor-run/index.test.ts

describe('execute-processor-run', () => {
  describe('document resolution', () => {
    it('should handle document_id (Storage path)', async () => {
      const response = await invokeEdgeFunction({
        processor_id: 'test-processor',
        document_id: 'test-document-id'
      })

      expect(response.status).toBe(202)
      expect(response.data.run_id).toBeDefined()
    })

    it('should handle file_upload (direct path)', async () => {
      const fileBase64 = Buffer.from('test content').toString('base64')

      const response = await invokeEdgeFunction({
        processor_id: 'test-processor',
        file_upload: {
          file: fileBase64,
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12
        }
      })

      expect(response.status).toBe(202)
      expect(response.data.run_id).toBeDefined()
    })

    it('should reject if neither document_id nor file_upload', async () => {
      const response = await invokeEdgeFunction({
        processor_id: 'test-processor'
      })

      expect(response.status).toBe(400)
      expect(response.error).toContain('required')
    })

    it('should reject if both document_id and file_upload', async () => {
      const response = await invokeEdgeFunction({
        processor_id: 'test-processor',
        document_id: 'test-doc',
        file_upload: { file: 'base64', filename: 'test.pdf', mime_type: 'application/pdf', size_bytes: 100 }
      })

      expect(response.status).toBe(400)
      expect(response.error).toContain('Cannot provide both')
    })
  })
})
```

#### **Integration Tests**

```typescript
// apps/validai/__tests__/integration/run-processor.test.ts

describe('Processor Run Integration', () => {
  it('should create run with Storage (existing flow)', async () => {
    // Upload document to Storage
    const document = await uploadTestDocument()

    // Create run
    const run = await createRun({
      processor_id: testProcessor.id,
      document_id: document.id
    })

    // Verify run created
    expect(run.run_id).toBeDefined()
    expect(run.status).toBe('pending')

    // Verify run record
    const { data: runRecord } = await supabase
      .from('validai_runs')
      .select('*')
      .eq('id', run.run_id)
      .single()

    expect(runRecord.document_id).toBe(document.id)
    expect(runRecord.storage_status).toBe('completed')
  })

  it('should create run with direct upload (new flow)', async () => {
    // Get test file
    const file = await loadTestFile('test-contract.pdf')
    const base64 = await fileToBase64(file)

    // Create run with direct upload
    const run = await createRun({
      processor_id: testProcessor.id,
      file_upload: {
        file: base64,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size
      }
    })

    // Verify run created
    expect(run.run_id).toBeDefined()
    expect(run.status).toBe('pending')

    // Verify run record
    const { data: runRecord } = await supabase
      .from('validai_runs')
      .select('*')
      .eq('id', run.run_id)
      .single()

    expect(runRecord.document_id).toBeNull()
    expect(runRecord.storage_status).toBe('not_stored')
    expect(runRecord.snapshot.document.name).toBe(file.name)
  })
})
```

#### **E2E Tests**

```typescript
// e2e/run-processor.spec.ts

test('should create run with direct upload', async ({ page }) => {
  // Navigate to processor detail
  await page.goto('/proc/test-processor-id')

  // Open run dialog
  await page.click('[data-testid="run-processor-button"]')

  // Upload file
  const fileInput = await page.locator('input[type="file"]')
  await fileInput.setInputFiles('test-data/test-contract.pdf')

  // Start run
  await page.click('[data-testid="start-run-button"]')

  // Should navigate to run detail page
  await page.waitForURL(/\/proc\/.*\/runs\/.*/)

  // Verify run is processing
  await expect(page.locator('[data-testid="run-status"]')).toContainText('processing')
})
```

---

### Phase 1 Rollout Plan

#### **Step 1: Deploy Database Migration**

```bash
# Apply migration to add storage_status column
npx supabase db push
```

**Verification:**
```sql
-- Verify column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'validai_runs'
  AND column_name IN ('document_id', 'storage_status');

-- Should show:
-- document_id | uuid | YES
-- storage_status | text | NO (default: 'not_stored')
```

#### **Step 2: Deploy Edge Function (Backward Compatible)**

```bash
# Deploy updated Edge Function
npx supabase functions deploy execute-processor-run
```

**Verification:**
```bash
# Test existing flow (document_id)
curl -X POST "https://[project].supabase.co/functions/v1/execute-processor-run" \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"processor_id":"...","document_id":"..."}'

# Should return HTTP 202 (existing behavior)
```

#### **Step 3: Deploy Frontend (Feature Flag OFF)**

```bash
# Deploy with DIRECT_UPLOAD_ENABLED=false (default)
vercel deploy --prod
```

**Result:** Users continue using Storage flow (no changes visible)

#### **Step 4: Enable Feature Flag for Testing**

```bash
# Enable for staging/testing only
NEXT_PUBLIC_ENABLE_DIRECT_UPLOAD=true vercel deploy --env preview
```

**Internal Testing:**
- Test direct upload with various file sizes
- Verify run detail page works
- Check Edge Function logs for errors
- Verify operations execute correctly

#### **Step 5: Gradual Rollout**

**Week 1:** Enable for internal team (5 users)
- Monitor error rates
- Collect performance metrics
- Gather user feedback

**Week 2:** Enable for beta users (20 users)
- Verify time savings (3-7s improvement)
- Check error logs
- Confirm no Storage-related issues

**Week 3:** Enable for all users
```bash
# Production deployment
NEXT_PUBLIC_ENABLE_DIRECT_UPLOAD=true vercel deploy --prod
```

#### **Monitoring**

```sql
-- Track adoption of direct upload
SELECT
  storage_status,
  COUNT(*) as run_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM validai_runs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY storage_status
ORDER BY run_count DESC;

-- Expected after rollout:
-- not_stored     | 150 | 75.00  (direct upload)
-- completed      |  50 | 25.00  (Storage flow)
-- pending/failed |   0 |  0.00
```

---

## Gemini Streaming Upload Investigation

**Investigation Date:** 2025-11-09
**SDK Version:** `@google/genai` v1.29.0
**Status:** ⚠️ Native streaming NOT supported

### Summary

The current Google Gemini SDK (`@google/genai` v1.29.0) **does not provide native streaming upload capabilities**. All file uploads must be fully buffered in memory before being sent to the Gemini File API.

### Investigation Details

#### SDK Analysis

**Current Upload Method:**
```typescript
// @google/genai v1.29.0 - Files API
const file = await ai.files.upload({
  file: buffer,  // Must be Buffer or Blob
  config: {
    displayName: filename,
    mimeType: mimeType
  }
})
```

**Key Findings:**
1. ✅ `ai.files.upload()` exists and works
2. ❌ `ai.files.uploadStream()` does NOT exist
3. ❌ No native support for `ReadableStream` input
4. ⚠️ SDK always buffers the entire file before upload

**Tested Approaches:**
```typescript
// Attempt 1: Pass ReadableStream (FAILED)
const stream = fileEntry.stream()
await ai.files.upload({
  file: stream,  // TypeError: Expected Buffer or Blob
  config: { ... }
})

// Attempt 2: Check for streaming method (NOT FOUND)
console.log(typeof ai.files.uploadStream)  // "undefined"

// Attempt 3: Manual buffer from stream (WORKS but defeats purpose)
const chunks = []
for await (const chunk of stream) {
  chunks.push(chunk)
}
const buffer = Buffer.concat(chunks)
await ai.files.upload({ file: buffer, config: { ... } })
```

#### Alternative: Custom HTTP Implementation

**Gemini File API supports resumable uploads** via raw HTTP, but requires custom implementation:

**Protocol:** [Google Resumable Upload Protocol](https://developers.google.com/drive/api/guides/manage-uploads#resumable)

**Steps:**
1. **Initiate upload session:**
   ```bash
   POST https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable
   X-Upload-Content-Type: application/pdf
   X-Upload-Content-Length: 10485760

   Response:
   Location: https://generativelanguage.googleapis.com/upload/v1beta/files?uploadId=<session-id>
   ```

2. **Upload file chunks:**
   ```bash
   PUT <upload-session-url>
   Content-Range: bytes 0-524287/10485760

   [512 KB chunk]
   ```

3. **Upload remaining chunks** (repeat step 2 until complete)

**Implementation Complexity:**
- 🔴 **High complexity** - requires custom chunking logic
- 🔴 **Error handling** - must handle resume from partial uploads
- 🔴 **Progress tracking** - need to track chunk uploads
- 🟡 **SDK bypass** - loses SDK benefits (retries, auth, types)

#### Raw HTTP Example (Simplified)

```typescript
export async function uploadDocumentToGeminiStreamingHTTP(
  apiKey: string,
  fileStream: ReadableStream<Uint8Array>,
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<{ name: string, uri: string, mimeType: string }> {
  // 1. Initiate resumable upload session
  const initiateResponse = await fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: {
          displayName: filename
        }
      })
    }
  )

  const uploadUrl = initiateResponse.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) {
    throw new Error('Failed to initiate resumable upload')
  }

  // 2. Upload file in chunks
  const CHUNK_SIZE = 512 * 1024  // 512 KB
  let uploadedBytes = 0
  const reader = fileStream.getReader()

  while (uploadedBytes < fileSize) {
    // Read chunk
    const chunk = await readChunk(reader, CHUNK_SIZE)
    const chunkSize = chunk.byteLength

    // Upload chunk
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${uploadedBytes}-${uploadedBytes + chunkSize - 1}/${fileSize}`,
        'Content-Length': String(chunkSize)
      },
      body: chunk
    })

    if (!uploadResponse.ok && uploadResponse.status !== 308) {
      throw new Error(`Chunk upload failed: ${uploadResponse.status}`)
    }

    uploadedBytes += chunkSize
  }

  // 3. Get final file metadata
  const metadataResponse = await fetch(uploadUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  })

  const file = await metadataResponse.json()

  return {
    name: file.name,
    uri: file.uri,
    mimeType: file.mimeType
  }
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxSize: number
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let totalSize = 0

  while (totalSize < maxSize) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    totalSize += value.byteLength
  }

  return concatenateUint8Arrays(chunks)
}
```

### Recommendation

**For MVP (Phase 1 + Phase 2):**
- ✅ **Continue using buffered approach** with `ai.files.upload()`
- ✅ **10MB file limit** is reasonable for document processing
- ✅ **Memory usage is acceptable** for Edge Functions (max 512MB)
- ✅ **SDK benefits** (auth, retries, types) outweigh streaming benefits

**Justification:**
1. **Use Case:** ValidAI processes contracts/documents, typically 1-5MB (rarely >10MB)
2. **Memory:** 10MB file = ~20MB RAM with encoding/decoding (well within 512MB limit)
3. **Complexity:** Custom HTTP implementation adds significant complexity for marginal benefit
4. **Reliability:** SDK handles retries, auth refresh, error cases automatically

**When to Reconsider Streaming:**
- 🔴 **If processing files >50MB regularly** (not typical for document workflows)
- 🔴 **If Edge Function memory becomes constrained** (not observed yet)
- 🔴 **If SDK adds native streaming support** (check future releases)

### Future Work (Post-MVP)

**If streaming becomes necessary:**

1. **Monitor SDK releases** for native streaming support
   - Watch: https://github.com/google/generative-ai-js
   - Check release notes for `uploadStream()` or similar

2. **Consider custom HTTP implementation** if:
   - Processing files >50MB regularly (>10% of workload)
   - Edge Function memory usage >80% consistently
   - User feedback requests larger file support

3. **Alternative architectures:**
   - **Option A:** Direct browser → Gemini upload (bypass Edge Function)
     - Pro: No Edge Function memory usage
     - Con: Requires client-side API key management (security concern)

   - **Option B:** Pre-signed upload URLs (hybrid)
     - Edge Function generates pre-signed URL
     - Browser uploads directly to Gemini
     - Edge Function polls for completion
     - Pro: No memory usage, secure
     - Con: Complex orchestration

### Updated Phase 2 Status

**Based on this investigation, Phase 2 is now DEFERRED:**

**Reason:** Native SDK support not available, custom HTTP implementation too complex for current requirements.

**Impact:**
- Phase 1 (Optional Storage) proceeds as planned
- Phase 2 (Streaming) deferred until:
  - SDK adds native support, OR
  - User demand justifies custom HTTP implementation, OR
  - File size requirements exceed 50MB regularly

**Updated Success Metrics (Phase 1 only):**
- ✅ Time to first operation reduced by 3-7 seconds
- ✅ Both Storage and direct upload paths work
- ✅ Support files up to 10MB (buffered)
- ✅ Zero breaking changes to existing runs

---

## Phase 2: Streamable Upload Support ⚠️ DEFERRED

### Architecture Changes

#### Current Flow (Buffered)
```
Browser → Edge Function (buffer entire file in RAM) → LLM Provider
         └─ 10MB file = 10MB RAM usage
```

#### New Flow (Streaming)
```
Browser → Edge Function (stream, no buffering) → LLM Provider
         └─ 10MB file = ~1MB RAM usage (streaming chunks)
```

### Provider Capabilities Matrix

| Provider | Streaming Upload | SDK Support | Implementation Priority |
|----------|------------------|-------------|-------------------------|
| **Google Gemini** | ✅ Yes (multipart) | 🔍 Need to verify | High (primary provider) |
| **Anthropic** | ✅ Yes (multipart) | 🔍 Need to verify | Medium |
| **Mistral** | ✅ Yes (multipart) | 🔍 Need to verify | Low |

### Implementation Steps

#### **Step 2.1: Provider Capability Detection**

**File:** `supabase/functions/_shared/provider-capabilities.ts`

```typescript
export interface ProviderUploadCapabilities {
  streaming_upload: boolean
  buffered_upload: boolean
  max_file_size_streaming: number  // bytes
  max_file_size_buffered: number   // bytes
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderUploadCapabilities> = {
  google: {
    streaming_upload: true,   // To be verified
    buffered_upload: true,
    max_file_size_streaming: 50 * 1024 * 1024,  // 50MB
    max_file_size_buffered: 10 * 1024 * 1024    // 10MB
  },
  anthropic: {
    streaming_upload: true,   // To be verified
    buffered_upload: true,
    max_file_size_streaming: 50 * 1024 * 1024,
    max_file_size_buffered: 10 * 1024 * 1024
  },
  mistral: {
    streaming_upload: false,  // SDK limitations
    buffered_upload: true,
    max_file_size_streaming: 0,
    max_file_size_buffered: 10 * 1024 * 1024
  }
}

export function getProviderCapabilities(provider: string): ProviderUploadCapabilities {
  return PROVIDER_CAPABILITIES[provider] || {
    streaming_upload: false,
    buffered_upload: true,
    max_file_size_streaming: 0,
    max_file_size_buffered: 10 * 1024 * 1024
  }
}
```

---

#### **Step 2.2: Streaming Upload Request Handling**

**File:** `supabase/functions/execute-processor-run/index.ts`

**Add streaming request detection:**

```typescript
Deno.serve(async (req) => {
  // Check Content-Type to determine request format
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    // STREAMING MODE: File sent as multipart stream
    return await handleStreamingUpload(req)
  } else if (contentType.includes('application/json')) {
    // BUFFERED MODE: File sent as base64 JSON (existing/Phase 1)
    return await handleBufferedUpload(req)
  } else {
    return new Response(
      JSON.stringify({ error: 'Unsupported Content-Type' }),
      { status: 400 }
    )
  }
})
```

---

#### **Step 2.3: Streaming Upload Handler**

**File:** `supabase/functions/execute-processor-run/streaming-handler.ts`

```typescript
import { FormData } from 'formdata'

export async function handleStreamingUpload(req: Request): Promise<Response> {
  console.log('[Streaming] Processing multipart upload')

  // Parse multipart form data (streaming)
  const formData = await req.formData()

  // Extract metadata fields
  const processorId = formData.get('processor_id') as string
  const filename = formData.get('filename') as string
  const mimeType = formData.get('mime_type') as string
  const fileSizeStr = formData.get('size_bytes') as string
  const fileSize = parseInt(fileSizeStr, 10)

  // Get file stream
  const fileEntry = formData.get('file')
  if (!(fileEntry instanceof File)) {
    throw new Error('File field must contain a file')
  }

  // Get provider from processor configuration
  const provider = await getProcessorProvider(processorId)
  const capabilities = getProviderCapabilities(provider)

  // Verify provider supports streaming
  if (!capabilities.streaming_upload) {
    console.warn(`[Streaming] Provider ${provider} does not support streaming, falling back to buffered`)
    // Convert stream to buffer and use buffered upload
    const buffer = Buffer.from(await fileEntry.arrayBuffer())
    return await handleBufferedUploadWithBuffer(processorId, buffer, filename, mimeType, fileSize)
  }

  // Verify file size within streaming limits
  if (fileSize > capabilities.max_file_size_streaming) {
    throw new Error(`File size ${fileSize} exceeds streaming limit ${capabilities.max_file_size_streaming}`)
  }

  // Stream directly to provider
  console.log(`[Streaming] Uploading to ${provider} (${fileSize} bytes)`)

  const providerFileRef = await streamToProvider(
    provider,
    fileEntry.stream(),  // ReadableStream<Uint8Array>
    filename,
    mimeType,
    fileSize
  )

  // Create run record with provider file reference
  // ... rest of run creation logic (same as Phase 1)
}
```

---

#### **Step 2.4: Provider Streaming Implementations**

**File:** `supabase/functions/_shared/llm-executor-gemini.ts`

**Add streaming upload function:**

```typescript
/**
 * Upload document to Gemini File API using streaming
 * (Requires Content-Length header)
 */
export async function uploadDocumentToGeminiStream(
  ai: GoogleGenAI,
  fileStream: ReadableStream<Uint8Array>,
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<{ name: string, uri: string, mimeType: string }> {
  console.log(`[Gemini Streaming] Uploading file: ${filename} (${fileSize} bytes)`)

  const startTime = Date.now()

  try {
    // Check if SDK supports streaming
    // If not, convert stream to buffer (fallback)
    const supportsStreaming = typeof ai.files.uploadStream === 'function'

    if (!supportsStreaming) {
      console.warn('[Gemini Streaming] SDK does not support streaming, buffering entire file')

      // Convert stream to buffer
      const chunks: Uint8Array[] = []
      const reader = fileStream.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const buffer = Buffer.concat(chunks)
      const blob = new Blob([buffer], { type: mimeType })

      // Fall back to buffered upload
      return await uploadDocumentToGemini(ai, buffer, filename, mimeType)
    }

    // Use streaming API (if available)
    const file = await ai.files.uploadStream({
      stream: fileStream,
      config: {
        displayName: filename,
        mimeType: mimeType,
        knownLength: fileSize  // Required for multipart upload
      }
    })

    const duration = Date.now() - startTime
    console.log(`[Gemini Streaming] Upload complete: ${file.name} (${duration}ms)`)

    return {
      name: file.name,
      uri: file.uri,
      mimeType: file.mimeType || mimeType
    }

  } catch (error) {
    console.error('[Gemini Streaming] Upload failed:', error)
    throw new Error(`Gemini streaming upload failed: ${error.message}`)
  }
}
```

**Note:** If `@google/genai` SDK doesn't support streaming, we'll need to use raw HTTP:

```typescript
export async function uploadDocumentToGeminiStreamRaw(
  apiKey: string,
  fileStream: ReadableStream<Uint8Array>,
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<{ name: string, uri: string, mimeType: string }> {
  // Construct multipart boundary
  const boundary = `----FormBoundary${Date.now()}`

  // Create multipart headers
  const headers = new Headers({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': `multipart/related; boundary=${boundary}`,
    'Content-Length': String(fileSize + metadata.length)  // Approximate
  })

  // Build multipart body stream
  const metadataJson = JSON.stringify({
    file: {
      displayName: filename,
      mimeType: mimeType
    }
  })

  const metadataPart = new TextEncoder().encode(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=utf-8\r\n\r\n` +
    `${metadataJson}\r\n`
  )

  const filePart = new TextEncoder().encode(
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  )

  const endPart = new TextEncoder().encode(
    `\r\n--${boundary}--\r\n`
  )

  // Combine streams
  const bodyStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(metadataPart)
      controller.enqueue(filePart)

      const reader = fileStream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.enqueue(value)
      }

      controller.enqueue(endPart)
      controller.close()
    }
  })

  // Upload to Gemini
  const response = await fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files',
    {
      method: 'POST',
      headers: headers,
      body: bodyStream
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini upload failed: ${response.status}`)
  }

  const result = await response.json()
  return {
    name: result.file.name,
    uri: result.file.uri,
    mimeType: result.file.mimeType
  }
}
```

---

#### **Step 2.5: Browser Streaming Upload**

**File:** `apps/validai/components/processors/run-processor-dialog.tsx`

**Add streaming upload option:**

```typescript
const handleRunStreaming = async () => {
  if (!selectedFile) return

  try {
    // Create FormData for multipart upload
    const formData = new FormData()
    formData.append('processor_id', processor.id)
    formData.append('filename', selectedFile.name)
    formData.append('mime_type', selectedFile.type)
    formData.append('size_bytes', String(selectedFile.size))
    formData.append('file', selectedFile)  // Actual file (streamed by browser)

    // Upload with streaming
    const response = await fetch(
      `${supabaseUrl}/functions/v1/execute-processor-run`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: formData  // Browser automatically sets multipart/form-data
      }
    )

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }

    const data = await response.json()

    // Navigate to run detail
    router.push(`/proc/${processor.id}/runs/${data.run_id}`)
    onOpenChange(false)

  } catch (error) {
    toast.error('Failed to start run', {
      description: error.message
    })
  }
}
```

---

#### **Step 2.6: Error Handling for Partial Uploads**

**File:** `supabase/functions/_shared/streaming-error-handler.ts`

```typescript
export class PartialUploadError extends Error {
  constructor(
    public provider: string,
    public partialFileId: string | null,
    message: string
  ) {
    super(message)
    this.name = 'PartialUploadError'
  }
}

export async function cleanupPartialUpload(
  provider: string,
  fileId: string,
  apiKey: string
): Promise<void> {
  console.warn(`[Cleanup] Removing partial upload: ${fileId}`)

  try {
    if (provider === 'google') {
      const ai = new GoogleGenAI({ apiKey })
      await ai.files.delete({ name: fileId })
      console.log(`[Cleanup] Gemini file deleted: ${fileId}`)
    } else if (provider === 'anthropic') {
      // Anthropic cleanup
      // ... similar logic
    } else if (provider === 'mistral') {
      // Mistral cleanup
      // ... similar logic
    }
  } catch (error) {
    console.error(`[Cleanup] Failed to delete partial upload: ${error.message}`)
    // Don't throw - cleanup is best-effort
  }
}
```

**Usage in streaming handler:**

```typescript
let partialFileId: string | null = null

try {
  const uploadResult = await streamToProvider(...)
  partialFileId = uploadResult.name

  // Continue with run creation
  // ...

} catch (error) {
  // Clean up partial upload if it exists
  if (partialFileId) {
    await cleanupPartialUpload(provider, partialFileId, apiKey)
  }

  throw new PartialUploadError(provider, partialFileId, error.message)
}
```

---

### Phase 2 Testing Strategy

#### **Unit Tests**

```typescript
describe('Streaming Upload', () => {
  it('should detect streaming vs buffered requests', async () => {
    const streamingReq = new Request('...', {
      headers: { 'content-type': 'multipart/form-data' }
    })

    const bufferedReq = new Request('...', {
      headers: { 'content-type': 'application/json' }
    })

    expect(isStreamingRequest(streamingReq)).toBe(true)
    expect(isStreamingRequest(bufferedReq)).toBe(false)
  })

  it('should stream file to Gemini', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      }
    })

    const result = await uploadDocumentToGeminiStream(
      mockAI,
      mockStream,
      'test.pdf',
      'application/pdf',
      3
    )

    expect(result.name).toBeDefined()
    expect(result.uri).toContain('generativelanguage')
  })

  it('should fallback to buffered if provider does not support streaming', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      }
    })

    const result = await streamToProvider(
      'mistral',  // Does not support streaming
      mockStream,
      'test.pdf',
      'application/pdf',
      3
    )

    // Should buffer and use buffered upload
    expect(result).toBeDefined()
  })
})
```

#### **Integration Tests**

```typescript
describe('Streaming Upload Integration', () => {
  it('should upload large file (25MB) via streaming', async () => {
    const largeFile = generateLargeTestFile(25 * 1024 * 1024)  // 25MB

    const formData = new FormData()
    formData.append('processor_id', testProcessor.id)
    formData.append('filename', 'large-file.pdf')
    formData.append('mime_type', 'application/pdf')
    formData.append('size_bytes', String(largeFile.size))
    formData.append('file', largeFile)

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      body: formData
    })

    expect(response.status).toBe(202)

    const data = await response.json()
    expect(data.run_id).toBeDefined()
  }, 60000)  // 60s timeout for large file

  it('should clean up partial upload on error', async () => {
    // Mock network error during streaming
    mockNetworkError()

    const file = generateTestFile(5 * 1024 * 1024)

    const formData = new FormData()
    formData.append('processor_id', testProcessor.id)
    formData.append('file', file)

    try {
      await fetch(edgeFunctionUrl, {
        method: 'POST',
        body: formData
      })

      fail('Should have thrown error')
    } catch (error) {
      expect(error).toBeInstanceOf(PartialUploadError)
    }

    // Verify partial file was cleaned up
    const geminiFiles = await listGeminiFiles()
    expect(geminiFiles).not.toContain(expect.objectContaining({
      displayName: file.name
    }))
  })
})
```

---

### Phase 2 Rollout Plan ⚠️ DEFERRED

**Note:** This section preserved for future reference. Phase 2 is deferred pending SDK streaming support or increased file size requirements (see Investigation Results above).

#### **Step 1: Verify SDK Streaming Support**

```bash
# Test if @google/genai SDK supports streaming
node -e "
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  console.log('uploadStream available:', typeof ai.files.uploadStream === 'function');
"
```

**If streaming not supported:**
- Implement raw HTTP multipart upload
- File GitHub issue with SDK maintainers
- Use fallback buffered upload for now

#### **Step 2: Deploy Edge Function with Streaming Support**

```bash
# Deploy updated Edge Function
npx supabase functions deploy execute-processor-run
```

**Verification:**
```bash
# Test streaming upload
curl -X POST "https://[project].supabase.co/functions/v1/execute-processor-run" \
  -H "Authorization: Bearer [token]" \
  -F "processor_id=..." \
  -F "filename=test.pdf" \
  -F "mime_type=application/pdf" \
  -F "size_bytes=5242880" \
  -F "file=@test.pdf"

# Should return HTTP 202
```

#### **Step 3: Feature Flag for Streaming**

```typescript
export const FEATURE_FLAGS = {
  STREAMING_UPLOAD_ENABLED: process.env.NEXT_PUBLIC_ENABLE_STREAMING_UPLOAD === 'true',
  STREAMING_MIN_FILE_SIZE: 5 * 1024 * 1024  // Only stream files > 5MB
}
```

#### **Step 4: Gradual Rollout**

**Week 1:** Enable for internal testing
- Test with 5MB, 10MB, 25MB, 50MB files
- Monitor Edge Function memory usage
- Verify no memory pressure errors

**Week 2:** Enable for beta users
- Collect metrics on memory savings
- Verify upload reliability
- Check for partial upload cleanup

**Week 3:** Production rollout
```bash
NEXT_PUBLIC_ENABLE_STREAMING_UPLOAD=true vercel deploy --prod
```

#### **Monitoring**

```sql
-- Track streaming vs buffered uploads
SELECT
  CASE
    WHEN snapshot->>'gemini_file_uri' IS NOT NULL THEN 'streaming'
    ELSE 'buffered'
  END as upload_type,
  COUNT(*) as count
FROM validai_runs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY upload_type;
```

---

## Implementation Order

### Timeline

| Phase | Duration | Start Date | End Date | Status |
|-------|----------|------------|----------|--------|
| **Phase 1: Optional Storage** | 2 weeks | TBD | TBD | 📋 Ready to implement |
| - Database migration | 1 day | Week 1 Day 1 | Week 1 Day 1 |
| - Edge Function updates | 3 days | Week 1 Day 2 | Week 1 Day 4 |
| - UI/Browser updates | 2 days | Week 1 Day 5 | Week 2 Day 1 |
| - Testing | 3 days | Week 2 Day 2 | Week 2 Day 4 |
| - Rollout | 1 day | Week 2 Day 5 | Week 2 Day 5 |
| **Phase 2: Streaming Upload** | ⚠️ DEFERRED | - | - | See Investigation Results |

### Dependencies

```
Phase 1 (Optional Storage)
  ├─ No dependencies
  └─ Blocks: None (standalone implementation)

Phase 2 (Streaming Upload) ⚠️ DEFERRED
  ├─ Blocked by: SDK streaming support NOT available
  ├─ Would require: Phase 1 complete + custom HTTP implementation
  └─ Deferred until: SDK support or increased file size requirements
```

---

## Testing Strategy

### Automated Tests

#### **Unit Tests** (90% coverage target)

```bash
# Run unit tests
pnpm test

# Coverage report
pnpm test:coverage
```

**Key areas:**
- Document resolution (Storage vs direct)
- Request validation (document_id vs file_upload)
- Streaming detection
- Provider capability routing
- Error handling

#### **Integration Tests**

```bash
# Run integration tests
pnpm test:integration
```

**Key scenarios:**
- End-to-end run with Storage
- End-to-end run with direct upload
- End-to-end run with streaming
- Partial upload cleanup
- Fallback to buffered upload

#### **E2E Tests**

```bash
# Run E2E tests
pnpm test:e2e
```

**User journeys:**
- Upload file and create run
- View run progress
- View operation results
- Error handling (file too large, invalid type)

### Manual Testing Checklist

#### **Phase 1: Optional Storage**

- [ ] Upload 1MB PDF via Storage (existing flow)
- [ ] Upload 1MB PDF via direct upload (new flow)
- [ ] Upload 10MB PDF via direct upload
- [ ] Verify run detail page works for both flows
- [ ] Verify operations execute correctly
- [ ] Check `storage_status` in database
- [ ] Test error handling (file too large)
- [ ] Test browser offline during upload
- [ ] Verify backward compatibility (old runs still work)

#### **Phase 2: Streaming Upload**

- [ ] Upload 5MB file via streaming
- [ ] Upload 25MB file via streaming
- [ ] Upload 50MB file via streaming
- [ ] Verify Edge Function memory usage < 50MB
- [ ] Test provider fallback (Mistral → buffered)
- [ ] Test partial upload cleanup
- [ ] Test browser disconnect during streaming
- [ ] Verify streaming works with all file types
- [ ] Check Gemini File API logs

### Performance Testing

```bash
# Load test with 10 concurrent uploads
artillery run load-test.yml

# Monitor Edge Function metrics
npx supabase functions logs execute-processor-run --tail
```

**Metrics to track:**
- Time to first operation (should reduce by 3-7s)
- Edge Function memory usage (should reduce by 80% with streaming)
- Upload success rate (should be ≥99%)
- Error rate (should be <1%)

---

## Rollback Plan

### Phase 1 Rollback

**If issues detected:**

1. **Feature flag OFF:**
   ```bash
   NEXT_PUBLIC_ENABLE_DIRECT_UPLOAD=false vercel deploy --prod
   ```
   - Users revert to Storage flow
   - No data loss (runs continue working)

2. **If database migration issues:**
   ```sql
   -- Rollback migration (if needed)
   ALTER TABLE validai_runs ALTER COLUMN document_id SET NOT NULL;
   ALTER TABLE validai_runs DROP COLUMN storage_status;
   ```

3. **Edge Function rollback:**
   ```bash
   npx supabase functions deploy execute-processor-run --version previous
   ```

### Phase 2 Rollback

**If streaming issues:**

1. **Feature flag OFF:**
   ```bash
   NEXT_PUBLIC_ENABLE_STREAMING_UPLOAD=false vercel deploy --prod
   ```
   - Reverts to buffered upload
   - No functional impact

2. **Edge Function rollback:**
   ```bash
   npx supabase functions deploy execute-processor-run --version previous
   ```

### Emergency Rollback (Full)

**If critical issues:**

```bash
# 1. Disable all new features
NEXT_PUBLIC_ENABLE_DIRECT_UPLOAD=false \
NEXT_PUBLIC_ENABLE_STREAMING_UPLOAD=false \
vercel deploy --prod

# 2. Revert Edge Function
npx supabase functions deploy execute-processor-run --version [pre-phase-1-version]

# 3. Notify users
# 4. Investigate and fix issues
# 5. Re-deploy with fixes
```

---

## Success Criteria

### Phase 1: Optional Storage

**Functional:**
- ✅ Both Storage and direct upload paths work
- ✅ Zero breaking changes to existing functionality
- ✅ All tests pass (unit, integration, E2E)

**Performance:**
- ✅ Time to first operation reduced by 3-7 seconds (direct upload)
- ✅ Error rate < 1%
- ✅ Success rate > 99%

**Adoption:**
- ✅ 50%+ of runs use direct upload within 1 month
- ✅ Positive user feedback on speed improvement

### Phase 2: Streaming Upload ⚠️ DEFERRED

**Deferral Criteria (must meet ONE of the following to proceed):**
- ✅ `@google/genai` SDK adds native streaming support (`ai.files.uploadStream()`)
- ✅ User demand for files >50MB (>10% of upload volume)
- ✅ Edge Function memory constraints observed (>80% usage consistently)
- ✅ Business requirement for larger file support

**Original Success Criteria (preserved for future):**
- Streaming upload works for supported providers
- Graceful fallback to buffered upload
- Partial upload cleanup working
- Edge Function memory usage reduced by 80%
- Support files up to 50MB
- No increase in error rate

---

## Documentation Updates

### User-Facing Documentation

**File:** `apps/validai/docs/user-guide/running-processors.md`

Update with:
- How to run a processor (same UI, faster now)
- File size limits (10MB buffered, 50MB streaming)
- Expected processing times

### Developer Documentation

**File:** `apps/validai/docs/architecture/manual-processor-execution.md`

Update sections:
- Document handling (Storage optional, streaming support)
- Edge Function architecture (buffered vs streaming paths)
- Provider capabilities matrix

**File:** `apps/validai/docs/architecture/llm-provider-configuration.md`

Update:
- Provider streaming capabilities
- SDK compatibility notes

### API Documentation

**File:** `apps/validai/docs/api/execute-processor-run.md`

Document both request formats:

```typescript
// Option 1: Storage (existing)
{
  processor_id: string
  document_id: string
}

// Option 2: Direct upload (Phase 1)
{
  processor_id: string
  file_upload: {
    file: string  // base64
    filename: string
    mime_type: string
    size_bytes: number
  }
}

// Option 3: Streaming (Phase 2)
// Content-Type: multipart/form-data
// processor_id: string
// filename: string
// mime_type: string
// size_bytes: number
// file: [binary stream]
```

---

## Open Questions

### Phase 1

1. **Should we support background Storage upload?**
   - User gets instant response, file stored async
   - Adds complexity, may not be worth it
   - **Decision:** No, keep it simple (either Storage or direct)

2. **Should we add a UI toggle for Storage vs direct?**
   - Or just use direct always (simpler UX)?
   - **Decision:** Use direct always (feature flag controls rollout)

3. **What if user wants to re-run from direct upload?**
   - No Storage record → must re-upload
   - **Decision:** Show warning in UI, require re-upload

### Phase 2

1. **What if SDK doesn't support streaming?**
   - Implement raw HTTP multipart
   - File SDK feature request
   - **Decision:** Verify first, implement fallback if needed

2. **Should we stream files < 5MB?**
   - Minimal benefit, added complexity
   - **Decision:** Only stream files ≥ 5MB

3. **How to handle retry with streams?**
   - Streams consumed after first attempt
   - **Decision:** Only retry connection errors, not upload errors

---

## Conclusion

### Summary

This plan provides a clear, pragmatic path to optimize the ValidAI file upload flow:

**Phase 1: Optional Storage** (Ready to implement)
- ✅ Reduce latency by 3-7 seconds (eliminate Storage round trip)
- ✅ Maintain backward compatibility
- ✅ Clear implementation steps and rollback plan
- ✅ Support files up to 10MB (buffered in memory)

**Phase 2: Streaming Upload** (DEFERRED)
- ⚠️ SDK does not support native streaming
- ⚠️ Custom HTTP implementation too complex for current needs
- ⚠️ Deferred until SDK support or business requirements change
- ✅ Investigation complete, path forward documented

### Key Decisions

1. **MVP uses buffered uploads** (Phase 1 only)
   - 10MB file limit is adequate for document processing
   - SDK benefits (auth, retries, types) justify buffered approach
   - Memory usage acceptable for Edge Functions (20-30MB per request)

2. **Direct upload hardcoded** (no user toggle in MVP)
   - Simpler UX - users don't need to understand Storage vs direct
   - TODO comment preserved for future consideration
   - Can add user option later if needed for re-runs

3. **Streaming deferred** (not justified for MVP)
   - Wait for SDK native support
   - Only implement if file sizes regularly exceed 50MB
   - Custom HTTP implementation documented for future reference

### Next Steps

**Immediate (Phase 1):**
1. ✅ Review and approve this plan
2. ✅ Create GitHub issue for Phase 1 implementation
3. ✅ Assign developer(s)
4. ✅ Begin Phase 1 implementation (estimated 2 weeks)

**Future (Phase 2 - when criteria met):**
1. Monitor SDK releases for streaming support
2. Track file size distribution in production
3. Monitor Edge Function memory usage
4. Revisit streaming if criteria met (see Investigation Results)

### Expected Impact

**Phase 1 (2 weeks):**
- ⚡ **3-7 seconds faster** time to first operation
- 📦 **Simpler architecture** (optional Storage)
- 🔒 **Zero breaking changes** (backward compatible)
- 💾 **10MB file support** (adequate for 99%+ of use cases)

**Phase 2 (deferred):**
- Will revisit when SDK adds streaming or requirements change
- Path forward documented in Investigation Results section

---

**Document Version:** 1.1
**Author:** Claude (Anthropic)
**Created:** 2025-11-09
**Last Updated:** 2025-11-09
**Status:** 📋 Ready for Implementation (Phase 1)

### Revision History

**v1.1 (2025-11-09):**
- Added Gemini Streaming SDK investigation results
- Updated Phase 2 status to DEFERRED (SDK does not support streaming)
- Removed Step 1.7 (Feature Flag) - hardcoded direct upload in MVP
- Updated Step 1.5 with TODO comment for future Storage option
- Updated success metrics, timeline, and conclusion

**v1.0 (2025-11-09):**
- Initial plan for Phase 1 (Optional Storage) and Phase 2 (Streaming)
