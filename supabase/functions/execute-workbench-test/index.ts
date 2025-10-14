/**
 * Execute Workbench Test Edge Function
 *
 * @module execute-workbench-test
 * @description
 * Production-ready Edge Function for executing LLM test calls from the ValidAI workbench interface.
 * Built with Vercel AI SDK and Anthropic provider for robust, scalable AI interactions.
 *
 * ## Features
 * - **Multi-turn Conversations**: Maintains conversation context in stateful mode
 * - **Prompt Caching with Separate File Messages**: Reduces costs by 90% for repeated content
 *   by sending files as separate user messages positioned before conversation history,
 *   ensuring cache prefix remains identical across turns for consistent cache hits
 * - **PDF Support**: Handles PDF document uploads with proper buffer reconstruction
 * - **Extended Thinking**: Supports Claude's reasoning mode with configurable token budgets
 * - **Citations**: Extracts and returns citation blocks from AI responses
 * - **Advanced Settings**: Fine-grained control over model parameters
 * - **Real-time Updates**: Publishes execution status via Supabase Realtime
 *
 * ## Architecture
 * - Uses Vercel AI SDK for unified LLM interface (future multi-provider support)
 * - Handles both organization-specific and global API keys with encryption
 * - Separate file message architecture: Files sent as standalone user messages BEFORE
 *   conversation history to maintain cache prefix consistency across conversation turns
 * - User-controlled caching: Users keep "Send file" toggle ON for cache hits
 *
 * ## Known Issues & Workarounds
 * - **Thinking + Structured Output Bug**: Vercel AI SDK issue #7220 - When using generateObject()
 *   with thinking mode enabled, the SDK forces tool_choice which conflicts with Anthropic's
 *   thinking mode. WORKAROUND: Uses generateText() with manual tool definition when both
 *   thinking and structured output are enabled. This can be removed once the SDK is fixed.
 *   See: https://github.com/vercel/ai/issues/7220
 *
 * ## Error Handling
 * - Graceful fallbacks for malformed conversation history
 * - API errors returned as assistant messages for better UX
 * - Comprehensive error logging and status tracking
 *
 * @version 2.1.3
 * @since 2025-10-14
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Buffer } from 'https://deno.land/std@0.168.0/node/buffer.ts'
import { createAnthropic } from 'npm:@ai-sdk/anthropic'
import { generateText, Output } from 'npm:ai'
import { z } from 'npm:zod'

/**
 * CORS headers configuration for cross-origin requests
 * @constant
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Environment flag to control workbench_executions audit logging
 *
 * TODO: Review if workbench_executions audit trail is needed.
 * Currently adds ~500-1000ms latency per execution with 3 database roundtrips.
 * Data is never read by frontend - no history viewer, analytics, or replay features exist.
 *
 * Performance impact when disabled:
 * - Removes INSERT (pending status) before LLM call
 * - Removes UPDATE (processing status) before LLM call
 * - Removes UPDATE (completed/failed status) after LLM call
 *
 * Set ENABLE_WORKBENCH_AUDIT_LOG=true in Supabase Edge Function secrets to enable.
 *
 * @default false
 */
const ENABLE_WORKBENCH_AUDIT_LOG = Deno.env.get('ENABLE_WORKBENCH_AUDIT_LOG') === 'true'

/**
 * Request payload structure for workbench test execution
 *
 * @interface WorkbenchTestRequest
 * @property {string} processor_id - UUID of the processor to test
 * @property {'stateful' | 'stateless'} mode - Conversation mode (stateful maintains history)
 * @property {string} operation_type - Type of operation determining output structure
 * @property {string} [system_prompt] - System instructions for the AI
 * @property {boolean} send_system_prompt - Whether to include system prompt in request
 * @property {boolean} send_file - Whether to include uploaded file in request
 * @property {string} [file_content] - Base64-encoded file content (PDF or text)
 * @property {'text/plain' | 'application/pdf'} [file_type] - MIME type of uploaded file
 * @property {Array} conversation_history - Previous messages in stateful mode
 * @property {string} new_prompt - Current user prompt to send
 * @property {Object} settings - Model configuration and feature flags
 */
interface WorkbenchTestRequest {
  processor_id: string
  mode: 'stateful' | 'stateless'
  operation_type: 'generic' | 'validation' | 'extraction' | 'rating' | 'classification' | 'analysis'
  system_prompt?: string
  send_system_prompt: boolean
  send_file: boolean
  file_content?: string
  file_type?: 'text/plain' | 'application/pdf'
  conversation_history: Array<{
    role: 'user' | 'assistant'
    content: string | any[]  // Can be string or array of content blocks
    timestamp: string
  }>
  new_prompt: string
  settings: {
    model_id?: string
    temperature?: number
    max_tokens?: number
    top_p?: number
    top_k?: number
    thinking?: {
      type: 'enabled'
      budget_tokens: number
    }
    citations_enabled?: boolean
    create_cache?: boolean
    stop_sequences?: string[]
  }
}

