# Mistral OCR Integration in Workbench

**Version:** 1.0.0
**Date:** 2025-10-29
**Status:** 📋 Planning
**Author:** ValidAI Team

---

## Table of Contents

- [Overview](#overview)
- [Architecture Design](#architecture-design)
- [Component Specification](#component-specification)
- [Edge Function Changes](#edge-function-changes)
- [File Upload Strategy](#file-upload-strategy)
- [Output Handling](#output-handling)
- [Implementation Phases](#implementation-phases)
- [Code Specifications](#code-specifications)
- [Testing Strategy](#testing-strategy)
- [Future Enhancements](#future-enhancements)

---

## Overview

### Purpose

Integrate Mistral's OCR capabilities (`mistral-ocr-latest` model) into the ValidAI workbench as a specialized mode accessible through Advanced Mode. This enables users to:

1. **Convert documents to markdown** with high-quality OCR
2. **Extract structured annotations** using predefined formats
3. **Download full results** for integration into workflows
4. **Test OCR configurations** before deploying in production processors

### Key Design Principles

✅ **No Database Changes** - Reuse existing `validai_llm_global_settings` table
✅ **No File Storage** - Direct upload from browser to Mistral (no Supabase Storage)
✅ **Separate Architecture** - Distinct component and execution path
✅ **Integrated Discovery** - Accessible via Advanced Mode toggle
✅ **Shared Infrastructure** - Reuse output display, API patterns, state management

### Use Cases

**Use Case A: Basic OCR**
- User uploads PDF document
- Selects "No annotation" format
- Receives markdown-formatted text
- Downloads for further processing

**Use Case B: Structured Extraction**
- User uploads contract PDF
- Selects "Chapter sections and content" annotation format
- Receives markdown + structured chapter/section data
- Downloads both markdown and JSON annotations

**Use Case C: Domain-Specific Processing**
- User uploads invoice PDF
- Selects "Line items and amounts" annotation format
- Receives structured line item data
- Integrates into accounting workflow

---

## Architecture Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User enables Advanced Mode in workbench                     │
│  2. User selects "mistral-ocr-latest" from model dropdown       │
│  3. WorkbenchOCRMode component appears                          │
│  4. User uploads file + selects annotation format               │
│  5. User clicks Test button                                     │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION (execute-workbench-test)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Detect OCR model from request                               │
│  2. Read file content from request body (base64)                │
│  3. Upload document to Mistral Files API                        │
│  4. Get signed URL (valid 24 hours)                             │
│  5. Call mistralClient.ocr.process()                            │
│     - Pass document URL                                         │
│     - Pass annotation format schema                             │
│  6. Receive markdown + annotations                              │
│  7. Return results to client                                    │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WORKBENCH OUTPUT                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Detect OCR result format                                    │
│  2. Display truncated markdown preview (~500 lines)             │
│  3. Show "Download full results" button                         │
│  4. Display structured annotations (if present)                 │
│  5. Provide download options:                                   │
│     - Full markdown file                                        │
│     - Annotations JSON file                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
WorkbenchClient
├── Header (with Advanced Mode toggle)
├── [Conditional] WorkbenchOCRMode (advancedMode && isOCRModel)
│   ├── File upload button
│   ├── Annotation format selector
│   └── Test button
├── [Conditional] WorkbenchInput (!isOCRModel)
└── WorkbenchOutput (shared, detects format)
    ├── OCR Results Display (if OCR result)
    │   ├── Truncated markdown preview
    │   ├── Annotations panel
    │   └── Download buttons
    └── Regular LLM Output (if standard result)
```

### State Management

**Extend existing `useWorkbenchStore`:**

```typescript
interface WorkbenchStore {
  // ... existing state ...

  // OCR-specific state
  ocrAnnotationFormat: 'none' | 'chapters' | 'dates' | 'items' | 'custom'
  ocrResults: {
    markdown: string
    annotations: any | null
    metadata: {
      pages: number
      executionTime: number
      model: string
    }
  } | null

  // OCR actions
  setOCRAnnotationFormat: (format: string) => void
  setOCRResults: (results: any) => void
  clearOCRResults: () => void
}
```

---

## Component Specification

### WorkbenchOCRMode Component

**File:** `apps/validai/components/workbench/workbench-ocr-mode.tsx`

#### Props

```typescript
interface WorkbenchOCRModeProps {
  processor: {
    processor_id: string
    [key: string]: unknown
  }
  selectedModel: string
}
```

#### UI Structure

```tsx
<div className="rounded-lg border bg-card p-6 space-y-4">
  {/* Header */}
  <div className="flex items-center gap-2">
    <FlaskConical className="h-5 w-5" />
    <h3 className="font-semibold">OCR Document Processing</h3>
  </div>

  {/* Description */}
  <p className="text-sm text-muted-foreground">
    Upload a document to extract text and structured data using Mistral OCR.
  </p>

  {/* File Upload */}
  <div className="space-y-2">
    <Label>Document</Label>
    <Button
      variant="outline"
      onClick={handleFileSelect}
      className="w-full justify-start"
    >
      {selectedFile
        ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})`
        : 'Select file to process'
      }
    </Button>
  </div>

  {/* Annotation Format Selector */}
  <div className="space-y-2">
    <Label>Annotation Format</Label>
    <Select
      value={annotationFormat}
      onValueChange={setAnnotationFormat}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <div>
            <div className="font-medium">No annotation</div>
            <div className="text-xs text-muted-foreground">
              Basic markdown conversion
            </div>
          </div>
        </SelectItem>
        <SelectItem value="chapters">
          <div>
            <div className="font-medium">Chapter sections and content</div>
            <div className="text-xs text-muted-foreground">
              Extract document structure
            </div>
          </div>
        </SelectItem>
        <SelectItem value="dates">
          <div>
            <div className="font-medium">Key dates and parties</div>
            <div className="text-xs text-muted-foreground">
              Contract analysis
            </div>
          </div>
        </SelectItem>
        <SelectItem value="items">
          <div>
            <div className="font-medium">Line items and amounts</div>
            <div className="text-xs text-muted-foreground">
              Invoice processing
            </div>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* Action Button */}
  <Button
    onClick={handleRunOCR}
    disabled={!selectedFile || isProcessing}
    className="w-full"
  >
    {isProcessing ? (
      <>
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Processing...
      </>
    ) : (
      'Process Document'
    )}
  </Button>
</div>
```

#### Component Logic

```typescript
export function WorkbenchOCRMode({ processor, selectedModel }: WorkbenchOCRModeProps) {
  const {
    selectedFile,
    ocrAnnotationFormat,
    setFile,
    setOCRAnnotationFormat,
    setOCRResults,
    clearOCRResults
  } = useWorkbenchStore()

  const ocrMutation = useOCRTest()

  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.txt,.html,.md,.doc,.docx'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        setFile({
          type: 'uploaded',
          file,
          name: file.name,
          size: file.size
        })
      }
    }
    input.click()
  }

  const handleRunOCR = async () => {
    if (!selectedFile) return

    try {
      clearOCRResults()

      // Read file as base64
      const fileContent = await readFileAsBase64(selectedFile.file)

      // Call Edge Function
      const result = await ocrMutation.mutateAsync({
        processor_id: processor.processor_id,
        model_id: selectedModel,
        annotation_format: ocrAnnotationFormat,
        file_content: fileContent,
        file_type: selectedFile.file.type as any
      })

      // Store results in state
      setOCRResults(result)

    } catch (error) {
      console.error('OCR processing failed:', error)
    }
  }

  const readFileAsBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (file.type === 'application/pdf') {
          // Extract base64 from data URL
          resolve(result.split(',')[1])
        } else {
          // For text files, convert to base64
          resolve(btoa(result))
        }
      }
      reader.onerror = reject

      if (file.type === 'application/pdf') {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })
  }

  return (
    // JSX structure from above
  )
}
```

### Integration into WorkbenchClient

**File:** `apps/validai/app/proc/[id]/workbench/workbench-client.tsx`

**Changes:**

```typescript
export function WorkbenchClient({ processorId, initialProcessor }: WorkbenchClientProps) {
  // ... existing code ...

  const { selectedModel } = useWorkbenchStore()

  // Detect if current model is OCR model
  const isOCRModel = selectedModel === 'mistral-ocr-latest'

  return (
    <div className="space-y-6">
      {/* Existing Header with Advanced Mode toggle */}
      <Collapsible ...>
        {/* ... existing header code ... */}
      </Collapsible>

      <Separator />

      {/* OCR Mode Component - Only shown in Advanced Mode with OCR model */}
      {advancedMode && isOCRModel && (
        <>
          <WorkbenchOCRMode
            processor={initialProcessor}
            selectedModel={selectedModel}
          />
          <Separator />
        </>
      )}

      {/* Regular Workbench Input - Hidden when OCR is active */}
      {!(advancedMode && isOCRModel) && (
        <>
          <WorkbenchInput
            processor={initialProcessor}
            operations={[]}
          />
          <Separator />
        </>
      )}

      {/* Output Section - Shared between both modes */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Output</h2>
        <WorkbenchOutput />
      </div>
    </div>
  )
}
```

---

## Edge Function Changes

### Detection Logic

**File:** `supabase/functions/execute-workbench-test/index.ts`

**Add detection helper:**

```typescript
/**
 * Check if the model is an OCR model
 */
function isOCRModel(modelId: string): boolean {
  return modelId === 'mistral-ocr-latest'
}
```

**Add route in main handler:**

```typescript
serve(async (req) => {
  // ... existing CORS handling ...

  try {
    const body = await req.json()

    // Detect OCR model and route accordingly
    if (isOCRModel(body.settings?.model_id)) {
      return await handleOCRRequest(req, body, supabase)
    } else {
      // Existing LLM handling
      return await handleLLMRequest(req, body, supabase)
    }
  } catch (error) {
    // ... error handling ...
  }
})
```

### OCR Request Handler

**Add new function in same file:**

```typescript
/**
 * Handle OCR processing request
 *
 * Flow:
 * 1. Validate request (file content required)
 * 2. Upload document to Mistral Files API
 * 3. Get signed URL
 * 4. Call mistralClient.ocr.process()
 * 5. Return markdown + annotations
 */
async function handleOCRRequest(
  req: Request,
  body: {
    processor_id: string
    model_id: string
    annotation_format: 'none' | 'chapters' | 'dates' | 'items'
    file_content: string  // Base64 encoded
    file_type: string     // MIME type
  },
  supabase: any
) {
  console.log('=== OCR Request ===')
  console.log(`Model: ${body.model_id}`)
  console.log(`Annotation format: ${body.annotation_format}`)
  console.log(`File type: ${body.file_type}`)

  // Validate file content
  if (!body.file_content) {
    return new Response(
      JSON.stringify({ error: 'No file content provided' }),
      { status: 400, headers: corsHeaders }
    )
  }

  // Get Mistral API key (same pattern as existing code)
  const apiKey = Deno.env.get('MISTRAL_API_KEY')
  if (!apiKey) {
    throw new Error('No Mistral API key available')
  }

  // Initialize Mistral client
  const mistralClient = new Mistral({ apiKey })

  try {
    // Convert base64 to buffer
    const fileBuffer = Buffer.from(body.file_content, 'base64')
    console.log(`File size: ${fileBuffer.length} bytes`)

    // Upload document to Mistral
    console.log('Uploading document to Mistral...')
    const uploadedFile = await mistralClient.files.upload({
      file: {
        fileName: `workbench-ocr-${Date.now()}.${getFileExtension(body.file_type)}`,
        content: fileBuffer
      },
      purpose: 'ocr'
    })
    console.log(`Document uploaded: ${uploadedFile.id}`)

    // Get signed URL
    const signedUrl = await mistralClient.files.getSignedUrl({
      fileId: uploadedFile.id
    })
    console.log('Signed URL obtained')

    // Build annotation format schema
    const annotationSchema = getAnnotationSchema(body.annotation_format)

    // Execute OCR
    console.log('Processing document with OCR...')
    const startTime = Date.now()

    const ocrResponse = await mistralClient.ocr.process({
      model: body.model_id,
      document: {
        type: 'document_url',
        documentUrl: signedUrl.url
      },
      documentAnnotationFormat: annotationSchema,
      includeImageBase64: false  // Don't include images in response (saves bandwidth)
    })

    const executionTime = Date.now() - startTime
    console.log(`OCR completed in ${executionTime}ms`)

    // Extract results
    const markdown = extractMarkdownFromOCR(ocrResponse)
    const annotations = body.annotation_format !== 'none'
      ? extractAnnotationsFromOCR(ocrResponse)
      : null

    // Return results
    return new Response(
      JSON.stringify({
        type: 'ocr',
        markdown,
        annotations,
        metadata: {
          model: body.model_id,
          executionTime,
          annotationFormat: body.annotation_format,
          fileType: body.file_type,
          timestamp: new Date().toISOString()
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('OCR processing error:', error)
    return new Response(
      JSON.stringify({
        error: 'OCR processing failed',
        details: error.message
      }),
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/markdown': 'md'
  }
  return map[mimeType] || 'bin'
}

/**
 * Get annotation schema based on selected format
 */
function getAnnotationSchema(format: string) {
  switch (format) {
    case 'none':
      return undefined

    case 'chapters':
      // Based on Mistral documentation example
      return {
        type: 'object',
        properties: {
          language: { type: 'string' },
          chapter_titles: {
            type: 'array',
            items: { type: 'string' }
          },
          urls: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }

    case 'dates':
      return {
        type: 'object',
        properties: {
          effective_date: { type: 'string' },
          expiration_date: { type: 'string' },
          parties: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string' }
              }
            }
          }
        }
      }

    case 'items':
      return {
        type: 'object',
        properties: {
          invoice_number: { type: 'string' },
          date: { type: 'string' },
          line_items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unit_price: { type: 'number' },
                amount: { type: 'number' }
              }
            }
          },
          total: { type: 'number' }
        }
      }

    default:
      return undefined
  }
}

/**
 * Extract markdown content from OCR response
 */
function extractMarkdownFromOCR(ocrResponse: any): string {
  // Mistral OCR returns markdown in the response
  // Structure: response.pages[].content (markdown per page)
  // We concatenate all pages

  if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
    return ocrResponse.pages
      .map((page: any) => page.content)
      .join('\n\n---\n\n')  // Page separator
  }

  return ocrResponse.content || ''
}

/**
 * Extract annotations from OCR response
 */
function extractAnnotationsFromOCR(ocrResponse: any): any {
  // Mistral returns document_annotation field when annotation format is provided
  return ocrResponse.document_annotation || null
}
```

### Request Type Definition

**Add to Edge Function types:**

```typescript
interface OCRTestRequest {
  processor_id: string
  model_id: string
  annotation_format: 'none' | 'chapters' | 'dates' | 'items'
  file_content: string  // Base64
  file_type: string     // MIME type
}

interface OCRTestResponse {
  type: 'ocr'
  markdown: string
  annotations: any | null
  metadata: {
    model: string
    executionTime: number
    annotationFormat: string
    fileType: string
    timestamp: string
  }
}
```

---

## File Upload Strategy

### Browser → Edge Function

**No Supabase Storage involved. Direct upload path:**

1. **Browser:** User selects file
2. **Browser:** File read as base64 string
3. **Browser:** Base64 sent in HTTP request body to Edge Function
4. **Edge Function:** Convert base64 to Buffer
5. **Edge Function:** Upload Buffer to Mistral Files API
6. **Edge Function:** Receive signed URL (valid 24 hours)
7. **Edge Function:** Pass signed URL to `ocr.process()`
8. **Edge Function:** Return results to browser
9. **Mistral:** Auto-deletes file after 24 hours

**Benefits:**
- ✅ No database storage needed
- ✅ No Supabase Storage costs
- ✅ Files automatically cleaned up by Mistral
- ✅ Simpler architecture (fewer moving parts)

**File Size Limits:**
- Browser: ~50MB practical limit for base64 encoding
- Mistral: 50MB max per their documentation
- Edge Function: No explicit limit (uses streaming)

---

## Output Handling

### WorkbenchOutput Enhancement

**File:** `apps/validai/components/workbench/workbench-output.tsx`

**Add OCR result detection and display:**

```typescript
export function WorkbenchOutput() {
  const { conversationHistory, ocrResults } = useWorkbenchStore()

  // Detect if last result is OCR
  const isOCRResult = ocrResults !== null

  if (isOCRResult) {
    return <OCRResultDisplay results={ocrResults} />
  } else {
    // Existing conversation display
    return <ConversationDisplay history={conversationHistory} />
  }
}
```

### OCR Result Display Component

**New file:** `apps/validai/components/workbench/ocr-result-display.tsx`

```typescript
interface OCRResultDisplayProps {
  results: {
    markdown: string
    annotations: any | null
    metadata: {
      model: string
      executionTime: number
      annotationFormat: string
      fileType: string
      timestamp: string
    }
  }
}

export function OCRResultDisplay({ results }: OCRResultDisplayProps) {
  const [activeTab, setActiveTab] = useState<'markdown' | 'annotations'>('markdown')

  // Truncate markdown to first 500 lines for display
  const truncatedMarkdown = truncateMarkdown(results.markdown, 500)
  const isTruncated = results.markdown.split('\n').length > 500

  const handleDownloadMarkdown = () => {
    const blob = new Blob([results.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ocr-results-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadAnnotations = () => {
    if (!results.annotations) return

    const json = JSON.stringify(results.annotations, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ocr-annotations-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Metadata Bar */}
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">Model:</span>
          <span className="font-medium">{results.metadata.model}</span>

          <span className="text-muted-foreground">Format:</span>
          <span className="font-medium">{results.metadata.annotationFormat}</span>

          <span className="text-muted-foreground">Time:</span>
          <span className="font-medium">{(results.metadata.executionTime / 1000).toFixed(2)}s</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadMarkdown}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Markdown
          </Button>

          {results.annotations && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadAnnotations}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Annotations
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          {results.annotations && (
            <TabsTrigger value="annotations">Annotations</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="markdown" className="space-y-4">
          {/* Truncation warning */}
          {isTruncated && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Preview shows first 500 lines. Download full results using the button above.
              </AlertDescription>
            </Alert>
          )}

          {/* Markdown preview */}
          <div className="rounded-lg border bg-card p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono">
              {truncatedMarkdown}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="annotations">
          {/* Annotations display */}
          <div className="rounded-lg border bg-card p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono">
              {JSON.stringify(results.annotations, null, 2)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Truncate markdown to specified number of lines
 */
function truncateMarkdown(markdown: string, maxLines: number): string {
  const lines = markdown.split('\n')
  if (lines.length <= maxLines) return markdown

  return lines.slice(0, maxLines).join('\n') + '\n\n... (truncated)'
}
```

---

## Implementation Phases

### Phase 1: Database Setup (5 minutes)

**Task:** Add Mistral OCR model to global settings

**File:** `supabase/migrations/YYYYMMDD_add_mistral_ocr_model.sql`

```sql
-- Add Mistral OCR model to global LLM settings
INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
) VALUES (
  'mistral',
  'mistral-ocr-latest',
  'Mistral OCR Latest',
  false,  -- Not default
  true,   -- Active and available
  jsonb_build_object(
    'default_temperature', 0.7,
    'default_max_tokens', 4096,
    'context_window', 128000,
    'supports_top_p', true,
    'supports_caching', false,
    'supports_thinking', false,
    'notes', 'OCR model for document processing. Use in Advanced Mode workbench.'
  )
);

-- Verify insertion
SELECT * FROM validai_llm_global_settings WHERE model_name = 'mistral-ocr-latest';
```

**Commands:**
```bash
# Apply migration
npx supabase db push

# Verify
npx supabase db query "SELECT * FROM validai_llm_global_settings WHERE provider = 'mistral'"
```

### Phase 2: Component Creation (3-4 hours)

**Tasks:**
1. Create `WorkbenchOCRMode` component
2. Add state management to `workbench-store.ts`
3. Create `OCRResultDisplay` component
4. Add helper utilities (file reading, truncation)

**Files to create:**
- `apps/validai/components/workbench/workbench-ocr-mode.tsx` (~200 lines)
- `apps/validai/components/workbench/ocr-result-display.tsx` (~150 lines)

**Files to modify:**
- `apps/validai/stores/workbench-store.ts` (+50 lines)

### Phase 3: Workbench Integration (1 hour)

**Tasks:**
1. Add conditional rendering to `WorkbenchClient`
2. Add model detection logic
3. Update output display routing

**Files to modify:**
- `apps/validai/app/proc/[id]/workbench/workbench-client.tsx` (+30 lines)
- `apps/validai/components/workbench/workbench-output.tsx` (+20 lines)

### Phase 4: Edge Function Implementation (3-4 hours)

**Tasks:**
1. Add OCR detection and routing logic
2. Implement `handleOCRRequest` function
3. Add annotation schema definitions
4. Add result extraction helpers
5. Update type definitions

**Files to modify:**
- `supabase/functions/execute-workbench-test/index.ts` (+300 lines)
- `supabase/functions/_shared/types.ts` (+50 lines)

**Dependencies:**
- `npm:@mistralai/mistralai` (already imported)

### Phase 5: React Query Hook (30 minutes)

**Task:** Create hook for OCR API calls

**File:** `apps/validai/hooks/use-ocr-test.ts`

```typescript
import { useMutation } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'

interface OCRTestInput {
  processor_id: string
  model_id: string
  annotation_format: string
  file_content: string
  file_type: string
}

export function useOCRTest() {
  return useMutation({
    mutationFn: async (input: OCRTestInput) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke(
        'execute-workbench-test',
        {
          body: input
        }
      )

      if (error) throw error
      return data
    }
  })
}
```

### Phase 6: Testing & Refinement (2-3 hours)

**Test Cases:**

1. **Basic OCR (no annotation)**
   - Upload simple PDF
   - Verify markdown output
   - Check truncation at 500 lines
   - Test download functionality

2. **Annotated OCR (chapters)**
   - Upload multi-chapter document
   - Verify markdown + annotations
   - Check JSON structure
   - Test both downloads

3. **Error Handling**
   - Upload invalid file
   - Upload oversized file
   - Test API key missing scenario
   - Test network timeout

4. **UI/UX**
   - Toggle Advanced Mode on/off
   - Switch between OCR and regular models
   - Verify component show/hide logic
   - Test responsive layout

**Testing Checklist:**
- [ ] Migration applied successfully
- [ ] Mistral OCR model appears in model dropdown
- [ ] Advanced Mode toggle shows/hides OCR component
- [ ] File upload works for PDF and text files
- [ ] All annotation formats process correctly
- [ ] Markdown truncation works at 500 lines
- [ ] Download buttons generate correct files
- [ ] Error messages display properly
- [ ] Edge Function logs are clear and helpful
- [ ] Mistral API key resolves correctly

---

## Code Specifications

### File Structure

```
apps/validai/
├── components/
│   └── workbench/
│       ├── workbench-ocr-mode.tsx          # NEW: OCR mode component
│       ├── ocr-result-display.tsx          # NEW: Results display
│       ├── workbench-input.tsx             # Existing
│       ├── workbench-output.tsx            # MODIFIED: Add routing
│       └── workbench-client.tsx            # MODIFIED: Add conditional
├── hooks/
│   └── use-ocr-test.ts                     # NEW: OCR API hook
├── stores/
│   └── workbench-store.ts                  # MODIFIED: Add OCR state
└── docs/
    └── mistral-ocr-workbench-integration.md # This document

supabase/
└── functions/
    ├── execute-workbench-test/
    │   └── index.ts                         # MODIFIED: Add OCR handling
    └── _shared/
        └── types.ts                         # MODIFIED: Add OCR types
```

### TypeScript Interfaces

```typescript
// Workbench store additions
interface WorkbenchStore {
  // OCR state
  ocrAnnotationFormat: 'none' | 'chapters' | 'dates' | 'items'
  ocrResults: OCRResult | null

  // OCR actions
  setOCRAnnotationFormat: (format: string) => void
  setOCRResults: (results: OCRResult) => void
  clearOCRResults: () => void
}

// OCR result structure
interface OCRResult {
  type: 'ocr'
  markdown: string
  annotations: any | null
  metadata: {
    model: string
    executionTime: number
    annotationFormat: string
    fileType: string
    timestamp: string
  }
}

// Edge Function request
interface OCRTestRequest {
  processor_id: string
  model_id: string
  annotation_format: 'none' | 'chapters' | 'dates' | 'items'
  file_content: string  // Base64
  file_type: string     // MIME type
}
```

### API Contract

**Endpoint:** `POST /functions/v1/execute-workbench-test`

**Request (OCR mode):**
```json
{
  "processor_id": "uuid",
  "model_id": "mistral-ocr-latest",
  "annotation_format": "chapters",
  "file_content": "base64_encoded_content",
  "file_type": "application/pdf"
}
```

**Response (Success):**
```json
{
  "type": "ocr",
  "markdown": "# Document Title\n\nContent...",
  "annotations": {
    "language": "en",
    "chapter_titles": ["Introduction", "Methodology", "Results"],
    "urls": ["https://example.com"]
  },
  "metadata": {
    "model": "mistral-ocr-latest",
    "executionTime": 3500,
    "annotationFormat": "chapters",
    "fileType": "application/pdf",
    "timestamp": "2025-10-29T12:00:00Z"
  }
}
```

**Response (Error):**
```json
{
  "error": "OCR processing failed",
  "details": "File too large (max 50MB)"
}
```

---

## Testing Strategy

### Unit Tests

**Component Tests:**
```typescript
// workbench-ocr-mode.test.tsx
describe('WorkbenchOCRMode', () => {
  it('renders file selector', () => {
    render(<WorkbenchOCRMode processor={mockProcessor} selectedModel="mistral-ocr-latest" />)
    expect(screen.getByText('Select file to process')).toBeInTheDocument()
  })

  it('shows annotation format options', () => {
    render(<WorkbenchOCRMode ... />)
    userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('No annotation')).toBeInTheDocument()
    expect(screen.getByText('Chapter sections and content')).toBeInTheDocument()
  })

  it('calls OCR API on submit', async () => {
    const mockOCR = jest.fn().mockResolvedValue({ markdown: 'test' })
    render(<WorkbenchOCRMode ... />)
    // Upload file, select format, click test
    // Assert mockOCR called with correct params
  })
})
```

### Integration Tests

**Edge Function Tests:**
```bash
# Test OCR endpoint with sample PDF
curl -X POST http://localhost:54321/functions/v1/execute-workbench-test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "processor_id": "test-uuid",
    "model_id": "mistral-ocr-latest",
    "annotation_format": "chapters",
    "file_content": "base64_pdf_content",
    "file_type": "application/pdf"
  }'
```

### End-to-End Tests

**User Flow:**
1. Navigate to processor workbench
2. Enable Advanced Mode
3. Select "Mistral OCR Latest" model
4. Upload test PDF document
5. Select "Chapter sections and content"
6. Click "Process Document"
7. Verify markdown preview appears
8. Verify annotations display correctly
9. Download markdown file
10. Download annotations JSON
11. Verify file contents

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

**1. Custom Annotation Schemas**
- Add "Custom" option in format dropdown
- Provide Zod schema editor
- Convert Zod to JSON Schema for Mistral
- Save custom schemas per organization

**2. Multi-Page Selection**
- Add page range selector (e.g., pages 1-5)
- Pass `pages` parameter to Mistral OCR API
- Display page-by-page results

**3. Batch Processing**
- Upload multiple documents
- Process in parallel or sequence
- Aggregate results view
- Bulk download options

**4. OCR Result History**
- Store OCR results in database (optional)
- View previous OCR executions
- Reuse annotations for similar documents

**5. Advanced Mistral Features**
- BBox annotations for charts/figures
- Image extraction and description
- Combined document + bbox annotations

**6. Export Formats**
- Export to DOCX (markdown → Word)
- Export to structured JSON
- Export to CSV (for tabular annotations)

### Integration with Processors

**Potential Use Case:**
- Use OCR as preprocessing step in processor operations
- Create "OCR + Extract" operation type
- Store preprocessed markdown in document metadata
- Reference in subsequent operations

---

## Appendix

### Annotation Format Examples

**Chapter Sections and Content:**
```json
{
  "language": "en",
  "chapter_titles": [
    "Introduction",
    "Methodology",
    "Results and Discussion",
    "Conclusion"
  ],
  "urls": [
    "https://example.com/reference1",
    "https://example.com/reference2"
  ]
}
```

**Key Dates and Parties:**
```json
{
  "effective_date": "2024-01-01",
  "expiration_date": "2025-12-31",
  "parties": [
    {
      "name": "Acme Corporation",
      "role": "Provider"
    },
    {
      "name": "Widget Industries",
      "role": "Client"
    }
  ]
}
```

**Line Items and Amounts:**
```json
{
  "invoice_number": "INV-2024-001",
  "date": "2024-10-15",
  "line_items": [
    {
      "description": "Professional Services",
      "quantity": 40,
      "unit_price": 150.00,
      "amount": 6000.00
    },
    {
      "description": "Software License",
      "quantity": 1,
      "unit_price": 2500.00,
      "amount": 2500.00
    }
  ],
  "total": 8500.00
}
```

### References

- **Mistral OCR Documentation:** https://docs.mistral.ai/capabilities/vision/
- **Mistral Files API:** https://docs.mistral.ai/api/
- **Workbench Architecture:** [manual-processor-execution.md](./manual-processor-execution.md)
- **LLM Config:** [llm-provider-configuration.md](./llm-provider-configuration.md)
- **Mistral Integration Plan:** [mistral-integration-plan.md](./mistral-integration-plan.md)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-29
**Status:** 📋 Ready for Implementation
