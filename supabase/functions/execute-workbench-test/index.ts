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
 * - **Prompt Caching**: Reduces costs by 90% for repeated content using Anthropic's cache control
 * - **PDF Support**: Handles PDF document uploads with proper buffer reconstruction
 * - **Extended Thinking**: Supports Claude's reasoning mode with configurable token budgets
 * - **Citations**: Extracts and returns citation blocks from AI responses
 * - **Advanced Settings**: Fine-grained control over model parameters
 * - **Real-time Updates**: Publishes execution status via Supabase Realtime
 *
 * ## Architecture
 * - Uses Vercel AI SDK for unified LLM interface (future multi-provider support)
 * - Handles both organization-specific and global API keys with encryption
 * - Preserves cache control metadata across conversation turns
 * - Properly reconstructs complex message structures from stored conversations
 *
 * ## Error Handling
 * - Graceful fallbacks for malformed conversation history
 * - API errors returned as assistant messages for better UX
 * - Comprehensive error logging and status tracking
 *
 * @version 2.0.0
 * @since 2025-10-06
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Buffer } from 'https://deno.land/std@0.168.0/node/buffer.ts'
import { createAnthropic } from 'npm:@ai-sdk/anthropic'
import { generateText, generateObject } from 'npm:ai'
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
 * 3. **Message Construction**: Builds properly formatted messages with cache control
 * 4. **Conversation History**: Reconstructs previous messages with file/cache preservation
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

  try {
    const body: WorkbenchTestRequest = await req.json()

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

    // Get organization ID from JWT
    const { data: orgData } = await supabase.rpc('get_llm_config_for_run', {
      p_processor_id: body.processor_id,
      p_user_id: user.id
    })

    if (!orgData) {
      throw new Error('Could not determine organization')
    }

    // Create initial execution record
    const { data: execution, error: execError } = await supabase
      .from('workbench_executions')
      .insert({
        processor_id: body.processor_id,
        user_id: user.id,
        organization_id: orgData.organization_id,
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

    // Resolve LLM configuration for the processor
    const { data: llmConfig, error: llmError } = await supabase.rpc('get_llm_config_for_run', {
      p_processor_id: body.processor_id,
      p_user_id: user.id
    })

    if (llmError || !llmConfig) {
      throw new Error(`Failed to resolve LLM config: ${llmError?.message || 'Unknown error'}`)
    }

    // Use model from request or fallback to resolved config
    const modelToUse = body.settings.model_id || llmConfig.model

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

    // Build messages array based on mode and user toggles
    const messages: any[] = []

    // Add system message if enabled
    // Vercel AI SDK supports system messages in the messages array with cache control
    if (body.send_system_prompt && body.system_prompt) {
      if (body.settings.create_cache) {
        // System message with cache control goes in messages array
        messages.push({
          role: 'system',
          content: body.system_prompt,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } }
          }
        })
      } else {
        // Simple system message without cache
        messages.push({
          role: 'system',
          content: body.system_prompt
        })
      }
    }

    /**
     * Process conversation history for stateful mode
     *
     * @description
     * Reconstructs previous messages from stored conversation history.
     * Critical for maintaining context and cache consistency across turns.
     *
     * ## Challenges Addressed
     * - **Buffer Reconstruction**: Stored PDFs have serialized Buffer objects that need rebuilding
     * - **Cache Preservation**: Maintains providerOptions to ensure cache hits (90% cost savings)
     * - **Format Compatibility**: Converts stored format to Vercel AI SDK requirements
     * - **Graceful Degradation**: Falls back to text extraction for malformed blocks
     */
    if (body.mode === 'stateful' && body.conversation_history.length > 0) {
      body.conversation_history.forEach(msg => {
        // Process content to ensure it's in the correct format for Vercel AI SDK
        let processedContent = msg.content

        // If content is an array with file blocks, we need to reconstruct it properly
        if (Array.isArray(msg.content)) {
          const contentBlocks: any[] = []

          for (const block of msg.content) {
            if (block.type === 'file' && block.data) {
              // File blocks from stored conversation have Buffer objects that need reconstruction
              // For PDFs, reconstruct the file block with proper Buffer
              if (block.mediaType === 'application/pdf' || block.mimeType === 'application/pdf') {
                // If data is a Buffer object representation, convert it back
                let pdfBuffer: Buffer
                if (block.data.type === 'Buffer' && Array.isArray(block.data.data)) {
                  // Reconstruct Buffer from array of bytes
                  pdfBuffer = Buffer.from(block.data.data)
                } else if (typeof block.data === 'string') {
                  // If it's a base64 string
                  pdfBuffer = Buffer.from(block.data, 'base64')
                } else {
                  // Already a Buffer
                  pdfBuffer = block.data
                }

                const fileBlock: any = {
                  type: 'file',
                  data: pdfBuffer,
                  mediaType: 'application/pdf'
                }

                // PRESERVE CACHE CONTROL if it exists
                if (block.providerOptions) {
                  fileBlock.providerOptions = block.providerOptions
                }

                contentBlocks.push(fileBlock)
              } else {
                // Other file types or malformed blocks - skip for safety
                console.log('Skipping non-PDF file block in conversation history')
              }
            } else if (block.type === 'text' && block.text) {
              // Text blocks can be passed through
              const textBlock: any = {
                type: 'text',
                text: block.text
              }

              // PRESERVE CACHE CONTROL if it exists
              if (block.providerOptions) {
                textBlock.providerOptions = block.providerOptions
              }

              contentBlocks.push(textBlock)
            } else if (block.type === 'document') {
              // Document blocks with cache control from previous messages
              // These need special handling but for now we'll skip them
              console.log('Skipping document block in conversation history - cannot reconstruct')
            } else if (typeof block === 'string') {
              // Plain string content
              contentBlocks.push({
                type: 'text',
                text: block
              })
            }
          }

          // If we have content blocks, use them; otherwise fallback to extracting text
          if (contentBlocks.length > 0) {
            processedContent = contentBlocks
          } else {
            // Fallback: extract text from the blocks
            const textBlocks = msg.content.filter((b: any) => b.type === 'text' && b.text)
            processedContent = textBlocks.length > 0
              ? textBlocks.map((b: any) => b.text).join(' ')
              : 'Previous message contained non-text content'
          }
        }

        messages.push({
          role: msg.role,
          content: processedContent
        })
      })
    }

    // Build current message content
    const contentBlocks: any[] = []

    // Add file if user toggled "Send file" ON
    // Vercel AI SDK uses 'file' type for documents/PDFs
    if (body.send_file && body.file_content) {
      if (body.file_type === 'application/pdf') {
        // PDF files use the 'file' type with base64 data
        // Convert base64 string to Buffer for Vercel AI SDK
        const pdfBuffer = Buffer.from(body.file_content, 'base64')

        const fileBlock: any = {
          type: 'file',
          data: pdfBuffer,
          mediaType: 'application/pdf'
        }

        // Add cache control if enabled
        if (body.settings.create_cache) {
          fileBlock.providerOptions = {
            anthropic: { cacheControl: { type: 'ephemeral' } }
          }
        }

        contentBlocks.push(fileBlock)
      } else {
        // Text files can be sent as text blocks with cache control
        const textBlock: any = {
          type: 'text',
          text: body.file_content
        }

        // Add cache control for text content if enabled
        if (body.settings.create_cache) {
          textBlock.providerOptions = {
            anthropic: { cacheControl: { type: 'ephemeral' } }
          }
        }

        contentBlocks.push(textBlock)
      }
    }

    // Add prompt text
    const promptBlock: any = {
      type: 'text',
      text: body.new_prompt
    }

    contentBlocks.push(promptBlock)

    // Add current message
    if (contentBlocks.length === 1) {
      // Only text prompt, send as string
      messages.push({ role: 'user', content: body.new_prompt })
    } else {
      // Has file or other content blocks
      messages.push({ role: 'user', content: contentBlocks })
    }

    // Update status to processing
    await supabase
      .from('workbench_executions')
      .update({
        status: 'processing',
        model_used: modelToUse
      })
      .eq('id', executionId)

    // Define operation type schemas
    // These schemas enforce structured output formats for non-generic operations
    const validationSchema = z.object({
      result: z.boolean().describe('The validation result (true/false)'),
      comment: z.string().describe('Reasoning and explanation for the decision')
    })

    // Determine if this operation uses structured output
    const useStructuredOutput = body.operation_type === 'validation'
    const outputSchema = body.operation_type === 'validation' ? validationSchema : null

    // Execute LLM call using Vercel AI SDK
    // Tracks execution time for performance metrics
    const startTime = Date.now()

    try {
      // Conditional execution: generateObject for structured operations, generateText for generic
      let response: any
      let structuredOutput: any = null

      if (useStructuredOutput && outputSchema) {
        // Use generateObject for structured output operations
        response = await generateObject({
          model: anthropicProvider(modelToUse),
          schema: outputSchema,
          messages,
          maxTokens: body.settings.max_tokens || llmConfig.settings.default_max_tokens || 4096,
          temperature: body.settings.temperature,
          topP: body.settings.top_p,
          topK: body.settings.top_k,
          stopSequences: body.settings.stop_sequences,
          providerOptions: {
            anthropic: {
              ...(body.settings.thinking ? {
                thinking: {
                  type: body.settings.thinking.type,
                  budgetTokens: body.settings.thinking.budget_tokens
                }
              } : {}),
            }
          }
        })

        // Store structured output
        structuredOutput = response.object
      } else {
        // Use generateText for generic operations (default behavior)
        response = await generateText({
          model: anthropicProvider(modelToUse),
          messages,
          // system is now included in messages array with cache control
          maxTokens: body.settings.max_tokens || llmConfig.settings.default_max_tokens || 4096,
          temperature: body.settings.temperature,
          topP: body.settings.top_p,
          topK: body.settings.top_k,
          stopSequences: body.settings.stop_sequences,
          // Pass Anthropic-specific options through providerOptions
          providerOptions: {
            anthropic: {
              // Pass thinking mode if enabled - convert budget_tokens to budgetTokens
              ...(body.settings.thinking ? {
                thinking: {
                  type: body.settings.thinking.type,
                  budgetTokens: body.settings.thinking.budget_tokens  // Map budget_tokens to budgetTokens
                }
              } : {}),
              // Note: Cache control is already embedded in system and document blocks
              // Citations are also handled in document blocks directly
            }
          }
        })
      }

      const executionTime = Date.now() - startTime

      // Extract response content and special blocks
      // Vercel AI SDK provides the text directly in response.text
      // For structured outputs, also format the object as text
      let responseText = response.text || ''

      if (structuredOutput) {
        // For structured outputs, create human-readable text representation
        responseText = JSON.stringify(structuredOutput, null, 2)
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
          inputTokens: response.usage?.inputTokens || 0,
          outputTokens: response.usage?.outputTokens || 0,
          cachedReadTokens: response.usage?.cachedInputTokens || 0,
          cachedWriteTokens: response.providerMetadata?.anthropic?.cacheCreationInputTokens || 0,
          executionTimeMs: executionTime
        },
        tokensUsed: {
          input: response.usage?.inputTokens || 0,
          output: response.usage?.outputTokens || 0,
          cached_read: response.usage?.cachedInputTokens || 0,  // Cost savings from cache hits
          cached_write: response.providerMetadata?.anthropic?.cacheCreationInputTokens || 0,  // One-time cost to create cache
          total: (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0)
        },
        executionTime,
        timestamp: new Date().toISOString(),
        // Return exact content structure sent to Anthropic for cache consistency
        user_content_sent: messages[messages.length - 1].content,
        // System message is now first in messages array if it exists
        system_sent: messages[0]?.role === 'system' ? messages[0].content : undefined
      }

      // Update execution record with completion status
      // This triggers Supabase Realtime update to subscribed clients
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
        user_content_sent: messages[messages.length - 1].content,
        // System message is now first in messages array if it exists
        system_sent: messages[0]?.role === 'system' ? messages[0].content : undefined
      }

      // Mark as COMPLETED (not failed) so it shows in Output section
      await supabase
        .from('workbench_executions')
        .update({
          status: 'completed',
          response: errorMessage,
          execution_time_ms: executionTime
        })
        .eq('id', executionId)

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

    // Update execution record with error if we have an execution ID
    if (executionId) {
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