/**
 * Main request handler for the Edge Function
 *
 * @function serve
 * @async
 * @param {Request} req - Incoming HTTP request
 * @returns {Promise<Response>} HTTP response with test results or error
 *
 * @description
 * Processes workbench test requests through the following steps:
 * 1. **Authentication**: Validates JWT token and extracts user/org context
 * 2. **Configuration**: Resolves LLM settings and API keys (org-specific or global)
 * 3. **Message Construction**: Builds messages with separate file message architecture
 *    - System message (if enabled, no cache control)
 *    - File message (separate user message WITH cache control, positioned before history)
 *    - Conversation history (text exchanges only, files excluded)
 *    - Current prompt (separate user message, no cache control)
 * 4. **Cache Consistency**: Separate file positioning ensures identical prefix across turns
 * 5. **LLM Execution**: Calls Anthropic via Vercel AI SDK with all settings
 * 6. **Response Processing**: Extracts text, thinking blocks, citations, and token usage
 * 7. **Real-time Updates**: Publishes status to Supabase for live UI updates
 *
 * @throws {Error} Authentication failures, configuration issues, or LLM API errors
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let executionId: string | null = null

  /**
   * Convert Buffer objects in content blocks back to base64 strings
   * This ensures the client receives the same format it originally sent,
   * maintaining cache consistency across conversation turns
   */
  const convertBuffersToBase64 = (content: any): any => {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return content

    return content.map((block: any) => {
      if (block.type === 'file' && block.data && Buffer.isBuffer(block.data)) {
        return {
          ...block,
          data: block.data.toString('base64')
        }
      }
      return block
    })
  }

  try {
    const body: WorkbenchTestRequest = await req.json()

    // Log request configuration for debugging
    console.log('=== Workbench Test Request ===')
    console.log(`Mode: ${body.mode}`)
    console.log(`Operation Type: ${body.operation_type}`)
    console.log(`Model: ${body.settings.model_id || 'default'}`)
    console.log(`Features: ${[
      body.settings.create_cache && 'caching',
      body.settings.thinking && 'thinking',
      body.settings.citations_enabled && 'citations',
      body.send_system_prompt && 'system_prompt',
      body.send_file && 'file'
    ].filter(Boolean).join(', ') || 'none'}`)

    // Get Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user ID from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Invalid user token')
    }

    // Resolve LLM configuration for the processor (includes organization_id)
    const { data: llmConfig, error: llmError } = await supabase.rpc('get_llm_config_for_run', {
      p_processor_id: body.processor_id,
      p_user_id: user.id
    })

    if (llmError || !llmConfig) {
      throw new Error(`Failed to resolve LLM config: ${llmError?.message || 'Unknown error'}`)
    }

    // Use model from request or fallback to resolved config
    // Moved earlier so we can use it for cache token calculations
    const modelToUse = body.settings.model_id || llmConfig.model

    // Create initial execution record (if audit logging enabled)
    if (ENABLE_WORKBENCH_AUDIT_LOG) {
      const { data: execution, error: execError } = await supabase
        .from('workbench_executions')
        .insert({
          processor_id: body.processor_id,
          user_id: user.id,
          organization_id: llmConfig.organization_id,
          status: 'pending',
          prompt: body.new_prompt,
          settings: body.settings
        })
        .select()
        .single()

      if (execError || !execution) {
        throw new Error(`Failed to create execution record: ${execError?.message}`)
      }

      executionId = execution.id
    }

    // Get API key: use organization key if configured, otherwise use global env var
    let apiKey: string | null = null

    if (llmConfig.api_key_encrypted) {
      // Organization has custom API key - decrypt it
      const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
        ciphertext: llmConfig.api_key_encrypted,
        org_id: llmConfig.organization_id
      })

      if (decryptError || !decryptedKey) {
        throw new Error(`Failed to decrypt organization API key: ${decryptError?.message || 'Unknown error'}`)
      }

      apiKey = decryptedKey
    } else {
      // No organization key - use global API key from environment
      apiKey = Deno.env.get('ANTHROPIC_API_KEY')

      if (!apiKey) {
        throw new Error('No API key available. Please configure ANTHROPIC_API_KEY environment variable or set organization API key.')
      }
    }

    // Initialize Anthropic provider with API key using createAnthropic factory
    const anthropicProvider = createAnthropic({ apiKey })

    // Build messages array
    const messages: any[] = []

    // System message handling
    // IMPORTANT: For cache control to work, system messages MUST be in the messages array,
    // NOT passed as the system parameter. The system parameter cannot have cache control.
    let system: string | undefined = undefined

    // Detect if we're in stateful mode with previously cached content
    // This is crucial for maintaining cache consistency across messages
    const hasPreviousCachedContent = body.mode === 'stateful' &&
      body.conversation_history.some(msg =>
        msg.metadata?.cacheCreated || msg.metadata?.cachedWriteTokens > 0
      )

    // Check if a file was previously cached (we need to preserve it for cache hits)
    const cachedFileMetadata = body.mode === 'stateful' ?
      body.conversation_history.find(msg =>
        msg.metadata?.cacheCreated && msg.metadata?.fileSent
      )?.metadata : null

    console.log(`=== Cache State Analysis ===`)
    console.log(`Mode: ${body.mode}`)
    console.log(`Has previous cached content: ${hasPreviousCachedContent}`)
    console.log(`Create cache requested: ${body.settings.create_cache}`)
    console.log(`Has cached file from previous message: ${!!cachedFileMetadata}`)
    if (hasPreviousCachedContent) {
      console.log('Previous cache detected - will send cache_control markers for Anthropic to match against existing cache')
    }

    // Add system message
    // CRITICAL: For caching with separate file messages:
    // 1. System messages go in messages array when caching (not system parameter)
    // 2. System message has NO cache control - cache control is ONLY on the file
    // 3. File is sent as SEPARATE user message positioned BEFORE conversation history
    // 4. This ensures prefix (system + file) stays identical across all turns
    // 5. Anthropic automatically matches cached prefixes when it sees cache_control markers
    if (body.send_system_prompt && body.system_prompt) {
      if (body.settings.create_cache || hasPreviousCachedContent) {
        // For ANY caching scenario, system message goes in messages array
        // but WITHOUT cache control - cache control will be on the file only
        messages.push({
          role: 'system',
          content: body.system_prompt
        })
        console.log('System message added to messages array (no cache control - file will have cache marker)')
      } else {
        // No caching involved - use system parameter for simpler approach
        system = body.system_prompt
        console.log('System message using system parameter (no caching)')
      }
    }

    // Store preserved file content to add to current user message later
    // This maintains the exact message structure for cache hits
    let preservedFileBlock: any = null
    if (hasPreviousCachedContent && cachedFileMetadata && cachedFileMetadata.fileSent) {
      // Check if current request is sending a file
      if (!body.send_file || !body.file_content) {
        // No new file being sent, but we had a cached file - we need to preserve it!
        // Look for the original file content in the first user message that had caching enabled
        const originalMessage = body.conversation_history.find(msg =>
          msg.role === 'user' && msg.metadata?.cacheCreated && msg.metadata?.fileSent
        )

        if (originalMessage && originalMessage.original_file_content) {
          console.log('Will preserve cached file in current user message for cache consistency')

          // Prepare the file block WITH cache control
          // CRITICAL: cache_control must be at the SAME position on every request for Anthropic to match cached content
          if (originalMessage.original_file_type === 'application/pdf') {
            const pdfBuffer = Buffer.from(originalMessage.original_file_content, 'base64')
            preservedFileBlock = {
              type: 'file',
              data: pdfBuffer,
              mediaType: 'application/pdf',
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral' }
                }
              }
            }
            console.log(`Cached PDF file will be preserved WITH cache control for cache matching (size: ${pdfBuffer.length} bytes)`)
          } else {
            // Text file
            preservedFileBlock = {
              type: 'text',
              text: originalMessage.original_file_content,
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral' }
                }
              }
            }
            console.log('Cached text file will be preserved WITH cache control for cache matching')
          }
        } else {
          console.warn('Cached file metadata exists but original content not found - cache will miss!')
        }
      }
    }

    // RESTRUCTURED MESSAGE ARCHITECTURE FOR CACHE HITS
    // ================================================
    // CRITICAL INSIGHT: For Anthropic caching to work across conversation turns,
    // the file must be in a SEPARATE user message BEFORE conversation history.
    //
    // Message structure progression:
    // Turn 1: [system, user(file_with_cache), user(prompt)]
    // Turn 2: [system, user(file_with_cache), assistant, user(prompt)]
    // Turn 3: [system, user(file_with_cache), assistant, user, assistant, user(prompt)]
    //
    // This ensures the prefix up to and including the file remains IDENTICAL,
    // allowing Anthropic to match the cached content on every turn.

    // FIRST: Add file as SEPARATE user message (if file is being sent)
    // This positions the file BEFORE any conversation history for consistent cache position
    if (body.send_file && body.file_content) {
      if (body.file_type === 'application/pdf') {
        const pdfBuffer = Buffer.from(body.file_content, 'base64')
        const fileBlock: any = {
          type: 'file',
          data: pdfBuffer,
          mediaType: 'application/pdf'
        }

        // Add cache control whenever caching is enabled
        if (body.settings.create_cache || hasPreviousCachedContent) {
          const estimatedTokens = Math.ceil(pdfBuffer.length / 5)
          const minTokensRequired = modelToUse.includes('haiku') ? 2048 : 1024

          if (estimatedTokens < minTokensRequired) {
            console.warn(`PDF may be too small for caching (estimated ${estimatedTokens} tokens, minimum ${minTokensRequired} required for ${modelToUse})`)
          }

          fileBlock.providerOptions = {
            anthropic: {
              cacheControl: { type: 'ephemeral' }
            }
          }

          if (body.settings.create_cache && !hasPreviousCachedContent) {
            console.log(`PDF file in SEPARATE message WITH cache control - creating cache (size: ${pdfBuffer.length} bytes, ~${estimatedTokens} tokens)`)
          } else {
            console.log(`PDF file in SEPARATE message WITH cache control - matching cache (size: ${pdfBuffer.length} bytes, ~${estimatedTokens} tokens)`)
          }
        } else {
          console.log(`PDF file in SEPARATE message WITHOUT cache control (size: ${pdfBuffer.length} bytes)`)
        }

        // Add file as its own user message
        messages.push({
          role: 'user',
          content: [fileBlock]
        })
        console.log('✅ File added as SEPARATE user message (will stay in same position across turns)')

      } else {
        // Text file
        const textBlock: any = {
          type: 'text',
          text: body.file_content
        }

        if (body.settings.create_cache || hasPreviousCachedContent) {
          const estimatedTokens = Math.ceil(body.file_content.length / 4)
          const minTokensRequired = modelToUse.includes('haiku') ? 2048 : 1024

          if (estimatedTokens < minTokensRequired) {
            console.warn(`Text file may be too small for caching (estimated ${estimatedTokens} tokens, minimum ${minTokensRequired} required for ${modelToUse})`)
          }

          textBlock.providerOptions = {
            anthropic: {
              cacheControl: { type: 'ephemeral' }
            }
          }

          if (body.settings.create_cache && !hasPreviousCachedContent) {
            console.log(`Text file in SEPARATE message WITH cache control - creating cache (length: ${body.file_content.length} chars, ~${estimatedTokens} tokens)`)
          } else {
            console.log(`Text file in SEPARATE message WITH cache control - matching cache (length: ${body.file_content.length} chars, ~${estimatedTokens} tokens)`)
          }
        } else {
          console.log(`Text file in SEPARATE message WITHOUT cache control (length: ${body.file_content.length} chars)`)
        }

        // Add file as its own user message
        messages.push({
          role: 'user',
          content: [textBlock]
        })
        console.log('✅ File added as SEPARATE user message (will stay in same position across turns)')
      }
    } else if (preservedFileBlock && (!body.send_file || !body.file_content)) {
      // User toggled "Send file" OFF but we need to preserve cached file
      messages.push({
        role: 'user',
        content: [preservedFileBlock]
      })
      console.log('✅ Preserved cached file as SEPARATE user message (maintaining cache position)')
    }

    /**
     * SECOND: Process conversation history for stateful mode
     *
     * @description
     * Reconstructs previous messages from stored conversation history.
     * MUST come AFTER system message AND file message to maintain cache prefix.
     * With the new architecture, conversation history is simple text exchanges only.
     *
     * ## Correct Message Order for Cache Hits
     * - System message comes first (no cache control)
     * - File message comes second (WITH cache control) - SEPARATE user message at FIXED position
     * - Conversation history comes third (no cache control) - ADDED HERE
     * - New prompt comes last (no cache control) - SEPARATE user message
     * - This ensures the file stays at position 1, allowing cache hits across all turns
     */
    if (body.mode === 'stateful' && body.conversation_history.length > 0) {
      console.log(`\n=== Processing Conversation History ===`)
      console.log(`History contains ${body.conversation_history.length} messages`)

      body.conversation_history.forEach((msg, historyIdx) => {
        // NEW ARCHITECTURE: Skip file messages entirely from history
        // The file is now sent as a separate message at the beginning
        if (msg.metadata?.fileSent) {
          console.log(`Skipping history message ${historyIdx} (was a file message - file now sent separately)`)
          return
        }

        // Extract simple text content only
        // With separate file messages, history should only contain text exchanges
        let processedContent: string

        if (typeof msg.content === 'string') {
          processedContent = msg.content
        } else if (Array.isArray(msg.content)) {
          // Extract text from blocks
          const textParts: string[] = []
          for (const block of msg.content) {
            if (block.type === 'text' && block.text) {
              textParts.push(block.text)
            } else if (typeof block === 'string') {
              textParts.push(block)
            }
          }
          processedContent = textParts.join('\n')
        } else {
          // Fallback for unexpected formats
          processedContent = String(msg.content)
        }

        messages.push({
          role: msg.role,
          content: processedContent
        })
        console.log(`Added history message ${historyIdx}: role=${msg.role}, length=${processedContent.length} chars`)
      })

      console.log(`✅ Processed ${body.conversation_history.length} history messages (files excluded, now sent separately)`)
      console.log(`===================================\n`)
    }

    // THIRD: Add the current prompt as SEPARATE user message
    // This comes AFTER the file message and conversation history
    messages.push({
      role: 'user',
      content: body.new_prompt
    })
    console.log('✅ Current prompt added as SEPARATE user message')

    // COMPREHENSIVE LOGGING FOR CACHE DEBUGGING
    // ==========================================
    // This detailed logging helps compare message structures between turns
    // to identify why cache hits succeed or fail
    console.log('\n=== DETAILED MESSAGE STRUCTURE FOR CACHE DEBUGGING ===')
    console.log(`Total messages: ${messages.length}`)
    console.log(`System parameter: ${system ? 'yes (for non-cached request)' : 'no (using messages array)'}`)
    console.log(`Cache strategy: ${body.settings.create_cache ? 'CREATE NEW CACHE' : hasPreviousCachedContent ? 'USE EXISTING CACHE' : 'NO CACHING'}`)
    console.log('')

    // Generate a prefix signature for comparison across turns
    const prefixParts: string[] = []
    let totalCacheMarkers = 0
    let cacheMarkerPosition = -1

    messages.forEach((msg, idx) => {
      console.log(`\n--- Message ${idx} ---`)
      console.log(`Role: ${msg.role}`)

      let messageCacheMarkers = 0
      let contentSummary = ''

      if (typeof msg.content === 'string') {
        const preview = msg.content.substring(0, 100)
        contentSummary = `string (${msg.content.length} chars): "${preview}${msg.content.length > 100 ? '...' : ''}"`
        console.log(`Content: ${contentSummary}`)
        prefixParts.push(`${msg.role}:text:${msg.content.length}chars`)
      } else if (Array.isArray(msg.content)) {
        console.log(`Content: array with ${msg.content.length} blocks`)
        const blockTypes: string[] = []

        msg.content.forEach((block: any, blockIdx: number) => {
          const blockType = block.type || 'unknown'
          blockTypes.push(blockType)

          console.log(`  Block ${blockIdx}: type=${blockType}`)

          if (blockType === 'text') {
            const textPreview = block.text ? block.text.substring(0, 80) : 'empty'
            const textLength = block.text ? block.text.length : 0
            console.log(`    Text (${textLength} chars): "${textPreview}${textLength > 80 ? '...' : ''}"`)
            prefixParts.push(`${msg.role}:text:${textLength}chars`)
          } else if (blockType === 'file') {
            const fileSize = Buffer.isBuffer(block.data) ? block.data.length : 0
            const mediaType = block.mediaType || 'unknown'
            console.log(`    File: type=${mediaType}, size=${fileSize} bytes`)
            prefixParts.push(`${msg.role}:file:${mediaType}:${fileSize}bytes`)
          }

          // Check for cache control on this block
          if (block.providerOptions?.anthropic?.cacheControl) {
            totalCacheMarkers++
            messageCacheMarkers++
            cacheMarkerPosition = idx
            console.log(`    ✅ CACHE CONTROL: ${JSON.stringify(block.providerOptions.anthropic.cacheControl)}`)
            prefixParts.push('CACHE_MARKER')
          }
        })

        contentSummary = `${msg.content.length} blocks [${blockTypes.join(', ')}]`
      } else {
        contentSummary = 'unknown format'
        console.log(`Content: ${contentSummary}`)
      }

      // Check for message-level cache control
      if (msg.providerOptions?.anthropic?.cacheControl) {
        totalCacheMarkers++
        messageCacheMarkers++
        cacheMarkerPosition = idx
        console.log(`✅ MESSAGE-LEVEL CACHE CONTROL: ${JSON.stringify(msg.providerOptions.anthropic.cacheControl)}`)
        prefixParts.push('CACHE_MARKER')
      }

      console.log(`Cache markers in this message: ${messageCacheMarkers}`)
    })

    // Generate prefix signature for comparison between turns
    const prefixSignature = prefixParts.join('|')
    console.log('\n=== PREFIX SIGNATURE FOR COMPARISON ===')
    console.log(`Signature: ${prefixSignature}`)
    console.log(`\nInstruction: Compare this signature with previous turns to verify prefix matching`)
    console.log(`The prefix UP TO AND INCLUDING the cache marker must be IDENTICAL for cache hits`)

    // Cache marker validation
    console.log('\n=== CACHE MARKER VALIDATION ===')
    console.log(`Total cache markers: ${totalCacheMarkers}`)
    if (totalCacheMarkers > 1) {
      console.warn(`⚠️ WARNING: ${totalCacheMarkers} cache markers detected! Should only have 1.`)
    } else if (totalCacheMarkers === 1) {
      console.log(`✅ Single cache marker at message position ${cacheMarkerPosition} (correct)`)
      console.log(`Expected behavior:`)
      console.log(`- Turn 1: Anthropic will CACHE everything up to and including this marker`)
      console.log(`- Turn 2+: If prefix is identical, Anthropic will HIT cache and reuse cached tokens`)
    } else if (body.settings.create_cache || hasPreviousCachedContent) {
      console.warn('⚠️ WARNING: Cache requested but no cache markers found!')
    } else {
      console.log('No cache markers (caching disabled)')
    }
    console.log('===================================================\n')

    // Update status to processing (if audit logging enabled)
    if (ENABLE_WORKBENCH_AUDIT_LOG && executionId) {
      await supabase
        .from('workbench_executions')
        .update({
          status: 'processing',
          model_used: modelToUse
        })
        .eq('id', executionId)
    }

    /**
     * Get structured output configuration based on operation type
     * Uses Vercel AI SDK's experimental_output pattern for proper structured data generation
     *
     * @param operationType - The type of operation (validation, rating, classification, etc.)
     * @param customSchema - Optional custom Zod schema for extraction operations
     * @returns Output configuration or undefined for generic/analysis operations
     */
    const getOutputConfig = (operationType: string, customSchema?: any): any => {
      switch (operationType) {
        case 'generic':
          // Simple string response for free-form operations
          // This eliminates special cases and ensures experimental_output is always present
          return Output.object({
            schema: z.object({
              response: z.string().describe('The AI response text')
            })
          })

        case 'validation':
          return Output.object({
            schema: z.object({
              result: z.boolean().describe('The validation result (true/false)'),
              comment: z.string().describe('Reasoning and explanation for the decision')
            })
          })

        case 'rating':
          return Output.object({
            schema: z.object({
              value: z.number().describe('Numerical rating value'),
              comment: z.string().describe('Rationale and explanation for rating')
            })
          })

        case 'classification':
          return Output.object({
            schema: z.object({
              classification: z.string().describe('Assigned category or classification'),
              comment: z.string().describe('Reasoning for classification decision')
            })
          })

        case 'extraction':
          return Output.object({
            schema: z.object({
              items: z.array(z.string()).describe('Array of extracted items'),
              comment: z.string().describe('Context and explanation of extraction')
            })
          })

        case 'analysis':
          return Output.object({
            schema: z.object({
              conclusion: z.string().describe('Main analytical conclusion'),
              comment: z.string().describe('Supporting analysis and detailed explanation')
            })
          })

        case 'traffic_light':
          return Output.object({
            schema: z.object({
              traffic_light: z.enum(['red', 'yellow', 'green']).describe('Traffic light status indicator (red=high risk, yellow=medium risk, green=low risk)'),
              comment: z.string().describe('Explanation for the traffic light status')
            })
          })

        default:
          // Fallback - should never reach here but safety net
          return Output.object({
            schema: z.object({
              response: z.string()
            })
          })
      }
    }

    // Get structured output configuration for this operation type
    const outputConfig = getOutputConfig(body.operation_type)

    // Execute LLM call using Vercel AI SDK
    // Tracks execution time for performance metrics
    const startTime = Date.now()

    try {
      let response: any

      // VERCEL AI SDK PROPER PATTERN FOR STRUCTURED OUTPUT
      // Uses experimental_output with generateText - the correct way to combine:
      // - Structured output (for validation, rating, classification, extraction)
      // - Extended thinking mode
      // - Prompt caching
      //
      // This approach:
      // - Aligns with Vercel AI SDK's intended architecture
      // - Scales to all 5 operation types
      // - Preserves cache (no tools parameter changes)
      // - Works with thinking mode (no conflicts)

      const universalParams: any = {
        model: anthropicProvider(modelToUse),
        messages, // Use original messages without modifications
        experimental_output: outputConfig, // undefined for Generic/Analysis, schema for others
        maxTokens: body.settings.max_tokens || llmConfig.settings.default_max_tokens || 4096,
        temperature: body.settings.temperature,
        topP: body.settings.top_p,
        topK: body.settings.top_k,
        stopSequences: body.settings.stop_sequences,
        providerOptions: {
          anthropic: {
            // Pass thinking mode if enabled
            ...(body.settings.thinking ? {
              thinking: {
                type: body.settings.thinking.type,
                budgetTokens: body.settings.thinking.budget_tokens
              }
            } : {})
          }
        }
      }

      // Only add system parameter if it's defined and not using messages array for system content
      if (system) {
        universalParams.system = system
      }

      response = await generateText(universalParams)

      // Extract structured output using Vercel AI SDK's experimental_output
      // This is automatically validated against the schema we provided
      const structuredOutput = response.experimental_output || null

      if (structuredOutput) {
        console.log('✅ Structured output generated:', JSON.stringify(structuredOutput))
      } else if (outputConfig) {
        console.warn('⚠️ Expected structured output but none was generated')
      }

      const executionTime = Date.now() - startTime

      // Comprehensive debug logging
      console.log('=== LLM Response Debug ===')
      console.log('Response keys:', Object.keys(response))
      console.log('Usage:', JSON.stringify(response.usage))
      console.log('Provider metadata:', JSON.stringify(response.providerMetadata))

      // Deep dive into providerMetadata structure
      if (response.providerMetadata) {
        console.log('Provider metadata keys:', Object.keys(response.providerMetadata))
        if (response.providerMetadata.anthropic) {
          console.log('Anthropic metadata keys:', Object.keys(response.providerMetadata.anthropic))
          console.log('Full Anthropic metadata:', JSON.stringify(response.providerMetadata.anthropic, null, 2))
        }
      }

      // Log cache usage for debugging
      // Vercel AI SDK v5 returns cache metadata in providerMetadata.anthropic
      const anthropicMetadata = response.providerMetadata?.anthropic || {}

      if (Object.keys(anthropicMetadata).length > 0) {
        console.log('✅ Anthropic metadata found:', JSON.stringify(anthropicMetadata))
      } else {
        console.log('⚠️ No Anthropic metadata in response')
      }

      // Vercel AI SDK returns cache data in the usage object with snake_case names
      const cacheWriteTokens = anthropicMetadata.usage?.cache_creation_input_tokens ||
                               anthropicMetadata.cacheCreationInputTokens || 0
      const cacheReadTokens = anthropicMetadata.usage?.cache_read_input_tokens ||
                              anthropicMetadata.cacheReadInputTokens || 0

      // Calculate actual input tokens
      // IMPORTANT: Vercel AI SDK's response.usage.inputTokens is the TOTAL including cached tokens
      // We don't need to add cacheReadTokens to it
      const totalInputTokens = response.usage?.inputTokens || 0

      // Log to verify our understanding
      console.log(`Token calculation: usage.inputTokens=${response.usage?.inputTokens}, cacheReadTokens=${cacheReadTokens}, cacheWriteTokens=${cacheWriteTokens}`)

      // Enhanced cache debugging
      console.log('=== Cache Results ===')
      if (cacheWriteTokens > 0) {
        console.log(`✅ CACHE CREATED: ${cacheWriteTokens} tokens cached for future use`)
        console.log(`   Next identical prefix will get 90% discount on these tokens`)
      }
      if (cacheReadTokens > 0) {
        const cacheHitRate = totalInputTokens > 0 ? Math.round((cacheReadTokens / totalInputTokens) * 100) : 0
        const tokensSaved = Math.round(cacheReadTokens * 0.9)
        console.log(`✅ CACHE HIT: ${cacheReadTokens}/${totalInputTokens} tokens (${cacheHitRate}% hit rate)`)
        console.log(`💰 COST SAVINGS: ~${tokensSaved} tokens (90% discount applied)`)
      }
      if (cacheWriteTokens === 0 && cacheReadTokens === 0) {
        if (body.settings.create_cache) {
          console.error('❌ CACHE FAILED: Requested to create cache but no tokens were cached')
          console.error('   Possible causes:')
          console.error('   - Content too short (needs 1024+ tokens for most models, 2048+ for Haiku)')
          console.error('   - Cache control not properly sent to API')
          console.error('   - Multiple cache markers causing conflicts')
        } else if (hasPreviousCachedContent) {
          console.error('❌ CACHE MISS: Expected to use existing cache but got no cache hit')
          console.error('   Possible causes:')
          console.error('   - Message prefix changed (must be 100% identical)')
          console.error('   - Cache expired (5 minutes for ephemeral)')
          console.error('   - Cache control markers in wrong position')
        }
      }

      // Extract response content and special blocks
      // Vercel AI SDK provides the text directly in response.text
      // For structured outputs, we need to handle both regular text and structured data
      let responseText = response.text || ''

      // For structured outputs, extract the appropriate text representation
      if (structuredOutput) {
        if (body.operation_type === 'generic' || body.operation_type === 'analysis') {
          // For Generic/Analysis, the response field contains the actual text
          responseText = structuredOutput.response || responseText
        } else if (!responseText || responseText.trim() === '') {
          // For other types (validation, rating, etc.), if there's no text response,
          // use JSON representation of the structured output
          responseText = JSON.stringify(structuredOutput, null, 2)
        }
        // If we have both text (e.g., from thinking) and structured output, keep the text
        // The structured output will be sent separately in the structured_output field
      }

      // Extract thinking/reasoning blocks - Vercel AI SDK returns these as top-level fields
      const thinkingBlocks: any[] = []
      if (response.reasoning) {
        // Format reasoning as thinking block for frontend compatibility
        // Frontend expects either 'thinking' or 'text' field
        thinkingBlocks.push({
          type: 'thinking',
          thinking: response.reasoning,  // Use 'thinking' field that frontend expects
          text: response.reasoning  // Also include 'text' as fallback
        })
      }

      // Extract citations from provider metadata if available
      const citations: any[] = []

      // Check rawResponse for citation blocks (Anthropic-specific)
      if (response.rawResponse && response.rawResponse.content) {
        response.rawResponse.content.forEach((block: any) => {
          if (block.type === 'citation') {
            citations.push(block)
          }
        })
      }

      // Extract cache metadata from providerMetadata.anthropic
      // Using the same variables as calculated above
      const cachedReadTokens = cacheReadTokens
      const cachedWriteTokens = cacheWriteTokens

      // Build result payload for client with metadata
      // Includes execution_id for real-time subscription tracking
      const result = {
        execution_id: executionId,  // Client subscribes to this ID for status updates
        response: responseText,
        structured_output: structuredOutput,  // Include structured data for visualization
        thinking_blocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
        citations: citations.length > 0 ? citations : undefined,
        metadata: {
          mode: body.mode,
          cacheCreated: body.settings.create_cache || false,
          systemPromptSent: body.send_system_prompt && !!body.system_prompt,
          fileSent: body.send_file && !!body.file_content,
          thinkingEnabled: !!body.settings.thinking,
          citationsEnabled: body.settings.citations_enabled || false,
          inputTokens: totalInputTokens,
          outputTokens: response.usage?.outputTokens || 0,
          cachedReadTokens,
          cachedWriteTokens,
          executionTimeMs: executionTime
        },
        tokensUsed: {
          input: totalInputTokens,
          output: response.usage?.outputTokens || 0,
          cached_read: cachedReadTokens,  // Cost savings from cache hits
          cached_write: cachedWriteTokens,  // One-time cost to create cache
          total: totalInputTokens + (response.usage?.outputTokens || 0)
        },
        executionTime,
        timestamp: new Date().toISOString(),
        // Return exact content structure sent to Anthropic for cache consistency
        // Convert Buffers back to base64 strings for proper serialization
        user_content_sent: convertBuffersToBase64(messages[messages.length - 1].content),
        // System message is passed separately in Vercel AI SDK v5
        system_sent: system
      }

      // Update execution record with completion status (if audit logging enabled)
      if (ENABLE_WORKBENCH_AUDIT_LOG && executionId) {
        await supabase
          .from('workbench_executions')
          .update({
            status: 'completed',
            response: responseText,
            thinking_blocks: thinkingBlocks.length > 0 ? thinkingBlocks : null,
            citations: citations.length > 0 ? citations : null,
            tokens_used: result.tokensUsed,
            execution_time_ms: executionTime
          })
          .eq('id', executionId)
      }

      return new Response(
        JSON.stringify(result),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
    } catch (apiError: any) {
      // LLM API rejected the request (e.g., unsupported feature, invalid parameters)
      // Return this as a successful response so it displays in the Output section
      const executionTime = Date.now() - startTime

      // Extract detailed error message from Vercel AI SDK
      let errorMessage = 'API Error: '
      if (apiError instanceof Error) {
        errorMessage += apiError.message
      } else if (typeof apiError === 'string') {
        errorMessage += apiError
      } else {
        errorMessage += JSON.stringify(apiError)
      }

      console.log('LLM API error (returning as assistant message):', errorMessage)

      const result = {
        execution_id: executionId,
        response: errorMessage,  // Display error as assistant response
        structured_output: null,  // No structured output on error
        metadata: {
          mode: body.mode,
          cacheCreated: body.settings.create_cache || false,
          systemPromptSent: body.send_system_prompt && !!body.system_prompt,
          fileSent: body.send_file && !!body.file_content,
          thinkingEnabled: !!body.settings.thinking,
          citationsEnabled: body.settings.citations_enabled || false,
          inputTokens: 0,
          outputTokens: 0,
          executionTimeMs: executionTime
        },
        tokensUsed: {
          input: 0,
          output: 0,
          total: 0
        },
        executionTime,
        timestamp: new Date().toISOString(),
        // Convert Buffers back to base64 strings for proper serialization
        user_content_sent: convertBuffersToBase64(messages[messages.length - 1].content),
        // System message is passed separately in Vercel AI SDK v5
        system_sent: system
      }

      // Mark as COMPLETED (not failed) so it shows in Output section (if audit logging enabled)
      if (ENABLE_WORKBENCH_AUDIT_LOG && executionId) {
        await supabase
          .from('workbench_executions')
          .update({
            status: 'completed',
            response: errorMessage,
            execution_time_ms: executionTime
          })
          .eq('id', executionId)
      }

      // Return 200 OK so frontend treats this as a valid response
      return new Response(
        JSON.stringify(result),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
    }

  } catch (error) {
    console.error('Error in execute-workbench-test:', error)

    // Update execution record with error if we have an execution ID (if audit logging enabled)
    if (ENABLE_WORKBENCH_AUDIT_LOG && executionId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        await supabase
          .from('workbench_executions')
          .update({
            status: 'failed',
            error_message: error.message || error.toString()
          })
          .eq('id', executionId)
      } catch (updateError) {
        console.error('Failed to update execution with error:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})
