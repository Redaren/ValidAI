# LLM Workbench Architecture

The LLM Workbench is a multi-provider testing environment for LLM operations, featuring message composition controls, structured output generation, prompt caching, real-time execution tracking, and comprehensive LLM configuration management. Supports Anthropic Claude (via Vercel AI SDK), Google Gemini (native SDK), and Mistral AI with provider-specific optimizations.

**Implementation:** Phase 2.2.0 (Multi-Provider Support with Gemini)
**Documentation Date:** 2025-11-09
**Supported Providers:**
- **Anthropic Claude**: Via Vercel AI SDK v5 with prompt caching and extended thinking
- **Google Gemini**: Via Google GenAI SDK v1.29.0 with explicit caching and thinking mode
- **Mistral AI**: With document upload and JSON mode support

## Overview

The Workbench provides a sandboxed environment where users can:
- **Select LLM providers**: Choose between Anthropic Claude, Google Gemini, and Mistral AI
- **Select operation types**: Control output structure (Generic text or Structured validation)
- **Compose messages**: Explicit control over what gets sent (system prompt, file, cache markers)
- **Test operations**: Real LLM responses in two distinct modes (stateful/stateless)
- **Generate structured outputs**: Automatic schema validation for all operation types
- **Leverage prompt caching**: Provider-specific caching for cost optimization
  - Anthropic: 90% savings (automatic prefix caching)
  - Gemini: 75% savings (explicit caching with 50 KB threshold)
  - Mistral: No caching support
- **Enable extended thinking**: Complex reasoning for Anthropic and Gemini
- **Use citations**: Document grounding (Anthropic)
- **Track execution**: Real-time progress monitoring
- **View metadata**: Comprehensive per-message metadata with structured output visualization
- **Text-only queries**: All providers support queries without file upload

**Key Characteristics:**
- **Multi-Provider Support**: Seamless switching between Anthropic, Gemini, and Mistral
- **Provider-Specific Optimizations**: Each provider uses native features (caching, thinking, structured output)
- **Message Composition**: Settings act as toggles to construct each message
- **User-Controlled Caching**: Explicit "Create cache" toggle for supported providers
- **Dual Execution Paths**: File-based (with caching) and text-only (direct API) modes
- **Ephemeral**: State is not persisted across sessions
- **Performance-Optimized**: Database audit logging disabled by default (optional via environment flag)
- **Cost-optimized**: Provider-specific caching reduces token costs significantly
- **Auditable**: Execution audit trail available when enabled (adds ~500ms latency)

## Message Composition System

The Workbench uses **explicit toggles** to compose each API message. Users have full control over:
- Which operation type to use (determines output structure)
- What content to send (system prompt, file)
- Whether to create a cache
- Which mode (stateful/stateless) controls conversation history

### Settings as Message Builders

| Setting | Effect |
|---------|--------|
| **Operation type** | Determines execution mode (`generateObject` vs `generateText`) and response structure |
| **Mode: Stateful** | Include conversation history in messages array |
| **Mode: Stateless** | No conversation history (independent messages) |
| **Send system prompt** | Include `system` field in API request |
| **Send file** | Include document block in content array |
| **Create cache** | Add `cache_control` markers to system + document |
| **Thinking mode** | Add `thinking` parameter to API request |
| **Citations** | Add `citations: {enabled: true}` to document block |

### Execution Modes

**Stateful Mode:**
- Maintains conversation history across messages
- Sends full message timeline with each request
- User controls when to cache (via "Create cache" toggle)
- Use case: Multi-turn conversations, testing follow-up questions

**Stateless Mode:**
- Each message is independent (no history)
- Output cleared between messages
- User controls caching independently
- Use case: Testing different prompts, comparing responses

### Example Scenarios

#### Scenario 1: Create Cache with Document
```
Settings:
- Mode: Stateful
- Send system prompt: ON
- Send file: ON
- Create cache: ON

API Request (Separate File Message Architecture):
{
  "messages": [
    { "role": "system", "content": "..." },  // No cache control
    {
      "role": "user",  // SEPARATE file message
      "content": [{ "type": "file", "data": {...}, "cache_control": {"type": "ephemeral"} }]
    },
    {
      "role": "user",  // Prompt in separate message
      "content": "Analyze payment terms"
    }
  ]
}

Result: Cache created at file position
After send: "Create cache" auto-resets to OFF
```

#### Scenario 2: Use Existing Cache (Stateful)
```
Settings:
- Mode: Stateful
- Send system prompt: ON
- Send file: ON (MUST keep ON for cache hit)
- Create cache: OFF

API Request (Cache Hit with Conversation History):
{
  "messages": [
    { "role": "system", "content": "..." },  // No cache control - same prefix
    {
      "role": "user",  // SEPARATE file message - SAME position as Turn 1
      "content": [{ "type": "file", "data": {...}, "cache_control": {"type": "ephemeral"} }]
    },
    { "role": "assistant", "content": "..." },  // Previous response
    {
      "role": "user",  // New prompt
      "content": "Check liability clauses"
    }
  ]
}

Result: Cache hit (90% cost savings) - prefix up to file is identical
Note: User must keep "Send file" ON for cache to hit
```

#### Scenario 3: Independent Operations (Stateless)
```
Message 1:
- Mode: Stateless
- Send system prompt: ON
- Send file: ON
- Create cache: ON

Result: Cache created, output shown

Message 2 (after create cache auto-reset):
- Mode: Stateless
- Send system prompt: ON
- Send file: ON
- Create cache: OFF

Result: Cache hit, no conversation history sent
```

## Multi-Provider Architecture

The Workbench supports three LLM providers with provider-specific optimizations and features. Each provider is integrated using its native SDK to maximize capabilities and performance.

### Supported Providers

| Provider | SDK | Integration | Caching | Thinking | Structured Output | File Upload |
|----------|-----|-------------|---------|----------|-------------------|-------------|
| **Anthropic Claude** | Vercel AI SDK v5 | `@ai-sdk/anthropic` | ✅ Automatic (90% savings) | ✅ Extended thinking | ✅ Native (`generateObject`) | ✅ Via content blocks |
| **Google Gemini** | Google GenAI SDK v1.29.0 | `@google/genai` | ✅ Explicit (75% savings, 50KB min) | ✅ Thinking mode | ✅ Native (JSON Schema) | ✅ File API (48hr validity) |
| **Mistral AI** | Direct API | HTTP requests | ❌ Not supported | ❌ Not supported | ✅ JSON mode | ✅ Document upload |

### Provider Selection

**Configuration:** Models are configured in `llm_global_settings` with provider-specific settings:
```sql
INSERT INTO llm_global_settings (provider, model_name, display_name, is_active)
VALUES
  ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', true),
  ('google', 'gemini-2.0-flash-thinking-exp-01-21', 'Gemini 2.0 Flash Thinking', true),
  ('mistral', 'mistral-large-latest', 'Mistral Large', true);
```

**Runtime Selection:** Users select models via the model selector UI. The Edge Function resolves the provider from the model configuration and routes to the appropriate integration.

### Execution Paths

#### Text-Only Queries (All Providers)
All providers support text-only queries without file upload:
- **Anthropic**: Uses `generateText()` or `generateObject()` with text messages
- **Gemini**: Direct API call with `generateContent()` and JSON Schema
- **Mistral**: HTTP POST with JSON payload

#### File-Based Queries
When files are uploaded, providers use different approaches:
- **Anthropic**: Inline content blocks with automatic caching
- **Gemini**:
  - Upload to Gemini File API (48-hour validity)
  - Optional explicit cache creation (50 KB threshold)
  - Uses shared executor or direct API based on file size
- **Mistral**: Direct document upload in request

### Provider-Specific Features

#### Anthropic Claude
- **Caching**: Automatic prefix caching with `cache_control` markers (5-min TTL, 90% savings)
- **Thinking**: Extended thinking via `providerOptions.anthropic.thinking` (budget tokens)
- **Structured Output**: Native via `generateObject()` with Zod schemas
- **Citations**: Document grounding with citation blocks
- **Context Window**: 200K tokens for Claude Sonnet 4.5

