# LLM Workbench Architecture

The LLM Workbench is a testing environment for operations that integrates with Anthropic's Claude API, featuring message composition controls, prompt caching, real-time execution tracking, and comprehensive LLM configuration management.

**Implementation:** Phase 1.8 (Completed - Message Composition Architecture)
**Documentation Date:** 2025-10-04
**Based on:** Official Anthropic API documentation (https://docs.claude.com/en/api/messages)

## Overview

The Workbench provides a sandboxed environment where users can:
- Compose messages with explicit control over what gets sent (system prompt, file, cache markers)
- Test operations with real LLM responses in two distinct modes (stateful/stateless)
- Leverage prompt caching for cost optimization (90% savings)
- Enable extended thinking for complex reasoning tasks
- Use citations for document grounding
- Track execution progress in real-time
- View comprehensive per-message metadata

**Key Characteristics:**
- **Message Composition**: Settings act as toggles to construct each message
- **User-Controlled Caching**: Explicit "Create cache" toggle instead of mode-based automation
- **Ephemeral**: State is not persisted across sessions (except execution audit trail)
- **Real-time**: Live execution status updates via Supabase Realtime
- **Cost-optimized**: Prompt caching reduces token costs by up to 90%
- **Auditable**: All executions logged with comprehensive metadata

## Message Composition System

The Workbench uses **explicit toggles** to compose each API message. Users have full control over:
- What content to send (system prompt, file)
- Whether to create a cache
- Which mode (stateful/stateless) controls conversation history

### Settings as Message Builders

| Setting | Effect |
|---------|--------|
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

**Response with Metadata:**
```typescript
return {
  execution_id: executionId,
  response: responseText,
  metadata: {
    mode: body.mode,
    cacheEnabled: body.settings.caching_enabled,
    systemPromptSent: body.send_system_prompt && !!body.system_prompt,
    thinkingEnabled: !!body.settings.thinking,
    citationsEnabled: body.settings.citations_enabled,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cachedReadTokens: response.usage.cache_read_input_tokens,
    cachedWriteTokens: response.usage.cache_creation_input_tokens,
    executionTimeMs: executionTime
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

  // File & Model Selection
  selectedFile: SelectedFile
  selectedModel: string

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

  // Real-time Tracking
  currentExecutionId: string | null
  executionStatus: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

  // Actions
  setMode: (mode: 'stateful' | 'stateless') => void
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
│ Operation type         Generic       │
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

## Anthropic API Integration

### 1. Prompt Caching (Stateful Mode Only)

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

### 2. Extended Thinking

**Toggle:** "Thinking mode"

**Implementation:**
```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  }
}
```

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

### ✅ Phase A: Anthropic LLM Integration
- Anthropic SDK integration (@anthropic-ai/sdk v0.65.0)
- Global LLM settings with Claude models
- Multi-turn conversations with full context
- Prompt caching (5-min TTL, 90% cost reduction)
- Extended thinking mode
- Document citations
- Model selector UI

### ✅ Phase B: Real-time Streaming
- `workbench_executions` table with RLS
- Edge Function database tracking
- Supabase Realtime subscriptions
- Live status updates
- Execution audit trail

### ✅ Phase C: Mode-Based Architecture (Current)
- Stateful mode (document testing with caching)
- Stateless mode (independent queries)
- Mode validation in Edge Function
- Mode-based system prompt handling
- Mode-based message building
- Per-message metadata display
- System prompt toggle
- Auto-managed caching per mode

## Bug Fixes (Phase 1.7)

### Fixed: Caching Message Order Bug

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

**Last Updated:** 2025-10-04
**Phase:** 1.8 Complete (Message Composition Architecture)
**Next Phase:** 2.0 - Run Execution System
**Edge Function Version:** 7

## Architecture Notes

### Service-Role + Explicit Parameter Pattern

Edge Function uses **service-role key** (bypasses RLS) with explicit user context:
- Extracts user_id from incoming JWT
- Passes user_id explicitly to database functions
- Functions query `organization_members` for context
- No reliance on `auth.jwt()` in service-role context

This follows Supabase best practices for Edge Functions handling service-role operations with proper security context.
