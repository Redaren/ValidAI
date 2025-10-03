# LLM Workbench Architecture

The LLM Workbench is a testing environment for operations that integrates with Anthropic's Claude API, featuring multi-turn conversations, prompt caching, real-time execution tracking, and comprehensive LLM configuration management.

**Implementation:** Phase 1.6 (Completed)
**Documentation Date:** 2025-10-03
**Based on:** Official Anthropic API documentation (https://docs.claude.com/en/api/messages)

## Overview

The Workbench provides a sandboxed environment where users can:
- Test operations with real LLM responses
- Experiment with different models and settings
- Leverage prompt caching for cost optimization (90% savings)
- Enable extended thinking for complex reasoning tasks
- Use citations for document grounding
- Track execution progress in real-time
- Maintain multi-turn conversations within a session

**Key Characteristics:**
- **Ephemeral**: State is not persisted across sessions (except execution audit trail)
- **Real-time**: Live execution status updates via Supabase Realtime
- **Cost-optimized**: Prompt caching reduces token costs by up to 90%
- **Auditable**: All executions logged in database for compliance

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
│   Zustand Store         │    - Conversation history
│   (Client-side only)    │    - Caching enabled/disabled
│                         │    - Advanced settings overrides
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
  configuration jsonb DEFAULT '{}',  -- Default settings only
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Example Configuration:**
```json
{
  "default_temperature": 1.0,
  "default_max_tokens": 4096,
  "default_top_p": 1.0
}
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
    "anthropic": "encrypted_base64_string",
    "mistral": "encrypted_base64_string"
  },
  "available_models": [
    {
      "id": "sonnet",
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "display_name": "Claude 3.5 Sonnet"
    },
    {
      "id": "haiku",
      "provider": "anthropic",
      "model": "claude-3-5-haiku-20241022",
      "display_name": "Claude 3.5 Haiku"
    }
  ],
  "default_model_id": "sonnet"
}
```

**Note:** API keys are encrypted using `encrypt_api_key()` function with organization-specific encryption.

##### `processors.configuration`
Processor-level model selection.

```sql
-- processors table already exists
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

  -- Execution status
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

  -- Request data
  prompt text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  model_used text,

  -- Response data (updated during execution)
  response text,
  partial_response text,  -- For future streaming support
  thinking_blocks jsonb,
  citations jsonb,

  -- Metrics
  tokens_used jsonb,
  execution_time_ms integer,

  -- Error handling
  error_message text,

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- RLS Policies
CREATE POLICY "Users can view their own workbench executions"
  ON workbench_executions FOR SELECT
  USING (user_id = auth.uid());

-- Added to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE workbench_executions;
```

**Purpose:**
- Audit trail for all LLM calls
- Real-time progress tracking
- Cost monitoring (tokens used)
- Debugging and compliance

### 3. Edge Function Architecture

#### `execute-workbench-test`

**Location:** `supabase/functions/execute-workbench-test/index.ts`

**Flow:**
```
1. Receive request from client with user JWT
2. Extract user_id from JWT using service-role auth
3. Resolve LLM configuration (pass user_id explicitly)
4. Create execution record (status: pending)
5. Decrypt API key (service-role only) or use global ANTHROPIC_API_KEY
6. Build Anthropic API request with caching/thinking/citations
7. Update execution (status: processing)
8. Call Anthropic Messages API
9. Extract response, thinking blocks, citations
10. Update execution (status: completed)
11. Return result with execution_id
```

**Key Architectural Pattern:**
- Edge Function uses **service-role key** (bypasses RLS)
- User context passed **explicitly as parameter** to database functions
- Database functions query `organization_members` to get organization context
- No reliance on `auth.jwt()` or `auth.uid()` in service-role context

**Real-time Updates:**
```typescript
// Database writes trigger Supabase Realtime events
await supabase.from('workbench_executions')
  .update({ status: 'processing', model_used: modelToUse })
  .eq('id', executionId)
// ↓ Client subscribed to execution_id receives update immediately
```

**Error Handling:**
```typescript
catch (error) {
  // Update execution with error
  await supabase.from('workbench_executions')
    .update({
      status: 'failed',
      error_message: error.message
    })
    .eq('id', executionId)
}
```

**Security:**
- Validates user JWT and extracts user_id
- Passes user_id explicitly to database functions (not via auth.jwt())
- Database functions validate organization membership
- Creates execution records with proper organization_id
- Uses service-role key for API key decryption
- RLS policies prevent unauthorized access to execution records

### 4. Frontend State Management

#### Workbench Store (Zustand)

**Location:** `stores/workbench-store.ts`

```typescript
interface WorkbenchStore {
  // File & Model Selection
  selectedFile: SelectedFile
  selectedModel: string

  // Prompts
  systemPrompt: string        // From processor (read-only)
  operationPrompt: string     // User-editable test prompt

  // Feature Toggles
  thinkingMode: boolean       // Extended thinking
  citations: boolean          // Document citations
  toolUse: boolean           // Tool use (future)
  cacheEnabled: boolean      // Prompt caching

  // Advanced Settings
  advancedSettings: {
    temperature: number
    maxTokens: number
    topP: number
    topK: number
    thinkingBudget: number | null  // null = disabled
    stopSequences: string[]
  }

  // Conversation State
  conversationHistory: ConversationMessage[]
  cachedDocumentContent: string | null  // For cache consistency

  // Real-time Tracking
  currentExecutionId: string | null
  executionStatus: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'
  realtimeChannel: RealtimeChannel | null

  // Actions
  subscribeToExecution: (executionId: string) => void
  unsubscribeFromExecution: () => void
  handleExecutionUpdate: (execution: WorkbenchExecution) => void
}
```

**Lifecycle:**
1. User enters workbench → Store initialized with processor's system prompt
2. User sends test → `subscribeToExecution()` called with execution_id
3. Real-time updates received → `handleExecutionUpdate()` updates status
4. Execution completes → Auto-unsubscribe after 1 second
5. User leaves page → `reset()` cleans up subscriptions

#### Real-time Subscription

```typescript
subscribeToExecution: (executionId: string) => {
  const supabase = createClient()

  const channel = supabase
    .channel(`workbench-execution-${executionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'workbench_executions',
        filter: `id=eq.${executionId}`
      },
      (payload) => {
        const execution = payload.new as WorkbenchExecution
        handleExecutionUpdate(execution)
      }
    )
    .subscribe()

  set({ currentExecutionId: executionId, realtimeChannel: channel })
}
```

**Benefits:**
- Live status updates (pending → processing → completed)
- Multi-device support (same execution visible across tabs)
- Automatic cleanup on completion
- No polling required

## Anthropic API Integration

### Supported Features

Based on official documentation (https://docs.claude.com/en/api/messages):

#### 1. Prompt Caching

**Purpose:** Reduce costs and latency for repeated content (90% cost savings)

**How It Works:**
- Mark content with `cache_control: { type: 'ephemeral' }`
- Cache lifetime: 5 minutes (default) or 1 hour (optional)
- Automatic cache hits when content is identical
- Cache statistics returned in response

**Example:**
```json
{
  "system": [
    {
      "type": "text",
      "text": "You are a helpful assistant...",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "document",
          "source": { "type": "text", "data": "Large document..." },
          "cache_control": { "type": "ephemeral" }
        },
        {
          "type": "text",
          "text": "What are the key points?"
        }
      ]
    }
  ]
}
```

**Workbench Implementation:**
- Toggle: "Caching" switch in settings
- Caches system prompt + document
- Subsequent messages to same document hit cache
- Cache stats displayed: "🎯 X tokens cached"

**Requirements:**
- Minimum 1024 tokens (2048 for Haiku)
- Content must be identical for cache hit
- Up to 4 cache breakpoints per request

#### 2. Extended Thinking

**Purpose:** Enable deeper reasoning for complex tasks

**How It Works:**
- Add `thinking` parameter with budget_tokens
- Model generates internal reasoning in thinking blocks
- Thinking blocks not counted toward output limit
- Final response follows thinking process

**Example:**
```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  }
}
```

**Workbench Implementation:**
- Toggle: "Thinking mode" switch
- Default budget: 10,000 tokens
- Thinking blocks displayed separately in output
- Configurable in advanced settings (future)

**Requirements:**
- Minimum 1024 tokens
- Must be less than max_tokens
- Supported models: Claude 3.7 Sonnet, Claude 4.x

#### 3. Citations

**Purpose:** Ground responses in source documents with exact references

**How It Works:**
- Enable on document blocks: `citations: { enabled: true }`
- Model returns citation blocks referencing specific passages
- Automatic sentence-level chunking
- 15% improvement in recall accuracy

**Example:**
```json
{
  "type": "document",
  "source": {
    "type": "text",
    "media_type": "text/plain",
    "data": "Document content..."
  },
  "citations": { "enabled": true }
}
```

**Workbench Implementation:**
- Toggle: "Citations" switch
- Applied to uploaded documents
- Citation blocks displayed in output
- Shows exact source passages

**Supported Models:**
- Claude Opus 4.1, Opus 4
- Claude Sonnet 4.5, 4, 3.7
- Claude Haiku 3.5

#### 4. Multi-turn Conversations

**Purpose:** Maintain context across multiple messages

**How It Works:**
- Build messages array with alternating user/assistant turns
- Include all previous turns in conversation_history
- Combine with caching for cost optimization

**Workbench Implementation:**
```typescript
// First message with document
messages = [
  {
    role: 'user',
    content: [document_block, first_question]
  }
]