#### Google Gemini
- **Caching**: Explicit cache creation with `createGeminiCache()` (5-min TTL, 75% savings)
  - Requires 50 KB minimum document size
  - Graceful fallback for smaller documents
  - Cache write happens during cache creation (not per-operation)
- **Thinking**: Native thinking mode via `thinkingConfig`
  - Budget tokens configurable
  - Thoughts included in response when enabled
  - Summary extraction from thought parts
- **Structured Output**: Native via `responseSchema` (JSON Schema format)
  - Automatic Zod-to-JSON-Schema conversion
  - All 7 operation types supported
- **File Upload**: Gemini File API with 48-hour validity
  - MIME type detection
  - Automatic cleanup after expiration
- **Dual-Path Architecture**:
  - **With File**: Uses shared executor, supports caching
  - **Without File**: Direct API call, no caching overhead

#### Mistral AI
- **Structured Output**: JSON mode via `response_format`
- **File Upload**: Direct document upload in request
- **OCR Support**: Automatic text extraction from images/PDFs
- **No Caching**: Cost optimization not available
- **No Thinking**: Standard response only

### Token Metrics by Provider

**Anthropic:**
```json
{
  "usage": {
    "promptTokens": 1042,
    "completionTokens": 245,
    "totalTokens": 1287
  },
  "providerMetadata": {
    "anthropic": {
      "cacheReadInputTokens": 950,
      "cacheCreationInputTokens": 1000
    }
  }
}
```

**Gemini:**
```json
{
  "usage": {
    "inputTokens": 1042,
    "outputTokens": 245
  },
  "providerMetadata": {
    "google": {
      "usage": {
        "cachedContentTokenCount": 950,
        "thoughtsTokenCount": 128,
        "totalTokenCount": 1287
      }
    }
  }
}
```

**Mistral:**
```json
{
  "usage": {
    "prompt_tokens": 1042,
    "completion_tokens": 245,
    "total_tokens": 1287
  }
}
```

## Operation Types & Structured Outputs

The Workbench supports multiple operation types that determine how the LLM processes requests and structures responses. This is achieved through Vercel AI SDK's dual execution modes: `generateText()` for free-form responses and `generateObject()` for schema-validated structured data.

### Available Operation Types

| Type | Display Name | Status | Output Structure | Use Case |
|------|-------------|--------|------------------|----------|
| `generic` | Generic | ✅ Active | Free-form text | General analysis, open-ended questions |
| `validation` | True / False | ✅ Active | `{result: boolean, comment: string}` | Binary validation, compliance checks |
| `extraction` | Extraction | 🔜 Planned | Structured key-value pairs | Data extraction from documents |
| `rating` | Rating | 🔜 Planned | Numeric score with rationale | Quality assessment, scoring |
| `classification` | Classification | 🔜 Planned | Category with confidence | Document categorization |
| `analysis` | Analysis | 🔜 Planned | Structured findings | Comprehensive analysis |

### Operation Type Selection

**UI Component:** `components/workbench/operation-type-sheet.tsx`

Users select operation types via a Sheet modal (same pattern as model selector):
- Click "Operation type" label to open selector
- View all types with descriptions and icons
- Active types show "Structured" badge
- Planned types show "Coming Soon" badge
- Selection persists in workbench store

### Execution Strategy

**Configuration:** `lib/operation-types/index.ts`

Each operation type has a configuration defining:
```typescript
interface OperationTypeConfig {
  id: OperationType                    // Database enum value
  displayName: string                   // User-facing name
  description: string                   // What this operation does
  icon: string                          // Emoji for UI
  useStructuredOutput: boolean          // generateObject vs generateText
  schema: z.ZodSchema | null           // Validation schema (null for generic)
  promptGuidance: string                // Help text for users
}
```

**Edge Function Logic:**
```typescript
// Determine execution mode based on operation type
const useStructuredOutput = body.operation_type === 'validation'
const outputSchema = body.operation_type === 'validation' ? validationSchema : null

// Workaround for Vercel AI SDK issue #7220
// When both thinking and structured output are needed, use generateText with tools
const useHybridApproach = useStructuredOutput && outputSchema && body.settings.thinking

if (useHybridApproach) {
  // Use generateText with manual tool definition to avoid thinking+tool_choice conflict
  response = await generateText({
    model: anthropicProvider(modelToUse),
    messages,
    tools: {
      json_response: {
        description: 'Provide the structured validation response',
        inputSchema: jsonSchema({...})  // AI SDK v5 format
      }
    },
    toolChoice: 'auto',
    providerOptions: { anthropic: { thinking: {...} } }
  })
  // Extract structured output from tool calls
  structuredOutput = response.toolCalls.find(tc => tc.toolName === 'json_response')?.args
} else if (useStructuredOutput && outputSchema) {
  // Standard structured output (no thinking)
  response = await generateObject({
    model: anthropicProvider(modelToUse),
    schema: outputSchema,
    messages,
    // ...settings
  })
  structuredOutput = response.object
} else {
  // Generic free-form text
  response = await generateText({
    model: anthropicProvider(modelToUse),
    messages,
    // ...settings
  })
}

return {
  execution_id,
  response: responseText,
  structured_output: structuredOutput,
  thinking_blocks: thinkingBlocks,  // Extracted from response.reasoning array
  // ...metadata
}
```

