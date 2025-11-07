/**
 * Google Gemini LLM Executor Utility (New SDK v1.29.0)
 *
 * @module _shared/llm-executor-gemini
 * @description
 * Gemini-specific LLM execution logic using the production-ready @google/genai SDK
 * (v1.29.0) with explicit caching support. Follows the same architectural pattern
 * as Anthropic and Mistral executors.
 *
 * ## SDK Migration
 * - Migrated from @google/generative-ai@0.21.0 (deprecated, EOL Aug 31, 2025)
 * - Now using @google/genai@1.29.0 (GA - production ready)
 * - Migration date: 2025-11-07
 *
 * ## Features
 * - Unified GoogleGenAI client architecture
 * - Document upload via ai.files.upload() (48-hour storage)
 * - Explicit cache creation via ai.caches.create() (5-minute TTL)
 * - Native JSON Schema structured output (best-in-class reliability)
 * - Configurable thinking mode with budget control
 * - Comprehensive error handling and retry logic
 *
 * ## Key Differences from Anthropic/Mistral
 * - Explicit CachedContent API (vs inline cache_control)
 * - Native JSON Schema support (vs manual parsing)
 * - Thinking budget configuration (-1 dynamic, 0 disabled, fixed values)
 * - 1M token context window
 * - File API returns name + URI (for cleanup)
 *
 * @version 2.0.0
 * @since 2025-11-07
 */

import { Buffer } from 'node:buffer'
import { GoogleGenAI } from 'npm:@google/genai@1.29.0'
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
  fileName: string       // File name for cleanup (NEW in SDK v1.29.0)
  cacheName: string      // CachedContent name (5-minute TTL)
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
 * Upload document to Gemini File API (New SDK v1.29.0)
 *
 * @param ai - Initialized GoogleGenAI client
 * @param documentBuffer - Document content as ArrayBuffer
 * @param fileName - Original document filename
 * @param mimeType - Document MIME type
 * @returns File name, URI, and MIME type for referencing in requests
 * @throws Error if upload fails
 *
 * @description
 * Uploads document to Gemini's file storage using the new SDK's ai.files.upload() API.
 * Files are stored for 48 hours and auto-deleted afterward. Much simpler than the
 * legacy REST API approach.
 *
 * Supported formats:
 * - PDFs up to 1,000 pages (50MB max)
 * - Text files (TXT, Markdown, CSV, etc.)
 * - Each page ≈ 258 tokens
 */