// Subsequent messages
messages = [
  { role: 'user', content: [document_block, first_question] },
  { role: 'assistant', content: first_answer },
  { role: 'user', content: second_question },  // New question
]
```

**Optimization:**
- Document cached on first message
- Subsequent messages: 90% cost reduction via cache hits
- Conversation history maintained in Zustand store
- Cleared when user leaves page or clicks "Clear conversation"

## Data Flow Diagrams

### Complete Test Execution Flow

```
┌────────────┐
│   User     │
│  Workbench │
└──────┬─────┘
       │ 1. User clicks "Test"
       │ 2. handleRunTest() called
       ▼
┌─────────────────────────────────────┐
│  Workbench Input Component          │
│  - Reads store state                │
│  - Builds request payload           │
│  - Calls useWorkbenchTest.mutate()  │
└──────┬──────────────────────────────┘
       │ 3. HTTP POST to Edge Function
       ▼
┌─────────────────────────────────────────────┐
│  Edge Function: execute-workbench-test      │
│  ┌───────────────────────────────────────┐  │
│  │ 1. Extract user_id from JWT          │  │
│  │ 2. Create execution (pending)        │  │
│  │    ↓ Realtime: ⏳ Pending            │  │
│  │ 3. Resolve LLM config               │  │
│  │ 4. Decrypt API key                  │  │
│  │ 5. Build Anthropic request          │  │
│  │ 6. Update execution (processing)     │  │
│  │    ↓ Realtime: ⚡ Processing        │  │
│  │ 7. Call Anthropic API               │  │
│  │ 8. Parse response                   │  │
│  │ 9. Update execution (completed)      │  │
│  │    ↓ Realtime: ✓ Completed          │  │
│  │ 10. Return result + execution_id    │  │
│  └───────────────────────────────────────┘  │
└──────┬──────────────────────────────────────┘
       │ 4. Response with execution_id
       ▼
