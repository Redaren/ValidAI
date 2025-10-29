/**
 * Mistral LLM Executor Utility
 *
 * @module _shared/llm-executor-mistral
 * @description
 * Mistral-specific LLM execution logic for ValidAI processor runs and workbench testing.
 * Uses native Mistral SDK for document processing and structured output generation.
 *
 * ## Features
 * - Native Mistral SDK integration
 * - Document upload to Mistral Files API with signed URL reuse
 * - Structured output generation via JSON mode with manual validation
 * - Comprehensive error handling and retry logic
 *
 * ## Key Differences from Anthropic
 * - Requires separate document upload step (2-3s overhead)
 * - No prompt caching support (higher API costs)
 * - No extended thinking/reasoning mode
 * - Manual JSON parsing and Zod validation
 * - System prompt prepended to user message
 *
 * @version 1.0.0
 * @since 2025-10-29
 */

import { Buffer } from 'https://deno.land/std@0.168.0/node/buffer.ts'
import { Mistral } from 'npm:@mistralai/mistralai'
import { z } from 'npm:zod'
import type {
  LLMExecutionParams,
  LLMExecutionResult,
  OperationType
} from './types.ts'
import { downloadDocument } from './llm-executor.ts'

/**
 * Upload document to Mistral Files API and get signed URL
 *
 * @param mistralClient - Initialized Mistral client
 * @param documentBuffer - Document content as Buffer
 * @param documentName - Original document filename
 * @returns Signed URL valid for 24 hours
 * @throws Error if upload or signing fails
 *
 * @description
 * Uploads document to Mistral's file storage and retrieves a signed URL that can be
 * reused across multiple LLM calls. The signed URL remains valid for 24 hours, which
 * is sufficient for any processor run duration.
 */
export async function uploadDocumentToMistral(
  mistralClient: Mistral,
  documentBuffer: Buffer,
  documentName: string
): Promise<string> {
  console.log(`[Mistral] Uploading document: ${documentName} (${documentBuffer.length} bytes)`)

  // Step 1: Upload file to Mistral
  const uploadedFile = await mistralClient.files.upload({
    file: {
      fileName: documentName,
      content: documentBuffer
    },
    purpose: 'ocr'  // For document QnA/OCR per Mistral documentation
  })

  console.log(`[Mistral] File uploaded successfully: ${uploadedFile.id}`)

  // Step 2: Get signed URL (valid for 24 hours)
  const signedUrlResponse = await mistralClient.files.getSignedUrl({
    fileId: uploadedFile.id
  })

  const signedUrl = signedUrlResponse.url

  console.log(`[Mistral] Signed URL obtained: ${signedUrl.substring(0, 50)}...`)
  console.log(`[Mistral] URL valid for 24 hours, reusable across all operations`)

  return signedUrl
}

/**
 * Convert operation type to JSON schema prompt string
 *
 * @param operationType - Type of operation determining output structure
 * @returns JSON schema as formatted string for prompt embedding
 *
 * @description
 * Mistral doesn't support Zod schema → automatic parsing like Anthropic.
 * Instead, we embed the expected JSON structure in the prompt and use
 * JSON mode to enforce valid JSON output.
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
 * Returns the Zod schema used to validate Mistral's JSON response.
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
 * Execute LLM operation with Mistral
 *
 * @param params - Execution parameters including operation, document, settings, and API key
 * @param supabase - Supabase client for document download
 * @param signedDocumentUrl - Optional pre-uploaded document URL (reuse optimization)
 * @returns Execution result with response, structured output, tokens, and metadata
 * @throws Error if execution fails
 *
 * @description
 * Core Mistral LLM execution logic:
 * 1. Upload document (or reuse signedDocumentUrl if provided)
 * 2. Build prompt with embedded JSON schema
 * 3. Prepend system prompt to user message (Mistral best practice)
 * 4. Execute via native Mistral SDK with JSON mode
 * 5. Parse and validate structured output
 * 6. Return result with token usage (no cache metrics)
 *
 * **Performance Optimization:**
 * Pass signedDocumentUrl to skip redundant uploads when processing multiple operations
 * on the same document. The signed URL is valid for 24 hours and can be safely reused.
 */