**Known Issue:** Vercel AI SDK [#7220](https://github.com/vercel/ai/issues/7220) - `generateObject()` forces `tool_choice` which conflicts with Anthropic's thinking mode. The hybrid approach works around this by using `generateText()` with manual tool definition and `toolChoice: 'auto'` when both features are needed.

### Structured Output Schemas

**Location:** `lib/operation-types/schemas.ts`

**Validation Schema (True/False):**
```typescript
export const validationOutputSchema = z.object({
  result: z.boolean().describe('The validation result (true/false)'),
  comment: z.string().describe('Reasoning and explanation for the decision')
})
```

Example output:
```json
{
  "result": true,
  "comment": "The document meets GDPR requirements because it includes explicit consent mechanisms, data processing explanations, and user rights information as required by Articles 6, 13, and 15."
}
```

### Output Visualization

**Component:** `components/workbench/structured-output-visualizer.tsx`

Structured outputs are automatically detected and rendered with:
- Traffic-light visualization for boolean results (🟢 Green = true, 🔴 Red = false)
- Formatted JSON display with syntax highlighting
- Toggle between formatted and raw JSON views
- XML structure visualization
- Copy to clipboard functionality

**Detection Logic in workbench-output.tsx:**
```typescript
const hasStructuredOutput = !!assistantMsg.structured_output

if (hasStructuredOutput) {
  // Render with visualizer
  return (
    <StructuredOutputVisualizer
      data={assistantMsg.structured_output}
      originalType="json"
      showRawToggle={true}
    />
  )
}
```

### Future Operation Types

**Extraction:**
```typescript
// Extract specific fields from documents
schema: z.object({
  extracted_data: z.record(z.string(), z.any()),
  confidence: z.number().min(0).max(1)
})
```

**Rating:**
```typescript
// Numeric scoring with qualitative feedback
schema: z.object({
  score: z.number(),
  max_score: z.number().optional(),
  rationale: z.string(),
  strengths: z.array(z.string()).optional(),
  improvements: z.array(z.string()).optional()
})
```

**Classification:**
```typescript
// Categorization with confidence scores
schema: z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  alternative_categories: z.array(z.object({
    category: z.string(),
    confidence: z.number()
  })).optional()
})
```

## Architecture Layers

### 1. Configuration Hierarchy (3-Tier System)

The system follows a strict inheritance hierarchy for LLM configuration:

```
┌─────────────────────────┐
│   Global Settings       │ ← System defaults (managed by admins)
│   llm_global_settings   │    - Available models
│                         │    - Default parameters
└──────────┬──────────────┘
           │ inherits
           ▼
┌─────────────────────────┐
│ Organization Config     │ ← Custom API keys & models (Pro/Enterprise)
│ organizations.          │    - Encrypted API keys
│   llm_configuration     │    - Available model selection
└──────────┬──────────────┘
           │ inherits
           ▼
┌─────────────────────────┐
│   Processor Config      │ ← Selected model for this processor
│   processors.           │    - Which model to use
│     configuration       │    - System prompt
└──────────┬──────────────┘
           │ inherits
           ▼
┌─────────────────────────┐
│   Operation Config      │ ← Per-operation overrides (future)
│   operations.           │    - Temperature, thinking, citations
│     configuration       │    - Custom settings per operation
└──────────┬──────────────┘
           │ ephemeral
           ▼
┌─────────────────────────┐
│   Workbench State       │ ← Test-time settings (NOT persisted)
│   Zustand Store         │    - Mode (stateful/stateless)
│   (Client-side only)    │    - Conversation history
│                         │    - Feature toggles
└─────────────────────────┘
```

**Resolution Logic:**
1. Edge Function extracts `user_id` from incoming JWT
2. Database function queries `organization_members` to get `organization_id`
3. Check if processor has `selected_model_id`
4. If yes, resolve from organization's `available_models` (or global if not found)
5. If no processor config, use organization's `default_model_id`
6. If no organization config, use global default model
7. Merge with operation/workbench settings (temperature, thinking, etc.)

### 2. Database Schema

#### Core Tables

##### `llm_global_settings`
System-wide model availability and defaults.

```sql
CREATE TABLE llm_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'mistral', 'openai', 'google', 'meta')),
  model_name text NOT NULL,
  display_name text NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  configuration jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

##### `organizations.llm_configuration`
Organization-specific API keys and model selection.

```sql
ALTER TABLE organizations ADD COLUMN llm_configuration jsonb;
```

**Structure:**
```json
{
  "api_keys_encrypted": {
    "anthropic": "encrypted_base64_string"
  },
  "available_models": [
    {
      "id": "sonnet",
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "display_name": "Claude 3.5 Sonnet"
    }
  ],
  "default_model_id": "sonnet"
}
```

##### `processors.configuration`
Processor-level model selection.

```sql
ALTER TABLE processors ADD COLUMN configuration jsonb;
```

**Structure:**
```json
{
  "selected_model_id": "opus",
  "settings_override": {
    "temperature": 0.2,
    "max_tokens": 8192
  }
}
```

##### `workbench_executions`
Optional audit trail for test executions (disabled by default for performance).

**Performance Note:** Logging is disabled by default to eliminate ~500-1000ms latency from 3 database roundtrips per execution. Currently no UI consumes this data (no history viewer, analytics, or replay features exist).

**To enable:** Set `ENABLE_WORKBENCH_AUDIT_LOG=true` in Edge Function environment variables.

```sql
CREATE TABLE workbench_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_id uuid REFERENCES processors(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  prompt text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  model_used text,
  response text,
  partial_response text,
  thinking_blocks jsonb,
  citations jsonb,
  tokens_used jsonb,
  execution_time_ms integer,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE POLICY "Users can view their own workbench executions"
  ON workbench_executions FOR SELECT
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE workbench_executions;
```

### 3. Edge Function Architecture

#### `execute-workbench-test`

**Location:** `supabase/functions/execute-workbench-test/index.ts`
**Version:** 2.2.0

**LLM Integration:** Multi-provider support with:
- **Anthropic Claude**: Vercel AI SDK with `@ai-sdk/anthropic` provider
- **Google Gemini**: Native Google GenAI SDK v1.29.0
- **Mistral AI**: Direct HTTP API requests

**Performance Optimization:**
The Edge Function includes an optional audit logging system controlled by `ENABLE_WORKBENCH_AUDIT_LOG` environment variable (default: `false`).

When disabled (default):
- Eliminates 3 database roundtrips per execution (INSERT pending → UPDATE processing → UPDATE completed)
- Reduces latency by ~500-1000ms per test
- Single database call to `get_llm_config_for_run()` for configuration resolution

When enabled:
- Full audit trail in `workbench_executions` table
- Real-time status updates via Supabase Realtime
- Useful for debugging and compliance requirements

**Configuration Resolution:**
```typescript
// Single call replaces two previous calls (organization_id + config)
const { data: llmConfig } = await supabase.rpc('get_llm_config_for_run', {
  p_processor_id: body.processor_id,
  p_user_id: user.id
})
// Returns: model, api_key_encrypted, organization_id, settings in one roundtrip
```

**Provider Branching Logic:**

The Edge Function determines the provider from the model configuration and routes to the appropriate integration:

```typescript
// Determine provider from model name
const provider = llmConfig.model.startsWith('claude') ? 'anthropic' :
                 llmConfig.model.startsWith('gemini') ? 'google' :
                 llmConfig.model.startsWith('mistral') ? 'mistral' : null

if (!provider) {
  throw new Error(`Unknown provider for model: ${llmConfig.model}`)
}

// API Key Resolution (provider-specific)
let apiKey: string

if (provider === 'anthropic') {
  // Decrypt organization key or use environment variable
  if (llmConfig.api_key_encrypted) {
    const { data: decryptedKey } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: llmConfig.api_key_encrypted,
      p_org_id: llmConfig.organization_id
    })
    apiKey = decryptedKey
  } else {
    apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  }
} else if (provider === 'google') {
  // Google API key resolution
  if (llmConfig.api_key_encrypted) {
    const { data: decryptedKey } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: llmConfig.api_key_encrypted,
      p_org_id: llmConfig.organization_id
    })
    apiKey = decryptedKey
  } else {
    apiKey = Deno.env.get('GOOGLE_API_KEY')
  }
} else if (provider === 'mistral') {
  // Mistral API key resolution
  if (llmConfig.api_key_encrypted) {
    const { data: decryptedKey } = await supabase.rpc('decrypt_api_key', {
      p_ciphertext: llmConfig.api_key_encrypted,
      p_org_id: llmConfig.organization_id
    })
    apiKey = decryptedKey
  } else {
    apiKey = Deno.env.get('MISTRAL_API_KEY')
  }
}

// Execute based on provider
let response: any

if (provider === 'anthropic') {
  // Anthropic execution via Vercel AI SDK
  const anthropicProvider = createAnthropic({ apiKey })
  response = await generateText({
    model: anthropicProvider(modelToUse),
    messages,
    system,
    maxTokens: body.settings.max_tokens || 4096,
    providerOptions: {
      anthropic: {
        thinking: body.settings.thinking,
        cacheControl: body.settings.create_cache
      }
    }
  })
} else if (provider === 'google') {
  // Gemini execution - dual path based on file upload
  const ai = new GoogleGenAI(apiKey)

  if (body.send_file && body.file_content) {
    // Path A: File-based with caching
    const geminiFile = await uploadDocumentToGemini(ai, fileBuffer, fileName, mimeType)

    let geminiCacheName: string | null = null
    if (fileSizeKB >= 50 && body.settings.create_cache) {
      geminiCacheName = await createGeminiCache(ai, modelToUse, geminiFile.uri, ...)
    }

    response = await executeLLMOperationGemini(params, supabase, geminiCacheRef)
  } else {
    // Path B: Text-only direct API
    const operationSchema = getOperationTypeSchema(body.operation_type)
    const jsonSchema = zodToJsonSchema(operationSchema, { $refStrategy: 'none' })

    response = await ai.models.generateContent({
      model: modelToUse,
      contents: body.new_prompt,
      config: {
        temperature: body.settings.temperature ?? 1.0,
        maxOutputTokens: body.settings.max_tokens || 4096,
        responseMimeType: 'application/json',
        responseSchema: cleanedSchema,
        ...(body.settings.thinking && {
          thinkingConfig: {
            thinkingBudget: body.settings.thinking.budget_tokens,
            includeThoughts: true
          }
        })
      },
      systemInstruction: systemInstruction
    })
  }
} else if (provider === 'mistral') {
  // Mistral execution via direct API
  response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelToUse,
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: body.settings.temperature,
      max_tokens: body.settings.max_tokens
    })
  })
}
```

**System Prompt Handling (User-Controlled):**
```typescript
if (body.send_system_prompt && body.system_prompt) {
  if (body.settings.create_cache) {
    // User wants to create cache: Use array format with cache_control
    system = [{
      type: 'text',
      text: body.system_prompt,
      cache_control: { type: 'ephemeral' }  // 5-minute TTL
    }]
  } else {
    // No cache creation: Simple string format
    system = body.system_prompt
  }
}
```

**Message Building (Separate File Architecture):**
```typescript
// CRITICAL: Separate file message architecture for cache hits
// Files are sent as standalone user messages BEFORE conversation history