┌─────────────────────────────────────┐
│  React Query Mutation Success       │
│  - subscribeToExecution(exec_id)    │
│  - addToConversation(user_msg)      │
│  - addToConversation(assistant_msg) │
│  - clearPrompt()                    │
└──────┬──────────────────────────────┘
       │ 5. Realtime subscription active
       ▼
┌─────────────────────────────────────┐
│  Supabase Realtime Channel          │
│  - Subscribed to execution_id       │
│  - Receives UPDATE events           │
│  - Calls handleExecutionUpdate()    │
└──────┬──────────────────────────────┘
       │ 6. Status updates received
       ▼
┌─────────────────────────────────────┐
│  Workbench Store                    │
│  - executionStatus updated          │
│  - UI rerenders with new status     │
└──────┬──────────────────────────────┘
       │ 7. After 1 second
       ▼
┌─────────────────────────────────────┐
│  Auto-unsubscribe                   │
│  - Channel closed                   │
│  - executionStatus → 'idle'         │
└─────────────────────────────────────┘
```

### Prompt Caching Flow

```
First Message (Cache MISS):
┌────────────┐
│   User     │ "Analyze this document"
└──────┬─────┘
       │
       ▼
┌──────────────────────────┐
│  Edge Function           │
│  {                       │
│    system: [             │
│      {                   │
│        text: "...",      │
│        cache_control ✓   │  ← Cache this
│      }                   │
│    ],                    │
│    messages: [           │
│      {                   │
│        content: [        │
│          {               │
│            type: "doc",  │
│            data: "...",  │
│            cache_control ✓ ← And this
│          }              │
│        ]                │
│      }                  │
│    ]                    │
│  }                      │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Anthropic API           │
│  - Processes request     │
│  - Creates cache         │
│  - Returns response      │
│  Usage: {                │
│    input_tokens: 5000    │
│    cache_write: 5000 ✓   │  ← Cache created
│  }                       │
└──────────────────────────┘

