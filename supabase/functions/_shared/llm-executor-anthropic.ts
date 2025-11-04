/**
 * Anthropic LLM Executor Utility (Native SDK with Files API)
 *
 * @module _shared/llm-executor-anthropic
 * @description
 * Anthropic-specific LLM execution logic using native SDK with Files API support.
 * Mirrors Mistral executor pattern for architectural consistency.
 *
 * ## Features
 * - Native Anthropic SDK integration
 * - Document upload to Anthropic Files API with file_id reuse
 * - Structured output generation via manual JSON parsing with Zod validation
 * - Prompt caching support via native message-level cache_control
 * - Extended thinking support via native thinking parameter
 * - Comprehensive error handling and retry logic
 *
 * ## Key Differences from Legacy (Vercel AI SDK)
 * - Uses Files API for document upload (vs inline file passing)
 * - Native SDK control over all parameters
 * - Manual structured output parsing (vs automatic)
 * - Explicit cache_control in messages (vs providerOptions)
 *
 * @version 1.0.0
 * @since 2025-01-30
 */

import { Buffer } from 'node:buffer'
import Anthropic, { toFile } from 'npm:@anthropic-ai/sdk'
import { z } from 'npm:zod'
import type {
  LLMExecutionParams,
  LLMExecutionResult,
  OperationType
} from './types.ts'

/**
 * Normalize MIME type for Anthropic Files API
 *
 * @param originalMimeType - Original MIME type from document
 * @returns Normalized MIME type compatible with Anthropic Files API
 *
 * @description
 * Anthropic Files API only supports:
 * - application/pdf (PDF files)
 * - text/plain (plain text files)
 *
 * All text-based formats (markdown, CSV, HTML, JSON, etc.) should be mapped to text/plain.
 * This follows Anthropic's recommendation to treat text-based formats as plaintext.
 */
function normalizeAnthropicMimeType(originalMimeType: string): string {
  // Already supported types - pass through
  if (originalMimeType === 'application/pdf' || originalMimeType === 'text/plain') {
    return originalMimeType
  }

  // Map all text/* MIME types to text/plain
  // Examples: text/markdown, text/csv, text/html, text/xml
  if (originalMimeType.startsWith('text/')) {
    return 'text/plain'
  }

  // Map specific text-based application formats to text/plain
  const textBasedFormats = [
    'application/json',     // JSON files
    'application/xml',      // XML files
    'application/x-yaml',   // YAML files
  ]

  if (textBasedFormats.includes(originalMimeType)) {
    return 'text/plain'
  }

  // Unknown/unsupported type - pass through and let Anthropic return proper error
  return originalMimeType
}

/**
 * Upload document to Anthropic Files API and get file_id
 *
 * @param anthropicClient - Initialized Anthropic client
 * @param documentBuffer - Document content as Buffer
 * @param documentName - Original document filename
 * @param mimeType - Original MIME type (will be normalized for Anthropic)
 * @returns file_id valid indefinitely (until explicitly deleted)
 * @throws Error if upload fails
 *
 * @description
 * Uploads document to Anthropic's file storage and retrieves a file_id that can be
 * reused across multiple LLM calls. Files persist indefinitely and are scoped to the
 * workspace (accessible across all API keys in the organization).
 *
 * Upload is FREE (doesn't count as tokens), but usage in messages counts as input tokens.
 *
 * MIME types are automatically normalized:
 * - text/markdown, text/csv, text/html → text/plain
 * - application/json, application/xml → text/plain
 * - application/pdf → application/pdf (unchanged)
 */
export async function uploadDocumentToAnthropic(
  anthropicClient: Anthropic,
  documentBuffer: Buffer,
  documentName: string,
  mimeType: string = 'application/pdf'
): Promise<string> {
  // Normalize MIME type for Anthropic compatibility
  const normalizedMimeType = normalizeAnthropicMimeType(mimeType)

  if (normalizedMimeType !== mimeType) {
    console.log(`[Anthropic] MIME type normalized: ${mimeType} → ${normalizedMimeType}`)
  }

  console.log(`[Anthropic] Uploading document: ${documentName} (${documentBuffer.length} bytes, type: ${normalizedMimeType})`)

  // Upload file to Anthropic Files API using beta endpoint
  // Requires toFile() helper and betas parameter
  const uploadedFile = await anthropicClient.beta.files.upload({
    file: await toFile(documentBuffer, documentName, { type: normalizedMimeType }),
    betas: ['files-api-2025-04-14']  // Required beta version
  })

  console.log(`[Anthropic] File uploaded successfully: ${uploadedFile.id}`)
  console.log(`[Anthropic] File ID will be stored in snapshot and reused across all operations`)

  return uploadedFile.id
}