export async function executeLLMOperationMistral(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string
): Promise<LLMExecutionResult> {
  const { operation, document, systemPrompt, settings, apiKey } = params

  console.log('=== Mistral LLM Executor: Starting Execution ===')
  console.log(`Operation: ${operation.name} (${operation.operation_type})`)
  console.log(`Document: ${document.name} (${document.mime_type})`)
  console.log(`Model: ${settings.selected_model_id || 'mistral-small-latest'}`)
  console.log(`Signed URL provided: ${signedDocumentUrl ? 'YES (reusing)' : 'NO (will upload)'}`)

  // Initialize Mistral client
  const mistralClient = new Mistral({ apiKey })
  const modelToUse = settings.selected_model_id || 'mistral-small-latest'

  // Upload document if not already uploaded
  let documentUrl = signedDocumentUrl
  if (!documentUrl) {
    console.log(`Downloading document from storage: ${document.storage_path}`)
    const documentBuffer = await downloadDocument(supabase, document.storage_path)
    console.log(`Document downloaded: ${documentBuffer.length} bytes`)

    documentUrl = await uploadDocumentToMistral(mistralClient, documentBuffer, document.name)
  } else {
    console.log(`Reusing existing signed URL`)
  }

  // Build prompt with embedded JSON schema (for structured output)
  let fullPrompt: string
  if (operation.operation_type === 'generic') {
    // Generic operations don't need structured output schema
    fullPrompt = operation.prompt
  } else {
    // Add JSON schema to prompt for structured output enforcement
    const jsonSchemaPrompt = zodToJsonSchemaPrompt(operation.operation_type)
    fullPrompt = `${operation.prompt}

IMPORTANT: Return ONLY a valid JSON object with this exact structure:
${jsonSchemaPrompt}

Do not include any text outside the JSON object. The response must be parseable JSON.`
  }

  // Prepend system prompt to user message (Mistral best practice)
  // Mistral doesn't have a separate system role, so we include it in the user message
  const userMessageText = systemPrompt
    ? `${systemPrompt}\n\n${fullPrompt}`
    : fullPrompt

  console.log(`Prompt prepared: ${userMessageText.substring(0, 100)}...`)

  // Execute LLM call
  const startTime = Date.now()
  console.log('Calling Mistral API...')

  const response = await mistralClient.chat.complete({
    model: modelToUse,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: userMessageText },
        { type: 'document_url', documentUrl }
      ]
    }],
    // Force JSON output for structured operation types
    responseFormat: operation.operation_type !== 'generic'
      ? { type: 'json_object' }
      : undefined,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    topP: settings.top_p
  })

  const executionTime = Date.now() - startTime
  console.log(`Mistral call completed in ${executionTime}ms`)

  // Extract raw response content
  const rawContent = response.choices[0].message.content || ''

  // Parse structured output
  let structuredOutput: any = null
  let responseText = rawContent

  if (operation.operation_type !== 'generic') {
    try {
      // Parse JSON
      const parsed = JSON.parse(rawContent)

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

      // Store raw JSON with error indicator
      try {
        structuredOutput = JSON.parse(rawContent)
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
      const parsed = JSON.parse(rawContent)
      if (parsed.response) {
        responseText = parsed.response
        structuredOutput = parsed
      }
    } catch {
      // Not JSON, use raw content as-is
      responseText = rawContent
    }
  }

  // Extract token usage (Mistral doesn't support caching)
  const tokens = {
    input: response.usage?.promptTokens || 0,
    output: response.usage?.completionTokens || 0,
    cached_read: 0,  // Mistral doesn't support prompt caching
    cached_write: 0
  }

  // Log results
  console.log('=== Mistral Execution Results ===')
  console.log(`Tokens: ${tokens.input} input, ${tokens.output} output`)
  console.log(`Note: Mistral does not support prompt caching`)
  if (structuredOutput) {
    console.log(`✅ Structured output: ${JSON.stringify(structuredOutput).substring(0, 100)}...`)
  }

  return {
    response: responseText,
    structured_output: structuredOutput,
    thinking_blocks: null,  // Mistral doesn't support extended thinking
    model: modelToUse,
    tokens,
    executionTime,
    cacheHit: false,  // Mistral doesn't support caching
    documentUrl  // Return signed URL for reuse in subsequent operations
  }
}

/**
 * Execute LLM operation with retry logic for transient errors
 *
 * @param params - Execution parameters
 * @param supabase - Supabase client
 * @param signedDocumentUrl - Optional pre-uploaded document URL (reuse optimization)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param backoffMs - Backoff delays in milliseconds (default: [1000, 5000, 15000])
 * @returns Execution result
 * @throws Error after max retries exceeded
 *
 * @description
 * Wraps executeLLMOperationMistral with retry logic:
 * - Retries transient errors (rate limits, timeouts, network)
 * - Uses exponential backoff (1s, 5s, 15s)
 * - Fails immediately on permanent errors (auth, validation)
 * - Tracks retry count for debugging
 */
export async function executeLLMOperationMistralWithRetry(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string,
  maxRetries: number = 3,
  backoffMs: number[] = [1000, 5000, 15000]
): Promise<LLMExecutionResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeLLMOperationMistral(params, supabase, signedDocumentUrl)
    } catch (error: any) {
      const isTransient = (
        error.status === 429 ||  // Rate limit
        error.status === 503 ||  // Service unavailable
        error.name === 'TimeoutError' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
      )

      const isLastAttempt = attempt === maxRetries - 1

      if (isTransient && !isLastAttempt) {
        const delay = backoffMs[attempt] || backoffMs[backoffMs.length - 1]
        console.warn(`⚠️ Mistral transient error (attempt ${attempt + 1}/${maxRetries}): ${error.message}`)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // Permanent error or final attempt failed
      console.error(`❌ Mistral execution failed after ${attempt + 1} attempts: ${error.message}`)
      error.retryCount = attempt
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
