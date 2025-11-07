/**
 * Google Gemini LLM Executor Utility (Native SDK with Caching)
 *
 * @module _shared/llm-executor-gemini
 * @description
 * Gemini-specific LLM execution logic using native Google Generative AI SDK
 * with explicit caching support. Follows the same architectural pattern as
 * Anthropic and Mistral executors.
 *
 * ## Features
 * - Native Google Generative AI SDK integration
 * - Document upload to Gemini File API (48-hour storage)
 * - Explicit cache creation for multi-operation efficiency (5-minute TTL)
 * - Native JSON Schema structured output (best-in-class reliability)
 * - Configurable thinking mode with budget control
 * - Comprehensive error handling and retry logic
 *
 * ## Key Differences from Anthropic/Mistral
 * - Explicit CachedContent API (vs inline cache_control)
 * - Native JSON Schema support (vs manual parsing)
 * - Thinking budget configuration (-1 dynamic, 0 disabled, fixed values)
 * - 1M token context window
 * - File API returns URI (vs file_id or signed URL)
 *
 * @version 1.0.0
 * @since 2025-11-07
 */

import { Buffer } from 'node:buffer'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0'
import { GoogleAICacheManager } from 'npm:@google/generative-ai@0.21.0/server'
import { zodToJsonSchema } from 'npm:zod-to-json-schema@3.23.0'
import { z } from 'npm:zod'
import type {
  LLMExecutionParams,
  LLMExecutionResult,
  OperationType
} from './types.ts'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Gemini cache reference for document reuse across operations
 */
export interface GeminiCacheRef {
  fileUri: string        // File API URI (48-hour validity)
  cacheName: string      // CachedContent name (5-minute TTL)
  mimeType: string       // MIME type for file reference
}

/**
 * Extended execution params with Gemini-specific settings
 */
export interface GeminiExecutionParams extends LLMExecutionParams {
  settings: LLMExecutionParams['settings'] & {
    thinking_budget?: number      // -1 (dynamic), 0 (disabled), or 512-32768 (fixed)
    include_thoughts?: boolean    // Include thought summaries in response
  }
}

// ============================================================================
// OPERATION TYPE SCHEMAS (Zod)
// ============================================================================

/**
 * Get Zod schema for operation type
 *
 * @param operationType - Type of operation
 * @returns Zod schema for validating LLM output
 *
 * @description
 * Returns the Zod schema used to validate Gemini's JSON response.
 * These schemas are converted to JSON Schema format using zod-to-json-schema
 * and passed to Gemini's native structured output API.
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
      // Fallback to generic
      return z.object({
        response: z.string()
      })
  }
}

// ============================================================================
// FILE UPLOAD
// ============================================================================

/**
 * Upload document to Gemini File API
 *
 * @param genAI - Initialized Google Generative AI client
 * @param documentBuffer - Document content as Buffer
 * @param fileName - Original document filename
 * @param mimeType - Document MIME type
 * @returns File URI and MIME type for referencing in requests
 * @throws Error if upload fails
 *
 * @description
 * Uploads document to Gemini's file storage and retrieves a URI that can be
 * reused for 48 hours. This is similar to Mistral's signed URL but with longer
 * validity. Upload is optimized to happen once per run.
 *
 * Supported formats:
 * - PDFs up to 1,000 pages (50MB max)
 * - Text files (TXT, Markdown, CSV, etc.)
 * - Each page ≈ 258 tokens
 */