Second Message (Cache HIT):
┌────────────┐
│   User     │ "What are the key points?"
└──────┬─────┘
       │
       ▼
┌──────────────────────────┐
│  Edge Function           │
│  {                       │
│    system: [... same]    │  ← Identical
│    messages: [           │
│      {content: [doc]},   │  ← Identical
│      {role: "assistant"},│
│      {role: "user",      │
│       content: "key?"}   │  ← New question only
│    ]                    │
│  }                      │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Anthropic API           │
│  - Recognizes cached     │
│  - Skips reprocessing    │
│  - Returns response      │
│  Usage: {                │
│    input_tokens: 10      │  ← Only new question
│    cache_read: 5000 ✓    │  ← 90% cost savings!
│  }                       │
└──────────────────────────┘
```

## UI Components

### Workbench Input
**Location:** `components/workbench/workbench-input.tsx`

**Features:**
- Two-column layout (settings | prompts)
- Model selector (Sheet component)
- File upload (text/PDF)
- Feature toggles (thinking, citations, caching, tool use)
- System prompt (read-only from processor)
- Operation prompt (editable)
- Test button with loading state

**Model Selector:**
- Triggered by clicking "Model" text
- Sheet slides in from right
- Shows organization's available models (or global)
- Highlights current selection
- Preserves minimal UI when closed

### Workbench Output
**Location:** `components/workbench/workbench-output.tsx`

**Features:**
- Real-time status badges:
  - ⏳ Pending (yellow)
  - ⚡ Processing (blue)
  - ✓ Completed (green)
  - ✗ Failed (red)
- Token statistics with cache breakdown
- Conversation history (all turns)
- Copy/export conversation
- Clear conversation button

**Display:**
```
┌────────────────────────────────────────┐
│ ⚡ Processing  |  423 tokens  | 🎯 90 cached │
├────────────────────────────────────────┤
│ You                              10:34 │
│ ┌────────────────────────────────────┐ │
│ │ What are the payment terms?        │ │
│ └────────────────────────────────────┘ │
│                                        │
│ Assistant                  245 tokens │
│ ┌────────────────────────────────────┐ │
│ │ The payment terms are Net 30...    │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### Processor Header
**Location:** `components/processors/processor-header.tsx`

**Addition:** LLM Configuration Display

Shows in collapsible "Advanced settings":
```
LLM Configuration
  Claude 3.5 Sonnet • anthropic
  Using organization API key
```

## What's Implemented

### ✅ Phase A: Anthropic LLM Integration
- Anthropic SDK integration (@anthropic-ai/sdk v0.65.0)
- Global LLM settings table with 3 Claude models
- Multi-turn conversations with full context
- Prompt caching (5-min TTL, 90% cost reduction)
- Extended thinking mode (configurable budget)
- Document citations with exact references
- Model selector UI (Sheet component)
- Conversation history display
- Cache hit statistics
- LLM config in processor header
- Export conversation as JSON

