/**
 * Execute Workbench Test Edge Function
 *
 * Executes LLM test calls for the workbench interface using Anthropic's Claude API.
 * Supports prompt caching, extended thinking, citations, and multi-turn conversations.
 *
 * Based on official API documentation: https://docs.claude.com/en/api/messages
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0'

// CORS headers for client requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WorkbenchTestRequest {
  processor_id: string
  mode: 'stateful' | 'stateless'
  system_prompt?: string
  send_system_prompt: boolean
  send_file: boolean
  file_content?: string
  file_type?: 'text/plain' | 'application/pdf'
  conversation_history: Array<{
    role: 'user' | 'assistant'
    content: string
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

serve(async (req) => {
  // Handle CORS preflight
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

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey
    })

    // Build system message based on user toggles
    let system: any = undefined

    if (body.send_system_prompt && body.system_prompt) {
      if (body.settings.create_cache) {
        // User wants to create cache: Use array format with cache_control
        system = [
          {
            type: 'text',
            text: body.system_prompt,
            cache_control: { type: 'ephemeral' }  // 5-minute TTL
          }
        ]
      } else {
        // No cache creation: Simple string format
        system = body.system_prompt
      }
    }

    // Build messages array based on mode and user toggles
    const messages: any[] = []

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

    // Build request parameters
    const requestParams: any = {
      model: modelToUse,
      max_tokens: body.settings.max_tokens || llmConfig.settings.default_max_tokens || 4096,
      messages
    }

    // Add optional parameters
    if (system) requestParams.system = system
    if (body.settings.temperature !== undefined) requestParams.temperature = body.settings.temperature
    if (body.settings.top_p !== undefined) requestParams.top_p = body.settings.top_p
    if (body.settings.top_k !== undefined) requestParams.top_k = body.settings.top_k
    if (body.settings.stop_sequences) requestParams.stop_sequences = body.settings.stop_sequences
    if (body.settings.thinking) requestParams.thinking = body.settings.thinking

    // Update status to processing
    await supabase
      .from('workbench_executions')
      .update({
        status: 'processing',
        model_used: modelToUse
      })
      .eq('id', executionId)

    // Execute Anthropic Messages API call
    // Tracks execution time for performance metrics
    const startTime = Date.now()

    try {
      const response = await anthropic.messages.create(requestParams)
      const executionTime = Date.now() - startTime

      // Extract response content and special blocks
      // Anthropic API returns content as array of blocks with different types:
      // - "text": Normal response text
      // - "thinking": Extended thinking blocks (if thinking mode enabled)
      // - "citation": Citation references (if citations enabled)
      let responseText = ''
      const thinkingBlocks: any[] = []
      const citations: any[] = []

      response.content.forEach((block: any) => {
        if (block.type === 'text') {
          responseText += block.text
        } else if (block.type === 'thinking') {
          thinkingBlocks.push(block)
        } else if (block.type === 'citation') {
          citations.push(block)
        }
      })

      // Build result payload for client with metadata
      // Includes execution_id for real-time subscription tracking
      const result = {
        execution_id: executionId,  // Client subscribes to this ID for status updates
        response: responseText,
        thinking_blocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
        citations: citations.length > 0 ? citations : undefined,
        metadata: {
          mode: body.mode,
          cacheCreated: body.settings.create_cache || false,
          systemPromptSent: body.send_system_prompt && !!body.system_prompt,
          fileSent: body.send_file && !!body.file_content,
          thinkingEnabled: !!body.settings.thinking,
          citationsEnabled: body.settings.citations_enabled || false,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedReadTokens: response.usage.cache_read_input_tokens,
          cachedWriteTokens: response.usage.cache_creation_input_tokens,
          executionTimeMs: executionTime
        },
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cached_read: response.usage.cache_read_input_tokens,  // Cost savings from cache hits
          cached_write: response.usage.cache_creation_input_tokens,  // One-time cost to create cache
          total: response.usage.input_tokens + response.usage.output_tokens
        },
        executionTime,
        timestamp: new Date().toISOString(),
        // Return exact content structure sent to Anthropic for cache consistency
        user_content_sent: messages[messages.length - 1].content,
        system_sent: system
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
      // Anthropic API rejected the request (e.g., unsupported feature, invalid parameters)
      // Return this as a successful response so it displays in the Output section
      const executionTime = Date.now() - startTime

      // Extract detailed error message from Anthropic SDK
      let errorMessage = 'API Error: '
      if (apiError.error && apiError.error.message) {
        errorMessage += apiError.error.message
      } else if (apiError.message) {
        errorMessage += apiError.message
      } else {
        errorMessage += apiError.toString()
      }

      console.log('Anthropic API error (returning as assistant message):', errorMessage)

      const result = {
        execution_id: executionId,
        response: errorMessage,  // Display error as assistant response
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
        system_sent: system
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