/**
 * Convert operation type to JSON schema prompt string
 *
 * @param operationType - Type of operation determining output structure
 * @returns JSON schema as formatted string for prompt embedding
 *
 * @description
 * Since we're doing manual parsing (not using Vercel AI SDK's automatic parsing),
 * we embed the expected JSON structure in the prompt and validate with Zod.
 * This matches the Mistral executor pattern.
 */
function zodToJsonSchemaPrompt(operationType: OperationType): string {
  switch (operationType) {
    case 'generic':
      return `{
  "response": "string - your complete response text"
}`

    case 'validation':
      return `{
  "result": true | false,
  "comment": "string - reasoning and explanation for the decision"
}`

    case 'rating':
      return `{
  "value": number,
  "comment": "string - rationale and explanation for rating"
}`

    case 'classification':
      return `{
  "classification": "string - assigned category or classification",
  "comment": "string - reasoning for classification decision"
}`

    case 'extraction':
      return `{
  "items": ["string", "string", ...],
  "comment": "string - context and explanation of extraction"
}`

    case 'analysis':
      return `{
  "conclusion": "string - main analytical conclusion",
  "comment": "string - supporting analysis and detailed explanation"
}`

    case 'traffic_light':
      return `{
  "traffic_light": "red" | "yellow" | "green",
  "comment": "string - explanation for the traffic light status"
}`

    default:
      // Fallback to generic
      return `{
  "response": "string - your response"
}`
  }
}

/**
 * Get Zod schema for operation type validation
 *
 * @param operationType - Type of operation
 * @returns Zod schema for validating LLM output
 *
 * @description
 * Returns the Zod schema used to validate Anthropic's JSON response.
 * If validation fails, we log a warning but continue with raw JSON.
 */
function getOperationTypeSchema(operationType: OperationType): z.ZodSchema {
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

    case 'rating':
      return z.object({
        value: z.number().describe('Numerical rating value'),
        comment: z.string().describe('Rationale and explanation for rating')
      })

    case 'classification':
      return z.object({
        classification: z.string().describe('Assigned category or classification'),
        comment: z.string().describe('Reasoning for classification decision')
      })

    case 'extraction':
      return z.object({
        items: z.array(z.string()).describe('Array of extracted items'),
        comment: z.string().describe('Context and explanation of extraction')
      })

    case 'analysis':
      return z.object({
        conclusion: z.string().describe('Main analytical conclusion'),
        comment: z.string().describe('Supporting analysis and detailed explanation')
      })

    case 'traffic_light':
      return z.object({
        traffic_light: z.enum(['red', 'yellow', 'green']).describe('Traffic light status indicator'),
        comment: z.string().describe('Explanation for the traffic light status')
      })

    default:
      // Fallback
      return z.object({
        response: z.string()
      })
  }
}

/**
 * Execute LLM operation with Anthropic using Files API
 *
 * @param params - Execution parameters including operation, document, settings, and API key
 * @param supabase - Supabase client (unused for Anthropic, kept for signature consistency)
 * @param fileId - File ID from Anthropic Files API (reuse optimization)
 * @returns Execution result with response, structured output, tokens, and metadata
 * @throws Error if execution fails
 *
 * @description
 * Core Anthropic LLM execution logic with Files API:
 * 1. Use file_id to reference document (no upload needed)
 * 2. Build messages with system prompt and cache control
 * 3. Reference file via document content block
 * 4. Execute via native Anthropic SDK
 * 5. Parse and validate structured output
 * 6. Return result with token usage and cache metrics
 *
 * **Performance Optimization:**
 * Pass fileId to skip redundant uploads when processing multiple operations
 * on the same document. The file_id persists indefinitely and can be safely reused.
 */
