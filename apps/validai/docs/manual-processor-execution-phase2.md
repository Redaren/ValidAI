# Manual Processor Execution Architecture - Phase 2
## Two-Mode Document Processing

**Status:** 🟡 Planning (Pre-Mistral Implementation)
**Version:** 2.0.0
**Date:** 2025-10-29
**Author:** ValidAI Architecture Team

---

## Overview

Phase 2 introduces a **two-mode architecture** for document processing, enabling processors to handle documents either with persistent storage or in ephemeral memory only. This architecture is designed before Mistral integration and supports both Anthropic and Mistral providers.

### Business Driver

**Security & Privacy First**: Users can now drag-and-drop documents from SharePoint, secure file shares, or other external sources without persisting them in ValidAI's storage. Documents are processed and results are stored, but the original files are never saved—they either auto-expire (Mistral) or exist only in-memory for the run lifetime (Anthropic).

### Two Modes

| Mode | Description | Use Cases |
|------|-------------|-----------|
| **Stored** | Documents uploaded to Supabase Storage bucket, database record created | Production runs, audit trails, reprocessing, document management |
| **Ephemeral** | Documents processed in-memory only, no persistent storage | Sensitive documents, SharePoint integration, quick tests, compliance requirements |

---

## Architecture Design

### Processor-Level Configuration

**Document storage mode is configured at the processor level**, not per-run or in the UI. This ensures consistent behavior for all runs of a given processor.

```typescript
// Processor Configuration
interface ProcessorConfiguration {
  document_storage_mode: 'stored' | 'ephemeral'  // NEW: Controls storage behavior
  selected_model_id?: string
  settings_override?: ProcessorSettings
}
```

**Default Behavior:**
- Existing processors: `stored` (backward compatible)
- New processors: User chooses mode during creation
- Workbench: Always uses `ephemeral` mode (test environment)

---

## Provider Support Matrix

### Anthropic

| Mode | Implementation | Document Lifecycle |
|------|----------------|-------------------|
| **Stored** | Upload to Supabase bucket → Download in Edge Function → Send to Anthropic | Permanent until deleted |
| **Ephemeral** | Store base64 in run snapshot → Load from snapshot → Send to Anthropic | Lifetime of run record |

**Ephemeral Implementation:**
- No Files API available from Anthropic
- Base64-encode document and store in `run.snapshot.document_base64`
- Worker loads from snapshot instead of downloading from bucket
- Snapshot persists as long as run record exists

### Mistral

| Mode | Implementation | Document Lifecycle |
|------|----------------|-------------------|
| **Stored** | Upload to Supabase bucket → Download in Edge Function → Upload to Mistral Files API | Permanent until deleted (bucket) + 24h (Mistral) |
| **Ephemeral** | Upload directly to Mistral Files API → Store signed URL in run record | 24 hours (Mistral auto-expires) |

**Ephemeral Implementation:**
- Direct upload to Mistral Files API (skip Supabase bucket)
- Store signed URL in `run.external_document_url`
- Worker uses signed URL directly (no bucket download)
- URL expires after 24 hours (Mistral-enforced)

---

## Database Schema Changes

### `validai_runs` Table

```sql
ALTER TABLE validai_runs ADD COLUMN external_document_url TEXT;
ALTER TABLE validai_runs ADD COLUMN external_document_provider TEXT; -- 'mistral' | 'anthropic'
ALTER TABLE validai_runs ADD COLUMN external_document_expires_at TIMESTAMPTZ;

-- Constraint: Must have either document_id OR external_document_url
ALTER TABLE validai_runs ADD CONSTRAINT run_document_source_check
  CHECK (
    (document_id IS NOT NULL AND external_document_url IS NULL) OR
    (document_id IS NULL AND external_document_url IS NOT NULL)
  );
```

### `validai_processors` Table

```sql
-- No schema change needed
-- Configuration stored in existing JSONB column: configuration.document_storage_mode
```

### Run Snapshot Extension (Anthropic Ephemeral Only)

```typescript
interface RunSnapshot {
  processor: { /* ... */ }
  operations: OperationSnapshot[]
  document: DocumentSnapshot

  // NEW: For Anthropic ephemeral mode
  document_base64?: string       // Base64-encoded document content
  document_base64_mime_type?: string
}
```

---

## Execution Flows

### Stored Mode Flow (Both Providers)

```
1. User uploads file to Supabase Storage bucket
2. Create document record in validai_documents table
3. Create run with document_id reference
4. Return HTTP 202 (UI released)
5. Background worker downloads from bucket
6. Send to LLM provider (Anthropic directly, Mistral after re-upload)
7. Store results
```