// Step 1: Add system message (no cache control)
if (body.send_system_prompt && body.system_prompt) {
  messages.push({
    role: 'system',
    content: body.system_prompt
  })
}

// Step 2: Add file as SEPARATE user message (WITH cache control)
// This positions file BEFORE conversation history for consistent cache prefix
if (body.send_file && body.file_content) {
  const fileBlock: any = {
    type: 'file',
    data: pdfBuffer,
    mediaType: 'application/pdf'
  }

  // Add cache_control when caching is enabled
  if (body.settings.create_cache || hasPreviousCachedContent) {
    fileBlock.providerOptions = {
      anthropic: {
        cacheControl: { type: 'ephemeral' }
      }
    }
  }

  // File gets its own user message
  messages.push({
    role: 'user',
    content: [fileBlock]
  })
}

// Step 3: Add conversation history (text exchanges only, files excluded)
if (body.mode === 'stateful' && body.conversation_history.length > 0) {
  body.conversation_history.forEach(msg => {
    // Skip file messages - they're sent separately at beginning
    if (msg.metadata?.fileSent) return

    messages.push({
      role: msg.role,
      content: msg.content  // Text content only
    })
  })
}

// Step 4: Add current prompt as SEPARATE user message
messages.push({
  role: 'user',
  content: body.new_prompt
})

// Result: [system, user(file_with_cache), ...history..., user(prompt)]
// On next turn: [system, user(file_with_cache), assistant, ...history..., user(prompt)]
// Cache hits because prefix (system + file) remains identical
```

**Response with Metadata (Vercel AI SDK):**
```typescript
return {
  execution_id: executionId,
  response: responseText,
  thinking_blocks: thinkingBlocks,  // Extracted from response.reasoning
  metadata: {
    mode: body.mode,
    cacheCreated: body.settings.create_cache,
    systemPromptSent: body.send_system_prompt && !!body.system_prompt,
    thinkingEnabled: !!body.settings.thinking,
    citationsEnabled: body.settings.citations_enabled,
    // Token usage from Vercel AI SDK
    inputTokens: response.usage?.promptTokens,
    outputTokens: response.usage?.completionTokens,
    cachedReadTokens: response.providerMetadata?.anthropic?.cacheReadInputTokens,
    cachedWriteTokens: response.providerMetadata?.anthropic?.cacheCreationInputTokens,
    executionTimeMs: executionTime,
    modelUsed: modelToUse
  },
  tokensUsed: {...},
  timestamp: new Date().toISOString()
}
```

### 4. Frontend State Management

#### Workbench Store (Zustand)

**Location:** `stores/workbench-store.ts`

```typescript
interface WorkbenchStore {
  // Mode Management
  mode: 'stateful' | 'stateless'
  sendSystemPrompt: boolean
  sendFile: boolean

  // File, Model & Operation Type Selection
  selectedFile: SelectedFile
  selectedModel: string
  selectedOperationType: OperationType  // 'generic' | 'validation' | 'extraction' | etc.

  // Prompts
  systemPrompt: string
  operationPrompt: string

  // Feature Toggles
  thinkingMode: boolean
  citations: boolean
  toolUse: boolean
  createCache: boolean  // User-controlled, auto-resets after send

  // Conversation State
  conversationHistory: ConversationMessage[]
  // Note: Stores EXACT content structure sent to Anthropic (string or content blocks array)
  // This ensures perfect cache hits by preserving message structure including documents

  // Real-time Tracking
  currentExecutionId: string | null
  executionStatus: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

  // Actions
  setMode: (mode: 'stateful' | 'stateless') => void
  setOperationType: (operationType: OperationType) => void
  toggleSystemPrompt: () => void
  toggleSendFile: () => void
  toggleCreateCache: () => void
  resetCacheToggle: () => void  // Auto-called after message sent
  subscribeToExecution: (executionId: string) => void
}
```

**Mode Change Behavior:**
```typescript
setMode: (mode) => {
  if (mode === 'stateless') {
    // Stateless: clear history and output (but don't touch cache settings)
    set({
      mode: 'stateless',
      conversationHistory: [],
      output: null,
      error: null
    })
  } else {
    // Stateful: just set mode (cache is user-controlled)
    set({ mode: 'stateful' })
  }
}
```

**Create Cache Auto-Reset:**
```typescript
// After successful message send
if (createCache) {
  resetCacheToggle()  // Sets createCache back to false
}
```

## UI Components

### Workbench Input

**Location:** `components/workbench/workbench-input.tsx`

**Settings Layout:**
```
┌──────────────────────────────────────┐
│ Settings                             │
├──────────────────────────────────────┤
│ Mode              [Stateful] [Stateless] │
│ Send system prompt     [Toggle]      │  ← Only if prompt exists
│ Operation type         True / False  │  ← Clickable, opens type selector
│ File                   test.pdf / 3.5 mb │
│   Send file            [Toggle]      │  ← Indented, only if file selected
│ Model                  Claude 3.5 Haiku │
│ Create cache           [Toggle]      │  ← User controls, auto-resets to OFF
│ Thinking mode          [Toggle]      │
│ Citations              [Toggle]      │
│ Tool use               [Toggle]      │
└──────────────────────────────────────┘
```

**Toggle Behaviors:**

**Mode Buttons:**
- Two buttons: "Stateful" and "Stateless"
- Active mode highlighted with primary color
- Stateless mode clears conversation history

**Send file:**
- Only shown when file is selected
- Controls whether file is included in THIS message
- Allows testing cache hits without re-sending document

**Create cache:**
- User toggles ON to create cache with THIS message
- Adds `cache_control` markers to system prompt and document
- **Auto-resets to OFF** after message is sent
- Following messages can hit the cache by sending same content

### Advanced Settings

**Location:** Collapsible header in `app/proc/[id]/workbench/workbench-client.tsx`

**Component:** `components/workbench/workbench-advanced-settings.tsx`

**Purpose:** Override optional Anthropic API parameters with explicit user control over what gets sent to the API.

#### Parameter Overview

| Parameter | Type | Default | Override Toggle | Sent When |
|-----------|------|---------|----------------|-----------|
| `max_tokens` | Required | 4096 | N/A (always sent) | Always |
| `thinking.budget_tokens` | Conditional | 10000 | Via "Thinking mode" | When thinking mode ON |
| `temperature` | Optional | 1.0 | Yes | When override enabled |
| `top_p` | Optional | 1.0 | Yes | When override enabled |
| `top_k` | Optional | 40 | Yes | When override enabled |
| `stop_sequences` | Optional | [] | Yes | When override enabled & has values |

#### Override Toggle Pattern

Each optional parameter follows this pattern:

**Toggle OFF** (default):
- Parameter NOT sent to API
- LLM uses its built-in default value
- UI shows: "LLM will use its default: X"

**Toggle ON**:
- Parameter sent with user's configured value
- UI shows: "Default: X → Sending: Y"
- User can adjust value via input/slider

#### Parameter Details

**Max Tokens** (Required):
- Always sent to API (required by Anthropic)
- Range: 1 - 200,000
- Default: 4,096
- No toggle (always active)

**Thinking Budget** (Conditional):
- Only visible when "Thinking mode" toggle is ON
- Range: 1,024 - (max_tokens - 1)
- Default: 10,000
- Validation: Must be < max_tokens
- No toggle (controlled by thinking mode toggle)

**Temperature** (Optional):
- Range: 0.0 - 1.0 (slider with 0.1 steps)
- Default: 1.0
- Incompatibility: Disabled when thinking mode is ON
- Lower = focused/deterministic, Higher = creative

**Top P** (Optional):
- Range: 0.0 - 1.0 (slider with 0.01 steps)
- Default: 1.0
- Nucleus sampling threshold

**Top K** (Optional):
- Range: 0+ (integer input)
- Default: 40
- Sample from top K token options

**Stop Sequences** (Optional):
- Array of custom strings (max 4)
- Default: [] (empty)
- Claude stops generating when encountering these strings

#### Smart Behaviors

**When "Thinking mode" is toggled ON**:
1. Check if `max_tokens < thinking_budget + 1000`
2. If yes, auto-increase `max_tokens` to 16,000
3. Auto-disable `temperature` override (incompatible with thinking)
4. Show `thinking_budget` field

**When "Thinking mode" is toggled OFF**:
1. Hide `thinking_budget` field
2. Re-enable `temperature` toggle

**When `max_tokens` is changed**:
1. If `thinking_budget ≥ max_tokens`: Auto-reduce to `max_tokens - 1000`
2. Minimum thinking_budget enforced: 1,024

**When `temperature` toggle is changed**:
1. If thinking mode is ON: Prevented (toggle disabled)

#### Request Building Logic

From `components/workbench/workbench-input.tsx`:

```typescript
settings: {
  model_id: selectedModel,
  citations_enabled: citations,
  create_cache: createCache,

  // Always send max_tokens (required)
  max_tokens: advancedSettings.maxTokens,

  // Thinking (only if thinking mode toggle is ON)
  thinking: thinkingMode ? {
    type: 'enabled',
    budget_tokens: advancedSettings.thinkingBudget
  } : undefined,

  // Optional overrides (only sent when enabled)
  temperature: advancedSettings.temperature.enabled
    ? advancedSettings.temperature.value
    : undefined,

  top_p: advancedSettings.topP.enabled
    ? advancedSettings.topP.value
    : undefined,

  top_k: advancedSettings.topK.enabled
    ? advancedSettings.topK.value
    : undefined,

  stop_sequences: advancedSettings.stopSequences.enabled &&
                  advancedSettings.stopSequences.values.length > 0
    ? advancedSettings.stopSequences.values
    : undefined
}
```

#### State Management

**Store:** `stores/workbench-store.ts`

**Structure:**
```typescript
interface AdvancedSettings {
  // Always sent (required by API)
  maxTokens: number