export async function uploadDocumentToGemini(
  ai: GoogleGenAI,
  documentBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string = 'application/pdf'
): Promise<{ name: string; uri: string; mimeType: string }> {
  try {
    const fileSize = documentBuffer.byteLength
    console.log(`[Gemini] Uploading document: ${fileName} (${fileSize} bytes, type: ${mimeType})`)

    // Convert ArrayBuffer to Blob for SDK upload
    const blob = new Blob([documentBuffer], { type: mimeType })

    const file = await ai.files.upload({
      file: blob,
      config: {
        displayName: fileName,
        mimeType: mimeType
      }
    })

    console.log(`[Gemini] File uploaded successfully: ${file.uri}`)
    console.log(`[Gemini] File name: ${file.name}`)
    console.log(`[Gemini] File valid for 48 hours`)

    return {
      name: file.name,      // For cleanup
      uri: file.uri,        // For cache creation
      mimeType: file.mimeType
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
 * Create explicit Gemini cache for multi-operation efficiency (New SDK v1.29.0)
 *
 * @param ai - Initialized GoogleGenAI client
 * @param modelName - Model to use (no 'models/' prefix needed)
 * @param fileUri - File URI from uploadDocumentToGemini
 * @param mimeType - Document MIME type
 * @param systemPrompt - Base system instruction to cache
 * @returns Cache name for referencing in subsequent requests
 * @throws Error if cache creation fails
 *
 * @description
 * Creates a CachedContent object using the new SDK's ai.caches.create() API.
 * This cache is reused across all operations in a run for significant cost savings.
 *
 * Cache TTL: 5 minutes (sufficient for typical processor runs)
 * Minimum cached tokens: 1,024 (Flash) or 4,096 (Pro)
 *
 * Cost benefits:
 * - First operation: Pays for cache creation
 * - Subsequent operations: 75% discount on cached tokens + only new prompt tokens
 */
export async function createGeminiCache(
  ai: GoogleGenAI,
  modelName: string,
  fileUri: string,
  mimeType: string,
  systemPrompt: string
): Promise<string> {
  try {
    console.log(`[Gemini] Creating cache for model: ${modelName}`)

    const cache = await ai.caches.create({
      model: modelName,  // No 'models/' prefix needed in new SDK
      config: {
        contents: [{
          role: 'user',
          parts: [
            { text: 'Here is a document. Analyze it according to the instructions that follow.' },
            { fileData: { fileUri, mimeType } }
          ]
        }],
        systemInstruction: systemPrompt || 'You are a helpful AI assistant that analyzes documents and provides structured responses.',
        ttl: '300s'  // 5 minutes
      }
    })

    console.log(`[Gemini] Cache created: ${cache.name}`)
    console.log(`[Gemini] Cache expires: ${cache.expireTime}`)

    return cache.name  // Format: cachedContents/{id}
  } catch (error: any) {
    console.error('[Gemini] Cache creation failed:', error.message)
    throw new Error(`Gemini cache creation failed: ${error.message}`)
  }
}

/**
 * Cleanup Gemini cache after run completion (New SDK v1.29.0)
 *
 * @param ai - Initialized GoogleGenAI client
 * @param cacheName - Cache name to delete
 *
 * @description
 * Deletes the cache to clean up resources. Non-critical operation since
 * caches auto-expire after 5 minutes. Failures are logged but don't throw.
 */
export async function cleanupGeminiCache(
  ai: GoogleGenAI,
  cacheName: string
): Promise<void> {
  try {
    console.log(`[Gemini] Cleaning up cache: ${cacheName}`)
    await ai.caches.delete({ name: cacheName })
    console.log(`[Gemini] Cache deleted successfully`)
  } catch (error: any) {
    // Non-critical error - cache will auto-expire in 5 minutes
    console.warn(`[Gemini] Cache cleanup failed (non-critical):`, error.message)
  }
}

/**
 * Cleanup uploaded Gemini file after run completion (New SDK v1.29.0)
 *
 * @param ai - Initialized GoogleGenAI client
 * @param fileName - File name to delete
 *
 * @description
 * Deletes the uploaded file to clean up resources. Non-critical operation since
 * files auto-delete after 48 hours. Failures are logged but don't throw.
 */
export async function cleanupGeminiFile(
  ai: GoogleGenAI,
  fileName: string
): Promise<void> {
  try {
    console.log(`[Gemini] Cleaning up file: ${fileName}`)
    await ai.files.delete({ name: fileName })
    console.log(`[Gemini] File deleted successfully`)
  } catch (error: any) {
    // Non-critical error - file will auto-delete in 48 hours
    console.warn(`[Gemini] File cleanup failed (non-critical):`, error.message)
  }
}

// ============================================================================
// LLM EXECUTION
// ============================================================================

/**
 * Execute LLM operation with Gemini using cached document (New SDK v1.29.0)
 *
 * @param params - Execution parameters including operation, document, settings, and API key
 * @param supabase - Supabase client (unused for Gemini, kept for signature consistency)
 * @param cacheRef - Cache reference with fileUri, fileName, and cacheName
 * @returns Execution result with response, structured output, tokens, and metadata
 * @throws Error if execution fails
 *
 * @description
 * Core Gemini LLM execution logic with caching using new SDK v1.29.0:
 * 1. Initialize GoogleGenAI client
 * 2. Build generation config with JSON Schema for structured output
 * 3. Configure thinking mode if enabled
 * 4. Execute via unified ai.models.generateContent() API with cachedContent
 * 5. Parse and validate structured output (automatic via JSON Schema)
 * 6. Extract thinking summaries if requested
 * 7. Return result with token usage and cache metrics
 *
 * **Performance Optimization:**
 * Pass cacheRef to reuse cached document and system prompt across operations.
 * Cache hits reduce costs by 75% on cached tokens.
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
  console.log(`Model: ${settings.selected_model_id || 'gemini-2.5-flash'}`)
  console.log(`Cache: ${cacheRef.cacheName}`)
  console.log(`File URI: ${cacheRef.fileUri}`)

  const ai = new GoogleGenAI({ apiKey })
  const modelToUse = settings.selected_model_id || 'gemini-2.5-flash'

  // Get operation schema and convert to JSON Schema
  const operationSchema = getOperationTypeSchema(operation.operation_type)
  const jsonSchema = zodToJsonSchema(operationSchema, {
    name: `${operation.operation_type}Schema`,
    $refStrategy: 'none'  // Inline all references for Gemini compatibility
  })

  // Clean the schema - remove fields Google doesn't accept
  const cleanedSchema = { ...jsonSchema }
  delete cleanedSchema.$schema
  delete cleanedSchema.definitions
  delete cleanedSchema.$ref

  // Build generation config
  const generationConfig: any = {
    temperature: settings.temperature ?? 1.0,
    maxOutputTokens: settings.max_tokens ?? 8192,
    responseMimeType: 'application/json',
    responseSchema: cleanedSchema,  // Use cleaned schema
    cachedContent: cacheRef.cacheName  // NEW: Reference cached content
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

    // NEW: Unified API call with cached content
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: operation.prompt,  // Simplified - just the prompt text
      config: generationConfig
    })

    const executionTime = Date.now() - startTime

    // NEW: Direct .text property
    const rawText = response.text
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
    if (settings.include_thoughts && response.candidates?.[0]?.content?.parts) {
      const thoughtParts = response.candidates[0].content.parts
        .filter((part: any) => part.thought)
        .map((part: any) => part.text)

      if (thoughtParts.length > 0) {
        thinkingSummary = thoughtParts.join('\n')
        console.log(`[Gemini] Thinking summary extracted (${thinkingSummary.length} chars)`)
      }
    }

    // NEW: Direct usage metadata access
    const usage = response.usageMetadata || {}
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