**Characteristics:**
- ✅ Document persists permanently
- ✅ Can reprocess run if it fails
- ✅ Can use same document across multiple runs/processors
- ✅ Document management UI (list, view, delete)
- ✅ Full audit trail

### Ephemeral Mode Flow - Mistral

```
1. User selects file in UI
2. Upload directly to Mistral Files API (skip Supabase bucket)
3. Get signed URL (valid 24 hours)
4. Create run with external_document_url
5. Return HTTP 202 (UI released)
6. Background worker uses signed URL directly
7. Store results (document URL expires in 24h)
```

**Characteristics:**
- ✅ No persistent storage in ValidAI
- ✅ Faster upload (one destination)
- ✅ Auto-expires after 24 hours
- ❌ Cannot reprocess after expiration
- ❌ Cannot reuse document across runs

### Ephemeral Mode Flow - Anthropic

```
1. User selects file in UI
2. Base64-encode file content
3. Create run with base64 in snapshot (no document_id)
4. Return HTTP 202 (UI released)
5. Background worker loads from snapshot
6. Send to Anthropic
7. Store results (snapshot persists with run)
```

**Characteristics:**
- ✅ No persistent storage in ValidAI
- ✅ Document exists as long as run record exists
- ✅ Can reprocess run (snapshot has document)
- ❌ Cannot reuse document across runs
- ⚠️ Larger snapshot size (base64 overhead ~33%)

---

## Edge Function Logic

### Initial Invocation (Create Run)

```typescript
// Determine mode from processor configuration
const mode = processor.configuration?.document_storage_mode || 'stored'
const provider = determineProvider(processor.configuration?.selected_model_id)

if (mode === 'stored') {
  // EXISTING BEHAVIOR: document_id required
  if (!body.document_id) throw new Error('document_id required for stored mode')

  // Create run with document_id
  const run = await createRun({
    processor_id,
    document_id,
    snapshot: createSnapshot(processor, operations, document)
  })

} else if (mode === 'ephemeral') {
  // NEW BEHAVIOR: Handle ephemeral upload

  if (provider === 'mistral') {
    // Upload to Mistral Files API
    const mistralClient = new Mistral({ apiKey })
    const uploadedFile = await mistralClient.files.upload(/* ... */)
    const signedUrl = await mistralClient.files.getSignedUrl(/* ... */)

    // Create run with external URL
    const run = await createRun({
      processor_id,
      external_document_url: signedUrl.url,
      external_document_provider: 'mistral',
      external_document_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      snapshot: createSnapshot(processor, operations)
    })

  } else if (provider === 'anthropic') {
    // Store base64 in snapshot
    const documentBase64 = Buffer.from(fileContent).toString('base64')

    const run = await createRun({
      processor_id,
      snapshot: createSnapshot(processor, operations, null, {
        document_base64: documentBase64,
        document_base64_mime_type: mimeType
      })
    })
  }
}

// Return HTTP 202 immediately
return new Response(JSON.stringify({ run_id: run.id }), { status: 202 })
```

### Background Invocation (Process Operations)

```typescript
// Load run and snapshot
const run = await fetchRun(run_id)
const snapshot = run.snapshot

// Determine document source
let documentBuffer: Buffer

if (run.document_id) {
  // STORED MODE: Download from bucket
  documentBuffer = await downloadDocument(supabase, documentPath)

} else if (run.external_document_url && run.external_document_provider === 'mistral') {
  // EPHEMERAL MODE (Mistral): Use signed URL directly
  // Worker passes URL to Mistral (no download needed)
  documentUrl = run.external_document_url

} else if (snapshot.document_base64) {
  // EPHEMERAL MODE (Anthropic): Load from snapshot
  documentBuffer = Buffer.from(snapshot.document_base64, 'base64')
}

// Execute operations (rest of logic unchanged)
for (const operation of operations) {
  const result = await executeLLMOperationWithRetry({
    operation,
    document: documentBuffer || documentUrl,
    systemPrompt,
    settings,
    apiKey
  })

  // Store results...
}
```

---

## Security & Privacy Benefits

### Stored Mode
- ✅ Complete audit trail
- ✅ Document retention for compliance
- ✅ Reprocessing capability
- ⚠️ Documents persist in storage (may not be desired for sensitive data)

### Ephemeral Mode
- ✅ **No persistent storage** - documents never saved to ValidAI storage
- ✅ **Auto-expiration** - Mistral URLs expire in 24h, Anthropic when run deleted
- ✅ **Compliance-friendly** - ideal for regulated industries (healthcare, finance)
- ✅ **SharePoint integration** - process external documents without copying
- ✅ **Reduced storage costs** - no bucket storage needed
- ⚠️ Cannot reprocess after expiration (Mistral) or run deletion (Anthropic)