  // Conditional (sent when thinking mode is ON)
  thinkingBudget: number

  // Optional overrides (only sent when enabled)
  temperature: {
    enabled: boolean
    value: number
  }
  topP: {
    enabled: boolean
    value: number
  }
  topK: {
    enabled: boolean
    value: number
  }
  stopSequences: {
    enabled: boolean
    values: string[]
  }
}
```

**Actions:**
- `setMaxTokens(tokens)` - Set max tokens with auto-adjust for thinking budget
- `setThinkingBudgetValue(tokens)` - Set thinking budget
- `toggleTemperature()` - Enable/disable temperature override
- `setTemperatureValue(value)` - Set temperature value
- `toggleTopP()` - Enable/disable top P override
- `setTopPValue(value)` - Set top P value
- `toggleTopK()` - Enable/disable top K override
- `setTopKValue(value)` - Set top K value
- `toggleStopSequences()` - Enable/disable stop sequences
- `addStopSequence(sequence)` - Add stop sequence (max 4)
- `removeStopSequence(index)` - Remove stop sequence
- `resetAdvancedSettings()` - Reset all to defaults

#### "Reset All" Behavior

When clicked:
- `maxTokens` → 4096
- `thinkingBudget` → 10000
- `temperature` → { enabled: false, value: 1.0 }
- `topP` → { enabled: false, value: 1.0 }
- `topK` → { enabled: false, value: 40 }
- `stopSequences` → { enabled: false, values: [] }

All override toggles turn OFF, reverting to LLM defaults.

### Workbench Output

**Location:** `components/workbench/workbench-output.tsx`

**Message Display with Metadata:**
```
┌────────────────────────────────────────────────────────┐
│ You                                   10:34 AM          │
│ Mode: Stateful │ Cache: ✓ │ System Prompt: ✓ │        │
│ Thinking: ✗ │ Citations: ✗                            │
│                                                        │
│ Input: 1042 tokens (950 cached) │ Output: 0 tokens    │
├────────────────────────────────────────────────────────┤
│ What are the payment terms in this contract?          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ Assistant                             10:34 AM          │
│ Mode: Stateful │ Cache: ✓ │ System Prompt: ✗ │        │
│ Thinking: ✗ │ Citations: ✗                            │
│                                                        │
│ Input: 1042 tokens (950 cached) │ Output: 245 tokens  │
│ Time: 1.2s                                             │
├────────────────────────────────────────────────────────┤
│ The payment terms are Net 30, with a 2% discount...   │
└────────────────────────────────────────────────────────┘
```

**Per-Message Metadata:**
- Mode indicator (Stateful/Stateless with color coding)
- Feature flags (Cache, System Prompt, Thinking, Citations)
- Token breakdown (Input/Output with cached breakdown)
- Execution time (for assistant messages)
- Timestamp

**Features:**
- Real-time status badges (⏳ Pending, ⚡ Processing, ✓ Completed, ✗ Failed)
- Token statistics with cache breakdown
- Export conversation as JSON
- Clear conversation button

## Multi-Provider Integration

The workbench integrates with three LLM providers using provider-specific SDKs and APIs. Each provider is integrated natively to maximize performance and feature utilization.

### Anthropic Claude (Vercel AI SDK)

**SDK:** Vercel AI SDK v5 with `@ai-sdk/anthropic` provider

**Integration:**
```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, generateObject } from 'ai'

// Initialize provider with custom API key
const anthropicProvider = createAnthropic({ apiKey })

// Execute LLM call with unified interface
const response = await generateText({
  model: anthropicProvider(modelToUse),
  messages,
  system,
  maxTokens: 4096,
  providerOptions: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 10000 },
      // Cache control embedded in message blocks
    }
  }
})
```

#### 1. Prompt Caching

**Purpose:** 90% cost reduction for repeated content

**Implementation:**
```json
{
  "system": [{
    "type": "text",
    "text": "You are a legal assistant...",
    "cache_control": { "type": "ephemeral" }
  }],
  "messages": [{
    "role": "user",
    "content": [
      {
        "type": "document",
        "source": { "type": "text", "data": "Contract text..." },
        "cache_control": { "type": "ephemeral" }
      },
      { "type": "text", "text": "What are payment terms?" }
    ]
  }]
}
```

**Cache Lifecycle:**
- First message: Cache write (system + document)
- Follow-up messages: Cache hit (90% savings)
- TTL: 5 minutes
- Requirements: Minimum 1024 tokens

### 2. Extended Thinking/Reasoning

**Toggle:** "Thinking mode"

**Implementation via Vercel AI SDK:**
```typescript
providerOptions: {
  anthropic: {
    thinking: {
      type: 'enabled',
      budgetTokens: 10000  // Budget for reasoning tokens
    }
  }
}
```

**Response Extraction:**
The Vercel AI SDK returns reasoning in `response.reasoning` as an array of `ReasoningPart` objects. The edge function passes this array to the frontend, which extracts and concatenates the text for display:

```typescript
// Frontend: workbench-output.tsx
if (Array.isArray(block.thinking)) {
  return block.thinking
    .filter((part: any) => part.type === 'reasoning' && part.text)
    .map((part: any) => part.text)
    .join('\n\n')
}
```

This follows proper separation of concerns - backend provides raw data, frontend handles presentation.

### 3. Citations

**Toggle:** "Citations"

**Implementation:**
```json
{
  "type": "document",
  "source": {...},
  "citations": { "enabled": true }
}
```

#### 4. Context Window Tracking (Claude Sonnet 4.5)

**Purpose:** Visibility into 200K context window usage

**How it works:**
- Claude Sonnet 4.5 has **internal context awareness** (receives system messages about token budget)
- Workbench mirrors this by calculating cumulative token usage client-side
- Displayed only in **stateful mode** for models with 200K context windows

**Implementation:**
```typescript
// Calculate cumulative tokens across conversation
const cumulativeTokens = conversationHistory.reduce(
  (sum, msg) => sum + (msg.metadata?.inputTokens || 0) + (msg.metadata?.outputTokens || 0),
  0
)

// Display in advanced mode
Context: 4,288/200,000 (2.1%) • 195,712 remaining
```

**Benefits:**
- Helps users understand when approaching the 200K limit
- Prevents context overflow in long conversations
- Shows what Claude internally tracks

### Google Gemini (Native SDK)

**SDK:** Google GenAI SDK v1.29.0 (`@google/genai`)

**Architecture:** Dual-path execution based on whether a file is uploaded

**Integration:**
```typescript
import { GoogleGenAI } from 'npm:@google/genai@1.29.0'
import {
  uploadDocumentToGemini,
  createGeminiCache,
  executeLLMOperationGemini
} from '../_shared/llm-executor-gemini.ts'

