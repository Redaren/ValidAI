/**
 * Shared LLM Executor Utility
 *
 * @module _shared/llm-executor
 * @description
 * Reusable LLM execution logic shared between workbench and production run Edge Functions.
 * Handles message construction, API calls, response parsing, and error handling.
 *
 * ## Features
 * - Vercel AI SDK integration with Anthropic provider
 * - Prompt caching with separate file message architecture
 * - Structured output generation for all operation types
 * - Extended thinking/reasoning mode support
 * - Comprehensive error handling and logging
 *
 * @version 1.0.0
 * @since 2025-10-14
 */

import { Buffer } from 'https://deno.land/std@0.168.0/node/buffer.ts'
import { createAnthropic } from 'npm:@ai-sdk/anthropic'
import { generateText, Output } from 'npm:ai'
import { z } from 'npm:zod'
import type {
  LLMExecutionParams,
  LLMExecutionResult,
  OperationType,
  ContentBlock
} from './types.ts'

/**
 * Get structured output configuration based on operation type
 *
 * @param operationType - Type of operation determining output structure
 * @returns Output configuration for Vercel AI SDK
 */
function getOutputConfig(operationType: OperationType): any {
  switch (operationType) {
    case 'generic':
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
      // Fallback
      return Output.object({
        schema: z.object({
          response: z.string()
        })
      })
  }
}

/**
 * Download document content from Supabase Storage
 *
 * @param supabase - Supabase client
 * @param storagePath - Path in storage bucket (e.g., "doc-uuid/file.pdf")
 * @returns Document content as Buffer
 * @throws Error if download fails
 */