---

## Migration Strategy

### Existing Processors
- Default to `stored` mode (backward compatible)
- No migration needed for existing runs
- Users can change mode in processor settings

### New Processors
- Present mode choice during creation
- Default suggestion based on processor type:
  - Production processors → `stored`
  - Test/sandbox processors → `ephemeral`

### Workbench
- Always uses `ephemeral` mode (no processor configuration needed)
- Documents never stored, results stored in `validai_workbench_executions`

---

## Implementation Phases

### Phase 1: Foundation (Current - Before Mistral)
- ✅ Stored mode working for Anthropic
- ✅ Document management UI
- ✅ Run history with document references

### Phase 2A: Mistral Integration (Stored Mode)
- Implement Mistral provider with stored mode
- Upload to bucket → Download → Re-upload to Mistral
- Maintain architectural consistency

### Phase 2B: Ephemeral Mode (Enhancement)
- Add `document_storage_mode` to processor configuration
- Add schema changes to `validai_runs`
- Implement Mistral ephemeral mode (direct upload)
- Implement Anthropic ephemeral mode (base64 in snapshot)
- Update Edge Function routing logic

### Phase 2C: Workbench Integration
- Convert workbench to use ephemeral mode architecture
- Remove temporary document storage from workbench

### Phase 3: Cleanup & Optimization
- Auto-delete expired ephemeral runs (configurable retention)
- Monitoring and alerts for expiring runs
- Performance optimization for base64 snapshots

---

## Decision Rationale

### Why Processor-Level Configuration?

**Decision:** Mode is configured at processor level, not per-run

**Rationale:**
- Processors represent **workflows with consistent requirements**
- Security/compliance requirements are workflow-specific, not document-specific
- Simpler mental model: "This processor handles sensitive data" → always ephemeral
- Prevents user error: No risk of accidentally storing sensitive document
- Cleaner UI: Mode is set once, not on every run

**Alternative Considered:**
- ❌ Run-level mode selection: Too error-prone, inconsistent behavior
- ❌ UI toggle on every run: Cognitive overhead, risk of mistakes

### Why Different Approaches for Anthropic vs Mistral?

**Anthropic:** No Files API available → Use base64 in snapshot
- Snapshot already exists, minimal overhead
- Document persists with run record
- No external dependencies

**Mistral:** Files API available → Use direct upload + signed URL
- Native platform feature, designed for this use case
- 24h expiration enforced by Mistral
- More efficient than base64 (no encoding overhead)

### Why Support Both Modes?

Not all use cases fit one model:

**Stored Mode Best For:**
- Production processors requiring audit trails
- Workflows needing reprocessing capability
- Document libraries with reuse across runs
- Compliance requirements for document retention

**Ephemeral Mode Best For:**
- Sensitive documents (PII, financial data, healthcare records)
- External document sources (SharePoint, Google Drive)
- Quick validation and testing
- Cost-sensitive workloads (no storage fees)

---

## Open Questions

1. **Retention Policy for Ephemeral Runs:**
   - Should we auto-delete run records after external URL expires?
   - Default: Keep run record (shows "Document expired" in UI)
   - Configurable per-organization?

2. **Workbench Mode Selection:**
   - Should workbench always use ephemeral, or inherit from processor?
   - Default: Always ephemeral (testing environment)

3. **Migration Path for Existing Documents:**
   - Can users convert stored runs to ephemeral architecture?
   - Default: No retroactive changes (existing runs remain as-is)

---

## Success Criteria

### Phase 2A (Mistral Stored Mode)
- [ ] Mistral provider works with stored mode
- [ ] No breaking changes to existing Anthropic flows
- [ ] Document management unchanged

### Phase 2B (Ephemeral Mode)
- [ ] Processor configuration includes `document_storage_mode`
- [ ] Mistral ephemeral mode: Direct upload, signed URL storage
- [ ] Anthropic ephemeral mode: Base64 in snapshot
- [ ] Edge Function routes correctly based on mode + provider
- [ ] No persistent storage for ephemeral runs
- [ ] Results still stored and accessible

### Phase 2C (Workbench)
- [ ] Workbench uses ephemeral architecture
- [ ] No temporary document storage
- [ ] Execution results preserved

---

## References

- [Manual Processor Execution Phase 1](./manual-processor-execution.md)
- [Mistral Integration Plan](./mistral-integration-plan.md)
- [LLM Provider Configuration](./llm-provider-configuration.md)
- [Multi-Tenant Architecture](./multi-tenant-architecture.md)

---

**End of Document**