### ✅ Phase B: Real-time Streaming
- `workbench_executions` table with RLS
- Edge Function database tracking
- Supabase Realtime subscriptions
- Live status updates (pending → processing → completed)
- Automatic subscription management
- Execution audit trail
- Multi-device support
- Error handling with real-time feedback

## What's NOT Implemented

### Future Enhancements

#### 1. Operation-Level Configuration
**Status:** Architecture ready, not implemented

Currently workbench uses processor's system prompt and user's test settings. Future:
- Store operation-specific settings in `operations.configuration`
- Pre-populate workbench with operation's temperature, thinking, citations
- Allow overriding for testing

**Migration Path:**
```sql
-- Already exists, just need to populate
UPDATE operations SET configuration = jsonb_build_object(
  'temperature', 0.7,
  'max_tokens', 4096,
  'thinking', jsonb_build_object('type', 'enabled', 'budget_tokens', 8000),
  'citations_enabled', true
) WHERE operation_type = 'analysis';
```

#### 2. Advanced Settings UI
**Status:** Store has fields, UI incomplete

Store has `advancedSettings` but UI only shows toggles. Future:
- Collapsible "Advanced Settings" panel
- Sliders for temperature, top_p, top_k
- Input for thinking budget (min 1024)
- Stop sequences editor
- Max tokens override

#### 3. Tool Use Support
**Status:** Toggle exists, not functional

UI has "Tool use" toggle but Anthropic tool use not implemented. Future:
- Define tools in processor configuration
- Pass tools to Anthropic API
- Display tool use in output
- Support for code execution, web search, etc.

**Anthropic API:**
```json
{
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather for a location",
      "input_schema": { ... }
    }
  ],
  "tool_choice": { "type": "auto" }
}
```

#### 4. Streaming Responses
**Status:** Infrastructure ready, not implemented

Table has `partial_response` field for incremental updates. Future:
- Use Anthropic streaming API (`stream: true`)
- Update `partial_response` as chunks arrive
- Display text as it's generated (typewriter effect)
- Realtime broadcasts partial updates

**Implementation:**
```typescript
const stream = await anthropic.messages.stream(requestParams)

for await (const chunk of stream) {
  // Update database with partial response
  await supabase
    .from('workbench_executions')
    .update({ partial_response: accumulatedText })
    .eq('id', executionId)
  // Realtime broadcasts update → Client displays incrementally
}
```

#### 5. Document Upload from Supabase Storage
**Status:** Not implemented

Currently only file upload from computer. Future:
- Browse documents from `documents` table
- Select existing document for testing
- Avoid re-uploading same file
- Automatically enable caching for selected documents

#### 6. Persistent Workbench Sessions
**Status:** Intentionally not implemented

Currently all state lost on page refresh. Could add:
- Save workbench state to local storage
- Resume conversation on page reload
- Option to save/load test sessions
- Share test sessions via URL

**Trade-off:** Simplicity vs. convenience (current choice: simplicity)

#### 7. Batch Testing
**Status:** Not implemented

Test same prompt against multiple models/settings. Future:
- Select multiple models
- Run same test N times
- Compare responses side-by-side
- Aggregate token usage statistics

#### 8. Cost Tracking
**Status:** Metrics stored, no UI

Database stores `tokens_used` but no cost calculation. Future:
- Calculate cost per execution based on model pricing
- Show cumulative cost for session
- Organization-level budget tracking
- Alert when approaching limits

**Pricing (as of 2025-01-01):**
- Claude 3.5 Sonnet: $3/M input, $15/M output
- Cache writes: +25% of input cost
- Cache reads: -90% of input cost

#### 9. Export Formats
**Status:** JSON only

Currently exports as JSON. Could add:
- Markdown export
- HTML export
- CSV for token statistics
- PDF reports

#### 10. Collaborative Testing
**Status:** Not planned