export async function executeLLMOperationAnthropic(
  params: LLMExecutionParams,
  supabase: any,
  fileId: string
): Promise<LLMExecutionResult> {
  const { operation, document, systemPrompt, settings, apiKey, enableCache } = params

  console.log('=== Anthropic LLM Executor (Files API): Starting Execution ===')
  console.log(`Operation: ${operation.name} (${operation.operation_type})`)
  console.log(`Document: ${document.name} (${document.mime_type})`)
  console.log(`Model: ${settings.selected_model_id || 'claude-3-5-sonnet-20241022'}`)
  console.log(`File ID: ${fileId}`)
  console.log(`Cache enabled: ${enableCache}`)

  // Initialize Anthropic client
  const anthropicClient = new Anthropic({
    apiKey,
  })
  const modelToUse = settings.selected_model_id || 'claude-3-5-sonnet-20241022'

  // Build prompt with embedded JSON schema (for structured output)
  let userPrompt: string
  if (operation.operation_type === 'generic') {
    // Generic operations don't need structured output schema
    userPrompt = operation.prompt
  } else {
    // Add JSON schema to prompt for structured output enforcement
    const jsonSchemaPrompt = zodToJsonSchemaPrompt(operation.operation_type)
    userPrompt = `${operation.prompt}

IMPORTANT: Return ONLY a valid JSON object with this exact structure:
${jsonSchemaPrompt}

Do not include any text outside the JSON object. Do not use markdown code blocks or backticks. Return raw JSON only. The response must be parseable JSON.`
  }

  console.log(`Prompt prepared: ${userPrompt.substring(0, 100)}...`)

  // Build system message - only system prompt text
  // IMPORTANT: System array only accepts type: 'text' blocks (no document references)
  const systemMessages: any[] = []

  if (systemPrompt) {
    systemMessages.push({
      type: 'text',
      text: systemPrompt
      // NO cache_control here - it goes in user message content array
    })
  }

  // Build user message content array with single cache breakpoint
  // CRITICAL: Each operation is an independent API call (no chat history)
  // Pattern for ALL operations:
  //   Part 1: Fixed intro text (100% identical)
  //   Part 2: Document with cache_control (100% identical) - SINGLE cache breakpoint
  //   Part 3: Operation prompt (varies per operation, comes AFTER cache breakpoint)
  const userContent: any[] = []

  // Part 1: Fixed intro text (identical for all operations)
  userContent.push({
    type: 'text',
    text: 'Here is a document. Analyze it according to the instructions that follow.'
  })

  // Part 2: Document reference with cache breakpoint (identical for all operations)
  const documentBlock: any = {
    type: 'document',
    source: {
      type: 'file',
      file_id: fileId
    }
  }

  // Add cache control to document - this is the ONLY cache breakpoint
  // Caches: system prompt + intro text + document (everything before this marker)
  if (enableCache) {
    documentBlock.cache_control = { type: 'ephemeral' }
    console.log('Cache breakpoint set on document - caches system prompt + intro + document')
  }

  userContent.push(documentBlock)

  // Part 3: Operation-specific prompt (VARIES per operation - comes AFTER cache breakpoint)
  userContent.push({
    type: 'text',
    text: userPrompt
  })

  // Execute LLM call
  const startTime = Date.now()
  console.log('Calling Anthropic API with Files API...')

  // Determine beta headers needed
  const betaHeaders = ['files-api-2025-04-14']
  if (enableCache) {
    betaHeaders.push('prompt-caching-2024-07-31')
  }

  // Check if extended thinking is enabled
  const thinkingEnabled = settings.thinking?.enabled || false
  const thinkingBudget = settings.thinking?.budget_tokens || 10000

  const requestParams: any = {
    model: modelToUse,
    max_tokens: settings.max_tokens || 4096,
    temperature: settings.temperature,
    system: systemMessages.length > 0 ? systemMessages : undefined,
    messages: [
      {
        role: 'user',
        content: userContent
      }
    ]
  }

  // Add optional parameters
  if (settings.top_p !== undefined && settings.supports_top_p !== false) {
    requestParams.top_p = settings.top_p
  }
  if (settings.top_k !== undefined) {
    requestParams.top_k = settings.top_k
  }
  if (settings.stop_sequences && settings.stop_sequences.length > 0) {
    requestParams.stop_sequences = settings.stop_sequences
  }

  // Add extended thinking if enabled
  if (thinkingEnabled) {
    requestParams.thinking = {
      type: 'enabled',
      budget_tokens: thinkingBudget
    }
    console.log(`Extended thinking enabled with budget: ${thinkingBudget} tokens`)
  }

  const response = await anthropicClient.messages.create(requestParams, {
    headers: {
      'anthropic-beta': betaHeaders.join(',')
    }
  })

  const executionTime = Date.now() - startTime
  console.log(`Anthropic call completed in ${executionTime}ms`)

  // Extract raw response content
  let rawContent = ''
  const thinkingBlocks: any[] = []

  for (const block of response.content) {
    if (block.type === 'text') {
      rawContent += block.text
    } else if (block.type === 'thinking') {
      thinkingBlocks.push({
        type: 'thinking',
        thinking: block.thinking,
        text: block.thinking
      })
      console.log(`Thinking block captured: ${block.thinking?.substring(0, 100)}...`)
    }
  }

  // Parse structured output
  let structuredOutput: any = null
  let responseText = rawContent

  if (operation.operation_type !== 'generic') {
    try {
      // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
      let cleanedContent = rawContent.trim()
      if (cleanedContent.startsWith('```')) {
        // Remove opening ``` or ```json
        cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/, '')
        // Remove closing ```
        cleanedContent = cleanedContent.replace(/\n?```\s*$/, '')
        cleanedContent = cleanedContent.trim()
        console.log('Stripped markdown code blocks from response')
      }

      // Parse JSON
      const parsed = JSON.parse(cleanedContent)

      // Validate against operation type schema
      const schema = getOperationTypeSchema(operation.operation_type)
      structuredOutput = schema.parse(parsed)

      // Format response text
      responseText = JSON.stringify(structuredOutput, null, 2)

      console.log(`✅ Structured output validated successfully`)
    } catch (error: any) {
      console.warn(`⚠️ Structured output validation failed for ${operation.name}:`)
      console.warn(`Error: ${error.message}`)
      console.warn(`Raw content: ${rawContent.substring(0, 200)}...`)

      // Try stripping markdown and parsing again
      try {
        let cleanedContent = rawContent.trim()
        if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/, '')
          cleanedContent = cleanedContent.replace(/\n?```\s*$/, '')
          cleanedContent = cleanedContent.trim()
        }
        structuredOutput = JSON.parse(cleanedContent)
      } catch {
        structuredOutput = {
          raw: rawContent,
          validation_error: error.message
        }
      }

      responseText = rawContent
    }
  } else {
    // Generic operation - extract response field if JSON was returned
    try {
      // Strip markdown code blocks if present
      let cleanedContent = rawContent.trim()
      if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/, '')
        cleanedContent = cleanedContent.replace(/\n?```\s*$/, '')
        cleanedContent = cleanedContent.trim()
      }

      const parsed = JSON.parse(cleanedContent)
      if (parsed.response) {
        responseText = parsed.response
        structuredOutput = parsed
      }
    } catch {
      // Not JSON, use raw content as-is
      responseText = rawContent
    }
  }

  // Extract token usage from response
  const usage = response.usage
  const tokens = {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cached_read: (usage as any).cache_read_input_tokens || 0,
    cached_write: (usage as any).cache_creation_input_tokens || 0
  }

  const cacheHit = tokens.cached_read > 0

  // Log results
  console.log('=== Anthropic Execution Results ===')
  console.log(`Tokens: ${tokens.input} input, ${tokens.output} output`)
  if (tokens.cached_write > 0) {
    console.log(`✅ Cache created: ${tokens.cached_write} tokens`)
  }
  if (cacheHit) {
    console.log(`✅ Cache hit: ${tokens.cached_read} tokens (90% savings)`)
  }
  if (structuredOutput) {
    console.log(`✅ Structured output: ${JSON.stringify(structuredOutput).substring(0, 100)}...`)
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
    cacheHit,
    fileId  // Return file_id for potential cleanup tracking
  }
}

/**
 * Execute LLM operation with retry logic for transient errors
 *
 * @param params - Execution parameters
 * @param supabase - Supabase client
 * @param fileId - File ID from Anthropic Files API (reuse optimization)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param backoffMs - Backoff delays in milliseconds (default: [1000, 5000, 15000])
 * @returns Execution result
 * @throws Error after max retries exceeded
 *
 * @description
 * Wraps executeLLMOperationAnthropic with retry logic:
 * - Retries transient errors (rate limits, timeouts, network)
 * - Uses exponential backoff (1s, 5s, 15s)
 * - Fails immediately on permanent errors (auth, validation)
 * - Tracks retry count for debugging
 */
export async function executeLLMOperationAnthropicWithRetry(
  params: LLMExecutionParams,
  supabase: any,
  fileId: string,
  maxRetries: number = 3,
  backoffMs: number[] = [1000, 5000, 15000]
): Promise<LLMExecutionResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperationAnthropic(params, supabase, fileId)
    } catch (error: any) {
      const isTransient = (
        error.status === 429 ||  // Rate limit
        error.status === 503 ||  // Service unavailable
        error.status === 529 ||  // Overloaded
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
      )

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        const delay = backoffMs[attempt] || backoffMs[backoffMs.length - 1]
        console.warn(`⚠️ Anthropic transient error (attempt ${attempt + 1}/${maxRetries}): ${error.message}`)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // Permanent error or final attempt failed
      console.error(`❌ Anthropic execution failed after ${attempt + 1} attempts: ${error.message}`)
      error.retryCount = attempt
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