export async function uploadDocumentToGemini(
  apiKey: string,
  documentBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string = 'application/pdf'
): Promise<{ fileUri: string; mimeType: string }> {
  const BASE_URL = 'https://generativelanguage.googleapis.com'
  const fileSize = documentBuffer.byteLength

  try {
    console.log(`[Gemini] Uploading document: ${fileName} (${fileSize} bytes, type: ${mimeType})`)

    // Step 1: Initiate resumable upload (Google's official protocol)
    console.log('[Gemini] Step 1: Initiating resumable upload...')
    const initResponse = await fetch(`${BASE_URL}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'x-goog-api-key': apiKey
      }
    })

    if (!initResponse.ok) {
      const errorText = await initResponse.text()
      throw new Error(`Resumable upload init failed (${initResponse.status}): ${errorText}`)
    }

    const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL')
    if (!uploadUrl) {
      throw new Error('No upload URL returned from Gemini API')
    }

    console.log('[Gemini] Step 2: Uploading file bytes...')

    // Step 2: Upload file bytes to the returned URL
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': fileSize.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: documentBuffer
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      throw new Error(`File upload failed (${uploadResponse.status}): ${errorText}`)
    }

    const result = await uploadResponse.json()

    console.log(`[Gemini] File uploaded successfully: ${result.file.uri}`)
    console.log(`[Gemini] File URI valid for 48 hours`)

    return {
      fileUri: result.file.uri,
      mimeType: result.file.mimeType || mimeType
    }
  } catch (error: any) {
    console.error('[Gemini] File upload failed:', error.message)
    throw new Error(`Gemini file upload failed: ${error.message}`)
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Create explicit Gemini cache for multi-operation efficiency
 *
 * @param apiKey - Gemini API key
 * @param modelName - Model to use (must include explicit version suffix)
 * @param fileUri - File URI from uploadDocumentToGemini
 * @param mimeType - Document MIME type
 * @param systemPrompt - Base system instruction to cache
 * @returns Cache name for referencing in subsequent requests
 * @throws Error if cache creation fails
 *
 * @description
 * Creates a CachedContent object containing the document and system instructions.
 * This cache is reused across all operations in a run for significant cost savings.
 *
 * Cache TTL: 5 minutes (sufficient for typical processor runs)
 * Minimum cached tokens: 2,048-4,096 (easily met with documents)
 *
 * Cost benefits:
 * - First operation: Pays for cache creation
 * - Subsequent operations: Reduced rate for cached reads + only new prompt tokens
 */
export async function createGeminiCache(
  apiKey: string,
  modelName: string,
  fileUri: string,
  mimeType: string,
  systemPrompt: string
): Promise<string> {
  const cacheManager = new GoogleAICacheManager(apiKey)

  try {
    console.log(`[Gemini] Creating cache for model: ${modelName}`)

    // Ensure model name has proper prefix
    const fullModelName = modelName.startsWith('models/') ? modelName : `models/${modelName}`

    const cacheResult = await cacheManager.create({
      model: fullModelName,
      ttl: '300s',  // 5 minutes
      systemInstruction: {
        parts: [{
          text: systemPrompt || 'You are a helpful AI assistant that analyzes documents and provides structured responses.'
        }]
      },
      contents: [{
        role: 'user',
        parts: [
          { text: 'Here is a document. Analyze it according to the instructions that follow.' },
          {
            fileData: {
              mimeType,
              fileUri
            }
          }
        ]
      }]
    })

    console.log(`[Gemini] Cache created: ${cacheResult.name}`)
    console.log(`[Gemini] Cache valid for 5 minutes`)

    return cacheResult.name
  } catch (error: any) {
    console.error('[Gemini] Cache creation failed:', error)
    throw new Error(`Gemini cache creation failed: ${error.message}`)
  }
}

/**
 * Cleanup Gemini cache after run completion
 *
 * @param apiKey - Gemini API key
 * @param cacheName - Cache name to delete
 *
 * @description
 * Deletes the cache to clean up resources. Non-critical operation since
 * caches auto-expire after 5 minutes. Failures are logged but don't throw.
 */
export async function cleanupGeminiCache(
  apiKey: string,
  cacheName: string
): Promise<void> {
  const cacheManager = new GoogleAICacheManager(apiKey)

  try {
    console.log(`[Gemini] Cleaning up cache: ${cacheName}`)
    await cacheManager.delete(cacheName)
    console.log(`[Gemini] Cache deleted successfully`)
  } catch (error: any) {
    // Non-critical error - cache will auto-expire in 5 minutes
    console.warn(`[Gemini] Cache cleanup failed (non-critical):`, error.message)
  }
}

// ============================================================================
// LLM EXECUTION
// ============================================================================

/**
 * Execute LLM operation with Gemini using cached document
 *
 * @param params - Execution parameters including operation, document, settings, and API key
 * @param supabase - Supabase client (unused for Gemini, kept for signature consistency)
 * @param cacheRef - Cache reference with fileUri and cacheName
 * @returns Execution result with response, structured output, tokens, and metadata
 * @throws Error if execution fails
 *
 * @description
 * Core Gemini LLM execution logic with caching:
 * 1. Reference pre-created cache (no upload needed)
 * 2. Build generation config with JSON Schema for structured output
 * 3. Configure thinking mode if enabled
 * 4. Execute via native Gemini SDK
 * 5. Parse and validate structured output (automatic via JSON Schema)
 * 6. Extract thinking summaries if requested
 * 7. Return result with token usage and cache metrics
 *
 * **Performance Optimization:**
 * Pass cacheRef to reuse cached document and system prompt across operations.
 * Cache hits reduce costs significantly (similar to Anthropic's prompt caching).
 */
export async function executeLLMOperationGemini(
  params: GeminiExecutionParams,
  supabase: any,
  cacheRef: GeminiCacheRef
): Promise<LLMExecutionResult> {
  const { operation, document, systemPrompt, settings, apiKey, enableCache } = params

  console.log('=== Gemini LLM Executor: Starting Execution ===')
  console.log(`Operation: ${operation.name} (${operation.operation_type})`)
  console.log(`Document: ${document.name} (${document.mime_type})`)
  console.log(`Model: ${settings.selected_model_id || 'gemini-2.5-flash-002'}`)
  console.log(`Cache: ${cacheRef.cacheName}`)
  console.log(`File URI: ${cacheRef.fileUri}`)

  const genAI = new GoogleGenerativeAI(apiKey)
  const modelToUse = settings.selected_model_id || 'gemini-2.5-flash-002'

  // Get operation schema and convert to JSON Schema
  const operationSchema = getOperationTypeSchema(operation.operation_type)
  const jsonSchema = zodToJsonSchema(operationSchema, {
    name: `${operation.operation_type}Schema`,
    $refStrategy: 'none'  // Inline all references for Gemini compatibility
  })

  // Build generation config
  const generationConfig: any = {
    temperature: settings.temperature ?? 1.0,
    maxOutputTokens: settings.max_tokens ?? 8192,
    responseMimeType: 'application/json',
    responseSchema: jsonSchema
  }

  // Add top_p if supported and specified
  if (settings.top_p !== undefined && settings.supports_top_p) {
    generationConfig.topP = settings.top_p
  }

  // Add top_k if specified
  if (settings.top_k !== undefined) {
    generationConfig.topK = settings.top_k
  }

  // Add thinking configuration if specified
  if (settings.thinking_budget !== undefined) {
    generationConfig.thinkingConfig = {
      thinkingBudget: settings.thinking_budget,
      includeThoughts: settings.include_thoughts ?? false
    }
    console.log(`Thinking configured: budget=${settings.thinking_budget}, includeThoughts=${settings.include_thoughts ?? false}`)
  }

  const startTime = Date.now()

  try {
    console.log(`[Gemini] Executing ${operation.operation_type} operation with cached document`)

    // Execute generation with cached content (using legacy SDK API)
    // Get model from cached content, then generate
    const model = genAI.getGenerativeModelFromCachedContent(cacheRef.cacheName)
    const response = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: operation.prompt }]
      }],
      generationConfig
    })

    const executionTime = Date.now() - startTime

    // Extract response text (JSON)
    const rawText = response.response.text()
    console.log(`[Gemini] Response received (${rawText.length} chars in ${executionTime}ms)`)

    // Parse JSON (guaranteed valid by Gemini's structured output)
    const structuredOutput = JSON.parse(rawText)

    // Validate with Zod (additional safety check)
    const validated = operationSchema.safeParse(structuredOutput)

    if (!validated.success) {
      console.warn('[Gemini] Zod validation failed (unexpected - should be caught by JSON Schema):', validated.error)
      console.warn('[Gemini] Using raw structured output anyway')
    }

    // Extract thinking summary if includeThoughts is enabled
    let thinkingSummary: string | undefined
    if (settings.include_thoughts && response.response.candidates?.[0]?.content?.parts) {
      const thoughtParts = response.response.candidates[0].content.parts
        .filter((part: any) => part.thought)
        .map((part: any) => part.text)

      if (thoughtParts.length > 0) {
        thinkingSummary = thoughtParts.join('\n')
        console.log(`[Gemini] Thinking summary extracted (${thinkingSummary.length} chars)`)
      }
    }

    // Extract token usage
    const usage = response.response.usageMetadata || {}
    const cachedTokens = usage.cachedContentTokenCount || 0
    const cacheHit = cachedTokens > 0

    console.log(`[Gemini] Token usage - Input: ${usage.promptTokenCount}, Output: ${usage.candidatesTokenCount}, Cached: ${cachedTokens}, Thinking: ${usage.thoughtsTokenCount || 0}`)
    console.log(`[Gemini] Cache hit: ${cacheHit}`)

    return {
      response: rawText,
      structured_output: validated.success ? validated.data : structuredOutput,
      thinking_blocks: thinkingSummary ? [{ content: thinkingSummary }] : null,
      model: modelToUse,
      tokens: {
        input: usage.promptTokenCount || 0,
        output: usage.candidatesTokenCount || 0,
        cached_read: cachedTokens,
        cached_write: 0  // Write happens during cache creation, not per-operation
      },
      executionTime,
      cacheHit,
      // Return cache ref for potential debugging
      documentUrl: cacheRef.fileUri
    }

  } catch (error: any) {
    const executionTime = Date.now() - startTime
    console.error('[Gemini] Execution failed:', error)
    throw error
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Determine if error is retryable
 *
 * @param error - Error object from Gemini API
 * @returns true if error should trigger retry
 *
 * @description
 * Identifies transient errors that should be retried with exponential backoff.
 * Permanent errors (auth, validation) fail immediately.
 */
function isRetryableError(error: any): boolean {
  // Transient errors that should trigger retry
  const retryableErrors = [
    'RATE_LIMIT_EXCEEDED',
    'RESOURCE_EXHAUSTED',
    'SERVICE_UNAVAILABLE',
    'DEADLINE_EXCEEDED',
    'INTERNAL',
    'UNAVAILABLE',
    '429',
    '503',
    '529'
  ]

  const errorMessage = error?.message || error?.toString() || ''
  const errorCode = error?.status || error?.code || ''

  return retryableErrors.some(code =>
    errorMessage.includes(code) || errorCode.toString().includes(code)
  )
}

/**
 * Get exponential backoff delay
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 1s, 5s, 15s
  const delays = [1000, 5000, 15000]
  return delays[attempt] || 15000
}

/**
 * Sleep for specified duration
 *
 * @param ms - Milliseconds to sleep
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Execute LLM operation with Gemini with automatic retry
 *
 * @param params - Execution parameters
 * @param supabase - Supabase client
 * @param cacheRef - Cache reference
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Execution result
 * @throws Error if all retries exhausted or permanent error
 *
 * @description
 * Wraps executeLLMOperationGemini with retry logic for transient errors.
 * Uses exponential backoff (1s → 5s → 15s) for rate limits and service issues.
 */
export async function executeLLMOperationGeminiWithRetry(
  params: GeminiExecutionParams,
  supabase: any,
  cacheRef: GeminiCacheRef,
  maxRetries: number = 3
): Promise<LLMExecutionResult> {
  let attempt = 0
  let lastError: Error

  while (attempt < maxRetries) {
    try {
      return await executeLLMOperationGemini(params, supabase, cacheRef)
    } catch (error: any) {
      lastError = error

      if (isRetryableError(error) && attempt < maxRetries - 1) {
        const delayMs = getBackoffDelay(attempt)
        console.log(`[Gemini] Retryable error on attempt ${attempt + 1}/${maxRetries}. Retrying in ${delayMs}ms...`)
        console.log(`[Gemini] Error: ${error.message}`)
        await delay(delayMs)
        attempt++
        continue
      }

      // Non-retryable error or max retries reached
      console.error(`[Gemini] Operation failed after ${attempt + 1} attempts:`, error)
      throw error
    }
  }

  throw lastError!
}