async function downloadDocument(supabase: any, storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(storagePath)

  if (error) {
    throw new Error(`Failed to download document: ${error.message}`)
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Execute LLM operation with prompt caching support
 *
 * @param params - Execution parameters including operation, document, settings, and API key
 * @param supabase - Supabase client for document download
 * @returns Execution result with response, structured output, tokens, and metadata
 * @throws Error if execution fails
 *
 * @description
 * Core LLM execution logic:
 * 1. Download document from storage
 * 2. Build messages with separate file message architecture:
 *    - System message (no cache control)
 *    - File message (separate user message WITH cache control)
 *    - Prompt message (separate user message)
 * 3. Execute via Vercel AI SDK with all settings
 * 4. Extract response, structured output, thinking blocks
 * 5. Parse token usage and cache metrics
 * 6. Return comprehensive result
 */
export async function executeLLMOperation(
  params: LLMExecutionParams,
  supabase: any
): Promise<LLMExecutionResult> {
  const { operation, document, systemPrompt, settings, apiKey, enableCache } = params

  console.log('=== LLM Executor: Starting Execution ===')
  console.log(`Operation: ${operation.name} (${operation.operation_type})`)
  console.log(`Document: ${document.name} (${document.mime_type})`)
  console.log(`Model: ${settings.selected_model_id || 'default'}`)
  console.log(`Cache enabled: ${enableCache}`)

  // Initialize Anthropic provider
  const anthropicProvider = createAnthropic({ apiKey })
  const modelToUse = settings.selected_model_id || 'claude-3-5-sonnet-20241022'

  // Download document from storage
  console.log(`Downloading document from storage: ${document.storage_path}`)
  const documentBuffer = await downloadDocument(supabase, document.storage_path)
  console.log(`Document downloaded: ${documentBuffer.length} bytes`)

  // Build messages array with separate file message architecture
  const messages: any[] = []

  // Add system message (no cache control)
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    })
    console.log('System message added')
  }

  // Add file as SEPARATE user message (WITH cache control if enabled)
  // This ensures consistent cache prefix position across multiple executions
  const fileBlock: any = {
    type: 'file',
    data: documentBuffer,
    mediaType: document.mime_type
  }

  if (enableCache) {
    // Add cache control for cost optimization
    const estimatedTokens = Math.ceil(documentBuffer.length / 5)
    const minTokensRequired = modelToUse.includes('haiku') ? 2048 : 1024

    if (estimatedTokens < minTokensRequired) {
      console.warn(`Document may be too small for caching (estimated ${estimatedTokens} tokens, minimum ${minTokensRequired} required)`)
    }

    fileBlock.providerOptions = {
      anthropic: {
        cacheControl: { type: 'ephemeral' }
      }
    }
    console.log(`File added WITH cache control (~${estimatedTokens} tokens)`)
  } else {
    console.log('File added WITHOUT cache control')
  }

  // File gets its own user message
  messages.push({
    role: 'user',
    content: [fileBlock]
  })

  // Add prompt as SEPARATE user message
  messages.push({
    role: 'user',
    content: operation.prompt
  })
  console.log(`Prompt added: ${operation.prompt.substring(0, 100)}...`)

  // Get structured output configuration
  const outputConfig = getOutputConfig(operation.operation_type)

  // Execute LLM call
  const startTime = Date.now()

  // Check if model supports top_p parameter alongside temperature
  // Claude 4.5 models (Haiku 4.5, Sonnet 4.5) cannot accept both parameters
  const supportsTopP = settings.supports_top_p !== false  // Default to true for backward compatibility
  const isClause45Model = modelToUse.includes('claude-haiku-4-5') || modelToUse.includes('claude-sonnet-4-5')
  const shouldIncludeTopP = supportsTopP && !isClause45Model

  console.log(`Model parameter support - top_p: ${shouldIncludeTopP ? 'included' : 'excluded (using temperature only)'}`)

  const llmParams: any = {
    model: anthropicProvider(modelToUse),
    messages,
    experimental_output: outputConfig,
    maxTokens: settings.max_tokens || 4096,
    temperature: settings.temperature,
    ...(shouldIncludeTopP && settings.top_p !== undefined ? { topP: settings.top_p } : {}),
    topK: settings.top_k,
    stopSequences: settings.stop_sequences,
    providerOptions: {
      anthropic: {
        ...(settings.thinking?.enabled ? {
          thinking: {
            type: 'enabled',
            budgetTokens: settings.thinking.budget_tokens || 10000
          }
        } : {})
      }
    }
  }

  console.log('Calling LLM API...')
  const response = await generateText(llmParams)
  const executionTime = Date.now() - startTime
  console.log(`LLM call completed in ${executionTime}ms`)

  // Extract structured output
  const structuredOutput = response.experimental_output || null

  // Extract response text
  let responseText = response.text || ''
  if (structuredOutput) {
    if (operation.operation_type === 'generic' || operation.operation_type === 'analysis') {
      responseText = structuredOutput.response || responseText
    } else if (!responseText || responseText.trim() === '') {
      responseText = JSON.stringify(structuredOutput, null, 2)
    }
  }

  // Extract thinking blocks
  const thinkingBlocks: any[] = []
  if (response.reasoning) {
    thinkingBlocks.push({
      type: 'thinking',
      thinking: response.reasoning,
      text: response.reasoning
    })
  }

  // Extract token usage and cache metrics
  const anthropicMetadata = response.providerMetadata?.anthropic || {}
  const cacheWriteTokens = anthropicMetadata.usage?.cache_creation_input_tokens ||
                           anthropicMetadata.cacheCreationInputTokens || 0
  const cacheReadTokens = anthropicMetadata.usage?.cache_read_input_tokens ||
                          anthropicMetadata.cacheReadInputTokens || 0

  const tokens = {
    input: response.usage?.inputTokens || 0,
    output: response.usage?.outputTokens || 0,
    cached_read: cacheReadTokens,
    cached_write: cacheWriteTokens
  }

  const cacheHit = cacheReadTokens > 0

  // Log results
  console.log('=== Execution Results ===')
  console.log(`Tokens: ${tokens.input} input, ${tokens.output} output`)
  if (cacheWriteTokens > 0) {
    console.log(`✅ Cache created: ${cacheWriteTokens} tokens`)
  }
  if (cacheHit) {
    console.log(`✅ Cache hit: ${cacheReadTokens} tokens (90% savings)`)
  }
  if (structuredOutput) {
    console.log(`✅ Structured output: ${JSON.stringify(structuredOutput)}`)
  }
  if (thinkingBlocks.length > 0) {
    console.log(`✅ Thinking blocks: ${thinkingBlocks.length}`)
  }

  return {
    response: responseText,
    structured_output: structuredOutput,
    thinking_blocks: thinkingBlocks.length > 0 ? thinkingBlocks : null,
    model: modelToUse,
    tokens,
    executionTime,
    cacheHit
  }
}

/**
 * Execute LLM operation with retry logic for transient errors
 *
 * @param params - Execution parameters
 * @param supabase - Supabase client
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param backoffMs - Backoff delays in milliseconds (default: [1000, 5000, 15000])
 * @returns Execution result
 * @throws Error after max retries exceeded
 *
 * @description
 * Wraps executeLLMOperation with retry logic:
 * - Retries transient errors (rate limits, timeouts, network)
 * - Uses exponential backoff (1s, 5s, 15s)
 * - Fails immediately on permanent errors (auth, validation)
 * - Tracks retry count for debugging
 */
export async function executeLLMOperationWithRetry(
  params: LLMExecutionParams,
  supabase: any,
  maxRetries: number = 3,
  backoffMs: number[] = [1000, 5000, 15000]
): Promise<LLMExecutionResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperation(params, supabase)
    } catch (error: any) {
      const isTransient = (
        error.status === 429 ||  // Rate limit
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
      )

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        const delay = backoffMs[attempt] || backoffMs[backoffMs.length - 1]
        console.warn(`⚠️ Transient error (attempt ${attempt + 1}/${maxRetries}): ${error.message}`)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // Permanent error or final attempt failed
      console.error(`❌ LLM execution failed after ${attempt + 1} attempts: ${error.message}`)
      error.retryCount = attempt
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