// Initialize Gemini client
const ai = new GoogleGenAI(apiKey)
```

#### Dual-Path Architecture

Gemini uses two different execution paths depending on whether a file is uploaded:

**Path A: File-Based Execution (With Caching)**

Used when `send_file = true` and `file_content` exists:

```typescript
// 1. Upload document to Gemini File API (48-hour validity)
const geminiFile = await uploadDocumentToGemini(
  ai,
  fileBuffer,
  fileName,
  mimeType
)

// 2. Create explicit cache (if document ≥ 50 KB and create_cache = true)
let geminiCacheName: string | null = null
const fileSizeKB = fileBuffer.length / 1024

if (fileSizeKB >= 50 && workbenchBody.settings.create_cache) {
  try {
    geminiCacheName = await createGeminiCache(
      ai,
      modelToUse,
      geminiFile.uri,
      geminiFile.mimeType,
      systemPromptForCache
    )
    console.log(`✅ Gemini cache created: ${geminiCacheName}`)
  } catch (error: any) {
    // Graceful fallback for documents below threshold
    if (error.message?.includes('INVALID_ARGUMENT')) {
      console.log('⚠️ Document too small for caching, proceeding without cache')
      geminiCacheName = null
    } else {
      throw error
    }
  }
}

// 3. Execute via shared executor
const geminiResult = await executeLLMOperationGemini(
  {
    model: modelToUse,
    prompt: workbenchBody.new_prompt,
    operation_type: workbenchBody.operation_type,
    document: {
      content: fileBuffer,
      filename: fileName,
      mimeType: mimeType
    },
    systemPrompt: systemPromptForCache,
    thinking: workbenchBody.settings.thinking,
    temperature: workbenchBody.settings.temperature,
    max_tokens: workbenchBody.settings.max_tokens
  },
  supabase,
  {
    fileUri: geminiFile.uri,
    fileName: geminiFile.name,
    cacheName: geminiCacheName || undefined,
    mimeType: geminiFile.mimeType
  }
)
```

**Path B: Text-Only Execution (Direct API)**

Used when `send_file = false` or no file content:

```typescript
// 1. Build Zod schema for operation type
const operationSchema = getOperationTypeSchema(workbenchBody.operation_type)

// 2. Convert to JSON Schema
const jsonSchema = zodToJsonSchema(operationSchema, {
  name: `${workbenchBody.operation_type}Schema`,
  $refStrategy: 'none'
})

// 3. Clean schema (remove Gemini-incompatible fields)
const cleanedSchema = { ...jsonSchema }
delete cleanedSchema.$schema
delete cleanedSchema.definitions
delete cleanedSchema.$ref

// 4. Build generation config
const generationConfig: any = {
  temperature: workbenchBody.settings.temperature ?? 1.0,
  maxOutputTokens: workbenchBody.settings.max_tokens || 4096,
  responseMimeType: 'application/json',
  responseSchema: cleanedSchema
}

// 5. Add thinking configuration if enabled
if (workbenchBody.settings.thinking?.budget_tokens) {
  generationConfig.thinkingConfig = {
    thinkingBudget: workbenchBody.settings.thinking.budget_tokens,
    includeThoughts: workbenchBody.settings.thinking.type === 'enabled'
  }
}

// 6. Execute direct API call
const geminiResponse = await ai.models.generateContent({
  model: modelToUse,
  contents: workbenchBody.new_prompt,
  config: generationConfig,
  systemInstruction: systemInstruction
})

// 7. Parse structured output
const rawText = geminiResponse.text
const structuredOutput = JSON.parse(rawText)

// 8. Extract thinking summary if enabled
let thinkingSummary: string | undefined
if (workbenchBody.settings.thinking && geminiResponse.candidates?.[0]?.content?.parts) {
  const thoughtParts = geminiResponse.candidates[0].content.parts
    .filter((part: any) => part.thought)
    .map((part: any) => part.text)
  if (thoughtParts.length > 0) {
    thinkingSummary = thoughtParts.join('\n')
  }
}
```

#### Explicit Caching

**Requirements:**
- Minimum document size: **50 KB** (enforced by Gemini API)
- Cache TTL: 5 minutes (same as Anthropic)
- Cost reduction: **75%** for cached reads

**Cache Creation:**
```typescript
// Cache includes system prompt + document
const cache = await ai.caches.create({
  model: modelToUse,
  contents: [{
    role: 'user',
    parts: [{
      fileData: {
        fileUri: fileUri,
        mimeType: mimeType
      }
    }]
  }],
  systemInstruction: { parts: [{ text: systemPrompt }] },
  ttlSeconds: 300  // 5 minutes
})
```

**Graceful Fallback:**
- If document < 50 KB and cache creation fails with `INVALID_ARGUMENT`
- Logs warning and proceeds without cache
- Execution continues normally (no user-facing error)

#### Thinking Mode

**Configuration:**
```typescript
thinkingConfig: {
  thinkingBudget: 10000,  // Budget tokens for reasoning
  includeThoughts: true    // Include thoughts in response
}
```

**Thought Extraction:**
```typescript
// Extract thinking summary from response parts
const thoughtParts = geminiResponse.candidates[0].content.parts
  .filter((part: any) => part.thought)
  .map((part: any) => part.text)

const thinkingSummary = thoughtParts.join('\n')
```

#### Structured Output

**All Operation Types Supported:**

```typescript
// Helper function returns Zod schemas for all 7 operation types
const getOperationTypeSchema = (operationType: string): z.ZodSchema => {
  switch (operationType) {
    case 'generic':
      return z.object({
        response: z.string().describe('The AI response text')
      })

    case 'validation':
      return z.object({
        result: z.boolean().describe('The validation result (true/false)'),
        comment: z.string().describe('Reasoning and explanation for the decision')
      })

    case 'extraction':
      return z.object({
        extracted_data: z.record(z.string(), z.any())
          .describe('Key-value pairs of extracted information'),
        confidence: z.number().min(0).max(1)
          .describe('Confidence score for the extraction')
      })

    // ... rating, classification, analysis, traffic_light
  }
}

// Convert Zod to JSON Schema
const jsonSchema = zodToJsonSchema(operationSchema, {
  name: `${operationType}Schema`,
  $refStrategy: 'none'  // Inline all references
})
```

#### Token Metrics

**Extraction from Response:**
```typescript
const usage = geminiResponse.usageMetadata