Future organization features:
- Share test sessions with team members
- Comment on test results
- Version control for test prompts
- Team analytics

## Security & Privacy

### API Key Security

**Current Implementation (Pre-Production):**
- Global API key stored in Edge Function environment variable (`ANTHROPIC_API_KEY`)
- Used when organization has no custom API key configured
- Suitable for beta/preview before commercial launch
- Simple, secure, and allows immediate testing

**Organization API Keys (Future/Enterprise):**
- Custom keys encrypted at rest using `encrypt_api_key(plaintext, org_id)`
- Organization-specific encryption keys
- Stored in `organizations.llm_configuration.api_keys_encrypted`
- Only service-role Edge Function can decrypt via `decrypt_api_key()`
- Never sent to client
- Rotation supported (update encrypted value)

**Edge Function Logic:**
```typescript
// Falls back: Organization key → Global env var
if (llmConfig.api_key_encrypted) {
  apiKey = await decrypt_api_key(llmConfig.api_key_encrypted, org_id)
} else {
  apiKey = Deno.env.get('ANTHROPIC_API_KEY')
}
```

### Row Level Security

```sql
-- Workbench executions
CREATE POLICY "Users can view their own workbench executions"
  ON workbench_executions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own workbench executions"
  ON workbench_executions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
  );

CREATE POLICY "Users can update their own workbench executions"
  ON workbench_executions FOR UPDATE
  USING (user_id = auth.uid());
```

**Realtime Security:**
- Filters by `id=eq.{execution_id}`
- User can only subscribe to own executions
- RLS policies enforce access control
- No cross-organization data leakage

### Data Isolation

**Organization Boundaries:**
- All executions scoped to organization_id
- JWT metadata determines organization context
- RLS policies prevent cross-org access
- Edge Function validates organization membership

**User Boundaries:**
- Executions scoped to user_id
- Only creator can view execution details
- Future: Share executions within organization

## Performance Considerations

### Prompt Caching Benefits

**Cost Savings:**
- Cache writes: +25% cost (one-time)
- Cache reads: -90% cost (recurring)
- Break-even: After 2nd use
- 10-turn conversation: ~85% total cost savings

**Latency Improvements:**
- Cache hit: ~50-85% faster response
- Larger documents: Greater improvements
- 5-minute TTL: Sufficient for testing sessions

**Optimization Tips:**
- Enable caching for documents > 1024 tokens
- Keep system prompt consistent
- Upload document once, ask multiple questions
- Use same processor to maintain cache

### Database Performance

**Indexes:**
```sql
CREATE INDEX idx_workbench_executions_user_id ON workbench_executions(user_id);
CREATE INDEX idx_workbench_executions_processor_id ON workbench_executions(processor_id);
CREATE INDEX idx_workbench_executions_status ON workbench_executions(status);
CREATE INDEX idx_workbench_executions_created_at ON workbench_executions(created_at DESC);
```

**Query Optimization:**
- Realtime filters by primary key (execution_id)
- User queries filtered by indexed user_id
- Processor queries use processor_id index
- Recent executions use created_at index

**Scaling:**
- Partition by created_at (monthly/quarterly)
- Archive old executions (> 90 days)
- Aggregate statistics for cost tracking
- Soft delete vs. hard delete (compliance)

### Realtime Scalability

**Connection Management:**
- One channel per execution
- Automatic cleanup on completion
- Max 100 concurrent channels per client (Supabase limit)
- Reconnection on network failures

**Message Volume:**
- 2-3 updates per execution (pending → processing → completed)
- Low message frequency (not streaming text yet)
- Minimal bandwidth usage
- Scales with user count, not message count

## Troubleshooting

### Common Issues

#### 1. "No models available"
**Cause:** No global settings or organization config
**Solution:**
```sql
-- Check global settings
SELECT * FROM llm_global_settings WHERE is_active = true;

-- Check organization config
SELECT llm_configuration FROM organizations
WHERE id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
```

