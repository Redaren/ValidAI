# LLM Workbench Architecture

The LLM Workbench is a testing environment for operations that integrates with LLM providers through the Vercel AI SDK, featuring message composition controls, structured output generation, prompt caching, real-time execution tracking, and comprehensive LLM configuration management. Currently configured for Anthropic's Claude models with the foundation for multi-provider support.

**Implementation:** Phase 2.1 (Structured Outputs with Operation Types)
**Documentation Date:** 2025-10-09
**Based on:** Vercel AI SDK (https://ai-sdk.dev) with Anthropic provider

## Overview

The Workbench provides a sandboxed environment where users can:
- Select operation types to control output structure (Generic text or Structured validation)
- Compose messages with explicit control over what gets sent (system prompt, file, cache markers)
- Test operations with real LLM responses in two distinct modes (stateful/stateless)
- Generate structured outputs with automatic schema validation (True/False, future: Extraction, Rating, etc.)
- Leverage prompt caching for cost optimization (90% savings)
- Enable extended thinking for complex reasoning tasks
- Use citations for document grounding
- Track execution progress in real-time
- View comprehensive per-message metadata with structured output visualization
- Monitor context window usage (Claude Sonnet 4.5 context awareness)

**Key Characteristics:**
- **Message Composition**: Settings act as toggles to construct each message
- **User-Controlled Caching**: Explicit "Create cache" toggle instead of mode-based automation
- **Context Awareness**: Tracks 200K token usage for Claude Sonnet 4.5 (stateful mode)
- **Ephemeral**: State is not persisted across sessions (except execution audit trail)
- **Real-time**: Live execution status updates via Supabase Realtime
- **Cost-optimized**: Prompt caching reduces token costs by up to 90%
- **Auditable**: All executions logged with comprehensive metadata

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

API Request:
{
  "system": [{ "text": "...", "cache_control": {"type": "ephemeral"} }],
  "messages": [{
    "role": "user",
    "content": [
      { "type": "document", "source": {...}, "cache_control": {"type": "ephemeral"} },
      { "type": "text", "text": "Analyze payment terms" }
    ]
  }]
}

Result: Cache created
After send: "Create cache" auto-resets to OFF
```

#### Scenario 2: Use Existing Cache (Stateful)
```
Settings:
- Mode: Stateful
- Send system prompt: ON
- Send file: ON
- Create cache: OFF

API Request:
{
  "system": [{ "text": "...", "cache_control": {"type": "ephemeral"} }],
  "messages": [
    { "role": "user", "content": [...] },  // Previous messages
    { "role": "assistant", "content": "..." },
    {
      "role": "user",
      "content": [
        { "type": "document", "source": {...}, "cache_control": {"type": "ephemeral"} },
        { "type": "text", "text": "Check liability clauses" }
      ]
    }
  ]
}

Result: Cache hit (90% cost savings)
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

if (useStructuredOutput && outputSchema) {
  // Structured output with schema validation
  response = await generateObject({
    model: anthropicProvider(modelToUse),
    schema: outputSchema,  // Zod schema
    messages,
    maxTokens,
    temperature,
    // ...other settings
  })

  structuredOutput = response.object  // Validated object
  responseText = JSON.stringify(response.object, null, 2)
} else {
  // Generic free-form text
  response = await generateText({
    model: anthropicProvider(modelToUse),
    messages,
    maxTokens,
    temperature,
    // ...other settings
  })

  responseText = response.text
}

return {
  execution_id,
  response: responseText,
  structured_output: structuredOutput,  // Only present for structured types
  // ...metadata
}
```

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
Audit trail and real-time tracking for test executions.

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

**LLM Integration:** Uses Vercel AI SDK with `@ai-sdk/anthropic` provider for unified LLM interface

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

**Message Building (Composition-based):**
```typescript
// In stateful mode: Add conversation history first
if (body.mode === 'stateful' && body.conversation_history.length > 0) {
  body.conversation_history.forEach(msg => {
    messages.push({
      role: msg.role,
      content: msg.content
    })
  })
}

// Build current message content
const contentBlocks: any[] = []

// Add document if user toggled "Send file" ON
if (body.send_file && body.file_content) {
  const documentBlock: any = {
    type: 'document',
    source: {
      type: body.file_type === 'application/pdf' ? 'base64' : 'text',
      media_type: body.file_type || 'text/plain',
      data: body.file_content
    }
  }

  // Add cache_control if user toggled "Create cache" ON
  if (body.settings.create_cache) {
    documentBlock.cache_control = { type: 'ephemeral' }
  }

  // Add citations if enabled
  if (body.settings.citations_enabled) {
    documentBlock.citations = { enabled: true }
  }

  contentBlocks.push(documentBlock)
}

// Add prompt text
contentBlocks.push({ type: 'text', text: body.new_prompt })

// Add current message
if (contentBlocks.length === 1) {
  // Only text prompt, send as string
  messages.push({ role: 'user', content: body.new_prompt })
} else {
  // Has document or other content blocks
  messages.push({ role: 'user', content: contentBlocks })
}
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

## LLM Provider Integration (Vercel AI SDK)

The workbench uses the Vercel AI SDK to integrate with LLM providers, currently configured for Anthropic's Claude models. This provides a unified interface that simplifies adding support for additional providers (OpenAI, Mistral, Google, etc.) in the future.

### Provider Configuration

**Current Implementation:**
```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

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

### 1. Prompt Caching

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
The Vercel AI SDK returns reasoning in `response.reasoning`, which is formatted for frontend display.

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

### 4. Context Window Tracking (Claude Sonnet 4.5)

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

### ✅ Phase D: Operation Types & Structured Outputs (Current)
- Operation type configuration system (`lib/operation-types/`)
- Generic operation type (free-form text via `generateText`)
- True/False validation type (structured output via `generateObject`)
- Zod schema validation for structured outputs
- Operation type selector UI (Sheet modal pattern)
- Automatic structured output visualization
- Traffic-light display for boolean results
- Extensible architecture for 4 additional operation types
- Database enum support for all 6 operation types

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

### Prompt Caching Benefits (Stateful Mode)
- Cache writes: +25% cost (one-time)
- Cache reads: -90% cost (recurring)
- Break-even: After 2nd use
- 10-turn conversation: ~85% total savings

### Database Indexes
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

**Last Updated:** 2025-10-09
**Phase:** 2.1 Complete (Structured Outputs with Operation Types)
**Architecture:** Unified LLM provider interface via Vercel AI SDK with dual execution modes
**Next Phase:** 2.2 - Additional Operation Types (Extraction, Rating, Classification, Analysis)
**Edge Function Version:** 25 (Vercel AI SDK with `generateObject` support for structured outputs)

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