// Map to workbench format
response = {
  text: rawText,
  experimental_output: structuredOutput,
  usage: {
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0
  },
  providerMetadata: {
    google: {
      usage: {
        cachedContentTokenCount: usage.cachedContentTokenCount || 0,
        thoughtsTokenCount: usage.thoughtsTokenCount || 0,
        totalTokenCount: usage.totalTokenCount || 0
      }
    }
  },
  ...(thinkingSummary && { reasoning: thinkingSummary })
}
```

**Cache Metrics:**
- `cachedContentTokenCount`: Tokens read from cache (75% cost reduction)
- Cache write happens during cache creation (not tracked per-operation)
- `thoughtsTokenCount`: Tokens used for reasoning (when thinking mode enabled)

### Mistral AI (Direct API)

**Integration:** HTTP POST requests to Mistral API

**Features:**
- JSON mode for structured output via `response_format`
- Direct document upload in request payload
- OCR support for PDFs and images
- No caching support
- No thinking mode

**Basic Implementation:**
```typescript
const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: modelToUse,
    messages: messages,
    response_format: { type: 'json_object' },
    temperature: settings.temperature,
    max_tokens: settings.max_tokens
  })
})
```

## Mode Comparison

| Feature | Stateful Mode | Stateless Mode |
|---------|--------------|----------------|
| **Purpose** | Multi-turn conversations | Independent queries |
| **Conversation History** | Maintained and sent | None (cleared between messages) |
| **Caching** | User-controlled via toggle | User-controlled via toggle |
| **System Prompt** | User decides per message | User decides per message |
| **Document** | User decides per message | User decides per message |
| **Output** | Accumulated | Cleared between messages |
| **Use Case** | Testing follow-up questions | Testing different prompts |

**Note:** Cache behavior is now independent of mode. Users control when to create caches via the "Create cache" toggle.

## What's Implemented

### ✅ Phase A: LLM Integration via Vercel AI SDK
- Vercel AI SDK integration with Anthropic provider (@ai-sdk/anthropic)
- Unified provider interface for future multi-LLM support
- Global LLM settings with Claude models
- Multi-turn conversations with full context
- Prompt caching (5-min TTL, 90% cost reduction)
- Extended thinking mode with reasoning display
- Document citations with citation block display
- Context window tracking (Claude Sonnet 4.5, 200K tokens)
- Model selector UI

### ✅ Phase B: Real-time Streaming
- `workbench_executions` table with RLS
- Edge Function database tracking
- Supabase Realtime subscriptions
- Live status updates
- Execution audit trail

### ✅ Phase C: Mode-Based Architecture
- Stateful mode (document testing with caching)
- Stateless mode (independent queries)
- Mode validation in Edge Function
- Mode-based system prompt handling
- Mode-based message building
- Per-message metadata display
- System prompt toggle
- Auto-managed caching per mode

### ✅ Phase D: Operation Types & Structured Outputs
- Operation type configuration system (`lib/operation-types/`)
- Generic operation type (free-form text via `generateText`)
- True/False validation type (structured output via `generateObject`)
- Zod schema validation for structured outputs
- Operation type selector UI (Sheet modal pattern)
- Automatic structured output visualization
- Traffic-light display for boolean results
- Extensible architecture for 4 additional operation types
- Database enum support for all 6 operation types

### ✅ Phase E: Performance Optimization
- Optional audit logging via `ENABLE_WORKBENCH_AUDIT_LOG` flag (default: disabled)
- Combined database calls (single `get_llm_config_for_run()`)
- 80-90% latency reduction (~500-1000ms → ~50-100ms overhead)
- Conditional `workbench_executions` writes
- Near-instant response delivery

### ✅ Phase F: Thinking + Structured Output
- Hybrid execution approach for thinking mode with structured outputs
- Workaround for Vercel AI SDK issue #7220 (thinking conflicts with forced tool_choice)
- Uses `generateText()` with manual tools when both features enabled
- AI SDK v5 compatibility (`inputSchema` + `jsonSchema` helper)
- Frontend handling of `response.reasoning` array format
- No breaking changes to existing functionality

### ✅ Phase 2.2.0: Multi-Provider Support with Gemini (Current)
- **Google Gemini Integration**: Native SDK v1.29.0 with full feature support
- **Dual-Path Architecture**: File-based (with caching) vs text-only (direct API) execution
- **Explicit Caching**: 50 KB threshold with graceful fallback for smaller documents
- **Thinking Mode**: Budget tokens, thought extraction, reasoning summary
- **Structured Output**: All 7 operation types via JSON Schema conversion
- **Text-Only Queries**: All providers support queries without file upload
- **Provider Branching**: Automatic routing based on model configuration
- **API Key Management**: Provider-specific key resolution (organization or environment)
- **Token Metrics**: Provider-specific metadata extraction and normalization
- **Gemini File API**: 48-hour file validity with automatic cleanup
- **Zod to JSON Schema**: Automatic schema conversion for Gemini structured output
- **Cache Size Threshold**: Intelligent 50 KB check with INVALID_ARGUMENT handling
- **Mistral Support**: Direct HTTP API integration with JSON mode

## Bug Fixes

### Phase 1.7: Caching Message Order Bug

**Original Issue:**
When caching was enabled with a file, the Edge Function built messages in wrong order:
```
[NEW message with doc], [HISTORY], // Wrong - timeline backwards
```

**Root Cause:**
- Added new message with document first
- Then added conversation history
- Skipped adding new prompt because file_content existed
- Result: Invalid message structure, non-2xx errors from Anthropic

**Solution:**
Mode-based message building with proper timeline:
```typescript
// Stateful follow-up (correct)
[HISTORY],  // Previous conversation
[NEW prompt]  // New question

// System + Document cached from first message (cache hit)
```

### Phase 1.8: Content Structure Preservation for Cache Hits

**Original Issue:**
Cache MISS on follow-up messages despite identical content. New cache created instead of cache hit:
```
Message 1: cachedWriteTokens: 3660 ✅
Message 2: cachedWriteTokens: 3702 ❌ (should be cachedReadTokens!)
```

**Root Cause:**
Conversation history stored only text, losing document structure:
```typescript
// Message 1 sent to Anthropic
{
  role: 'user',
  content: [
    {type: 'document', source: {...}, cache_control: {...}},
    {type: 'text', text: 'Question?'}
  ]
}

// Message 1 stored in frontend (WRONG!)
{
  role: 'user',
  content: 'Question?'  // Lost document structure!
}

// Message 2 replayed with history (WRONG STRUCTURE!)
{
  role: 'user',
  content: 'Question?'  // Text only, no document
}
```

**Solution:**
Store EXACT content structure sent to Anthropic:

1. **Edge Function returns actual content** ([index.ts:303](supabase/functions/execute-workbench-test/index.ts#L303)):
```typescript
return {
  ...result,
  user_content_sent: messages[messages.length - 1].content,  // Actual structure
  system_sent: system
}
```

2. **Frontend stores full structure** ([workbench-input.tsx:210](validai-app/components/workbench/workbench-input.tsx#L210)):
```typescript
addToConversation({
  role: 'user',
  content: result.user_content_sent,  // Full structure, not just text
  ...
})
```

3. **Schema allows both formats** ([workbench-schemas.ts:57](validai-app/lib/validations/workbench-schemas.ts#L57)):
```typescript
content: z.union([
  z.string(),        // Simple text
  z.array(z.any())   // Content blocks array
])
```

4. **UI extracts text for display** ([workbench-output.tsx:77](validai-app/components/workbench/workbench-output.tsx#L77)):
```typescript
const extractText = (content: string | unknown[]): string => {
  if (typeof content === 'string') return content
  // Extract text from content blocks
  return content.filter(block => block.type === 'text')
    .map(block => block.text).join(' ')
}
```

**Result:**
✅ Perfect cache hits on follow-up messages
✅ Exact API replay capability
✅ Session-scoped storage (~93KB per message with document)
✅ Exported conversations preserve full structure

**Memory Impact:**
- Before: ~1KB per message (text only)
- After: ~93KB per message (with 92KB PDF base64)
- Typical session: 5 messages = ~465KB
- Acceptable: Ephemeral test environment, cleared on refresh

### Phase 2.1.1: Performance Optimization

**Original Issue:**
Workbench felt slow due to unnecessary database operations. Each execution performed 4 database roundtrips (~500-1000ms overhead) even though the audit trail data was never read by the frontend.

**Database Operations (Before):**
```
1. get_llm_config_for_run() → organization_id
2. get_llm_config_for_run() → full config (redundant!)
3. INSERT workbench_executions → pending status
4. UPDATE workbench_executions → processing status
5. UPDATE workbench_executions → completed/failed status
```

**Root Cause:**
- Duplicate database calls for configuration
- Full audit logging with no consuming UI (no history viewer, analytics, or replay features)
- Synchronous writes blocking response delivery

**Solution:**
1. **Combined config calls** - Single `get_llm_config_for_run()` returns both organization_id and full config
2. **Optional audit logging** - Added `ENABLE_WORKBENCH_AUDIT_LOG` environment flag (default: false)
3. **Conditional database writes** - All `workbench_executions` operations wrapped in flag check

**Implementation:**
```typescript
// Edge Function flag (default: disabled)
const ENABLE_WORKBENCH_AUDIT_LOG = Deno.env.get('ENABLE_WORKBENCH_AUDIT_LOG') === 'true'

// Single config call
const { data: llmConfig } = await supabase.rpc('get_llm_config_for_run', {
  p_processor_id: body.processor_id,
  p_user_id: user.id
})
// Returns: organization_id, model, api_key_encrypted, settings