#### 2. "Failed to decrypt API key"
**Cause:** Missing organization API key or encryption issue
**Solution:**
```sql
-- Verify encrypted key exists
SELECT llm_configuration -> 'api_keys_encrypted' -> 'anthropic'
FROM organizations WHERE id = 'org-uuid';

-- Re-encrypt if needed using set_organization_llm_config()
```

#### 3. "Execution stuck in 'processing'"
**Cause:** Edge Function error or timeout
**Solution:**
```sql
-- Check execution error message
SELECT error_message, updated_at FROM workbench_executions
WHERE id = 'execution-uuid';

-- Check Edge Function logs
```

#### 4. "Realtime updates not received"
**Cause:** Subscription not established or table not in publication
**Solution:**
```sql
-- Verify table in realtime publication
SELECT * FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'workbench_executions';

-- Check browser console for subscription errors
```

#### 5. "Cache not working"
**Cause:** Content changed or cache expired
**Solution:**
- Verify caching toggle enabled
- Check system prompt hasn't changed
- Ensure document content identical
- Verify file uploaded vs. document selection
- Cache expires after 5 minutes of inactivity

### Debug Queries

```sql
-- Recent executions for debugging
SELECT id, status, model_used, error_message,
       tokens_used, execution_time_ms, created_at
FROM workbench_executions
WHERE user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 10;

-- Check cache hit rates
SELECT
  model_used,
  COUNT(*) as total_executions,
  SUM((tokens_used->>'cached_read')::int) as total_cached_tokens,
  SUM((tokens_used->>'input')::int) as total_input_tokens,
  ROUND(100.0 * SUM((tokens_used->>'cached_read')::int) /
    NULLIF(SUM((tokens_used->>'input')::int), 0), 2) as cache_hit_rate_pct
FROM workbench_executions
WHERE user_id = auth.uid()
  AND status = 'completed'
  AND tokens_used IS NOT NULL
GROUP BY model_used;

-- Execution performance metrics
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as executions,
  AVG(execution_time_ms) as avg_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms) as median_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_time_ms
FROM workbench_executions
WHERE user_id = auth.uid()
  AND status = 'completed'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Migration Path to Production Runs

The Workbench architecture intentionally mirrors the future Run execution system:

**Similarities:**
- Same database structure (`runs` will mirror `workbench_executions`)
- Same Edge Function pattern (execution tracking)
- Same real-time subscription approach
- Same LLM configuration resolution

**Differences:**
- Runs are permanent (not ephemeral)
- Runs execute all operations in processor
- Runs process actual documents (not test uploads)
- Runs have workflow orchestration
- Runs generate structured output/reports

**Reusable Components:**
- `execute-workbench-test` → `execute-run` (similar structure)
- Workbench store patterns → Run tracking store
- Real-time subscription logic → Run progress tracking
- LLM config resolution → Same function

**Next Steps (Phase 2):**
1. Create `runs` and `operation_results` tables
2. Adapt Edge Function for operation execution
3. Build run orchestration system
4. Create result aggregation views
5. Generate reports from results

This architecture provides a proven foundation for the production execution system.

---

**Last Updated:** 2025-10-03 (Architecture corrected for service-role + SECURITY DEFINER pattern)
**Phase:** 1.6 Complete
**Next Phase:** 2.0 - Run Execution System

## Architecture Notes

### Service-Role + SECURITY DEFINER Pattern

The Edge Function uses a **service-role key** which bypasses RLS. This is architecturally correct for:
- External API integrations (Anthropic)
- API key decryption (requires service-role privileges)
- Cross-table queries without RLS overhead

However, `auth.jwt()` and `auth.uid()` helper functions only work with **user JWT context** (anon/authenticated roles), not service-role keys.

**Solution Implemented:**
- Database function `get_llm_config_for_run(p_processor_id uuid, p_user_id uuid)` accepts explicit user_id parameter
- Edge Function extracts user_id from incoming JWT and passes it explicitly
- Function queries `organization_members` table to resolve organization context
- Maintains backward compatibility: parameter is optional, falls back to `auth.uid()` when called from client

This follows Supabase best practices where Edge Functions handle service-role operations with explicit parameter passing rather than relying on JWT context that doesn't exist in service-role mode.