// Conditional audit logging
if (ENABLE_WORKBENCH_AUDIT_LOG) {
  await supabase.from('workbench_executions').insert({...})
}
```

**Result:**
- ✅ 80-90% latency reduction (from ~500-1000ms to ~50-100ms overhead)
- ✅ Single database call instead of 4
- ✅ Near-instant responses once LLM completes
- ✅ Audit trail available when needed (set flag to enable)

### Phase 2.1.3: Separate File Message for Cache Hits

**Original Issue:**
Cache MISS on follow-up messages in stateful mode despite having cache control markers. New cache created instead of cache hit:
```
Message 1: cachedWriteTokens: 5690 ✅ Cache created
Message 2: cachedWriteTokens: 5810 ❌ New cache created (should be cachedReadTokens!)
```

**Root Cause:**
File was embedded in current user message with prompt, so when conversation history (assistant response) was added, it changed the message prefix that Anthropic tries to match:

```typescript
// Message 1 structure
[system, user(file+prompt)]  // Creates cache

// Message 2 structure (WRONG - prefix changed!)
[system, assistant, user(file+prompt)]
// Assistant message comes BEFORE file, changing the prefix up to cache marker
// Anthropic doesn't match → creates NEW cache instead of hitting existing one
```

**Analysis:**
- Cache prefix must be 100% identical up to and including the cache_control marker
- When file is embedded with prompt, conversation history inserts BEFORE the file
- This changes the prefix, breaking cache matching
- Anthropic requires: `[prefix_content, cached_content]` in same order every time

**Solution:**
Send file as SEPARATE user message positioned BEFORE conversation history:

```typescript
// Turn 1: File sent separately
[system, user(file_with_cache), user(prompt)]
// Prefix for caching: system + user(file) ✅

// Turn 2: History grows AFTER file (prefix preserved)
[system, user(file_with_cache), assistant, user(prompt)]
// Prefix for caching: system + user(file) ✅ IDENTICAL!
// Cache hit because everything up to cache marker matches

// Turn 3: Conversation continues
[system, user(file_with_cache), assistant, user, assistant, user(prompt)]
// Prefix for caching: system + user(file) ✅ STILL IDENTICAL!
```

**Implementation Changes:**

1. **Message construction order** ([index.ts:429-540](supabase/functions/execute-workbench-test/index.ts#L429-540)):
   - System message (no cache control)
   - File message as separate user message (WITH cache control)
   - Conversation history (text exchanges only, files excluded)
   - Current prompt as separate user message

2. **Conversation history processing** ([index.ts:384-427](supabase/functions/execute-workbench-test/index.ts#L384-427)):
   - Skip file messages entirely from history (`if (msg.metadata?.fileSent) return`)
   - Extract only text content from history messages
   - File is always sent fresh at beginning, not replayed from history

3. **User control**: Users must keep "Send file" toggle ON for cache hits
   - Gives users explicit control over caching behavior
   - Aligns with workbench philosophy: user controls what gets sent

**Comprehensive Logging:**
Added detailed logging for debugging cache hits/misses ([index.ts:542-641](supabase/functions/execute-workbench-test/index.ts#L542-641)):
- Message structure breakdown (role, content type, size)
- Cache marker positions
- **Prefix signature**: String representation for comparing across turns
- Expected cache behavior based on structure

**Result:**
✅ Cache hits on Turn 2+ in stateful mode (90% cost savings)
✅ Prefix signature stays identical: `system:text → user:file:CACHE_MARKER`
✅ Conversation history grows AFTER cached content
✅ User controls caching via "Send file" toggle
✅ Comprehensive logging for debugging prefix mismatches

## Future Enhancements

### 1. Advanced Settings UI
- Sliders for temperature, top_p, top_k
- Thinking budget input
- Stop sequences editor

### 2. Tool Use Support
- Define tools in processor configuration
- Display tool use in output
- Support web search, code execution

### 3. Streaming Responses
- Use Anthropic streaming API
- Typewriter effect display
- Real-time partial updates

### 4. Document Selection from Storage
- Browse existing documents
- Avoid re-uploading
- Auto-enable caching

### 5. Cost Tracking UI
- Calculate cost per execution
- Session cumulative cost
- Organization budget tracking

## Security & Privacy

### API Key Security
- Global API key in Edge Function env var (pre-production)
- Organization keys encrypted at rest
- Service-role decryption only
- Never sent to client

### Row Level Security
```sql
CREATE POLICY "Users can view their own workbench executions"
  ON workbench_executions FOR SELECT
  USING (user_id = auth.uid());
```

### Data Isolation
- Executions scoped to organization_id and user_id
- RLS policies prevent cross-org access
- Edge Function validates organization membership

## Performance Considerations

### Database Operations Optimization

**Default Configuration (Audit Logging Disabled):**
- Single database call: `get_llm_config_for_run()` for configuration
- No execution tracking overhead
- **Latency:** ~50-100ms for config resolution
- **Total overhead:** Minimal, LLM call dominates execution time

**With Audit Logging Enabled:**
- Four database operations per execution:
  1. `get_llm_config_for_run()` - Configuration (required)
  2. INSERT `workbench_executions` - Create pending record
  3. UPDATE `workbench_executions` - Mark processing
  4. UPDATE `workbench_executions` - Mark completed/failed
- **Additional latency:** ~500-1000ms from roundtrips
- **Trade-off:** Full audit trail vs. performance

**Recommendation:** Keep audit logging disabled for development/testing. Enable only for production debugging or compliance requirements.

### Prompt Caching Benefits (Stateful Mode)
- Cache writes: +25% cost (one-time)
- Cache reads: -90% cost (recurring)
- Break-even: After 2nd use
- 10-turn conversation: ~85% total savings

### Database Indexes (Optional - for audit logging)
```sql
CREATE INDEX idx_workbench_executions_user_id ON workbench_executions(user_id);
CREATE INDEX idx_workbench_executions_processor_id ON workbench_executions(processor_id);
CREATE INDEX idx_workbench_executions_status ON workbench_executions(status);
```

## Troubleshooting

### Common Issues

#### 1. "Stateful mode requires caching to be enabled"
**Cause:** Mode validation failed
**Solution:** Ensure caching toggle is enabled when in stateful mode

#### 2. "Stateless mode cannot have conversation history"
**Cause:** Conversation history passed in stateless mode
**Solution:** Clear conversation when switching to stateless

#### 3. Cache not working
**Cause:** Content changed or cache expired
**Solution:**
- Verify in stateful mode
- Check system prompt unchanged
- Ensure document content identical
- Cache expires after 5 minutes

---

**Last Updated:** 2025-11-09
**Phase:** 2.2.0 Complete (Multi-Provider Support with Gemini)
**Architecture:** Multi-provider integration (Anthropic via Vercel AI SDK, Gemini via native SDK, Mistral via direct API) with provider-specific optimizations
**Current Providers:** Anthropic Claude (90% cache savings), Google Gemini (75% cache savings, dual-path), Mistral AI (JSON mode)
**Next Phase:** 2.3 - Additional Operation Types (Extraction, Rating, Classification, Analysis, Traffic Light)
**Edge Function Version:** 2.2.0 (Multi-provider with dual-path Gemini, text-only query support, provider-specific caching)

## Benefits of Vercel AI SDK Architecture

### Unified Provider Interface
- Single API for all LLM providers (Anthropic, OpenAI, Mistral, etc.)
- Consistent response formats across providers
- Simplified error handling and retry logic
- Future-proof for adding new providers

### Improved Developer Experience
- Better TypeScript support with strong typing
- Standardized parameter names (camelCase)
- Built-in streaming support (ready for future implementation)
- Active maintenance and regular updates from Vercel

### Cost Optimization
- Maintains all Anthropic-specific optimizations (caching, thinking mode)
- Provider-agnostic token tracking
- Ready for provider comparison and selection based on cost/performance

## Architecture Notes

### Service-Role + Explicit Parameter Pattern

Edge Function uses **service-role key** (bypasses RLS) with explicit user context:
- Extracts user_id from incoming JWT
- Passes user_id explicitly to database functions
- Functions query `organization_members` for context
- No reliance on `auth.jwt()` in service-role context

This follows Supabase best practices for Edge Functions handling service-role operations with proper security context.
