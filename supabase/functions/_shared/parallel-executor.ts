/**
 * Parallel Operation Executor
 *
 * @module _shared/parallel-executor
 * @description
 * Provides parallel execution capabilities for LLM operations with provider-aware
 * concurrency limiting and rate limit safety.
 *
 * Key features:
 * - Serial, parallel, and hybrid execution modes
 * - Configurable concurrency limits per provider
 * - Adaptive rate limit handling (reduces concurrency on 429 errors)
 * - Continue-on-failure semantics (partial results preserved)
 * - Provider-specific optimization (Anthropic cache warmup, Gemini immediate parallel)
 *
 * @created 2025-11-08
 */

import type {
  OperationSnapshot,
  DocumentSnapshot,
  LLMExecutionParams,
  LLMExecutionResult,
  ExecutionConfig,
  ExecutionMode,
  LLMProvider,
  OperationExecutionResult,
  ParallelExecutionOptions,
  ProcessorSettings,
  LLMError,
  LLMErrorType,
} from './types.ts'
import { executeLLMOperationWithRetryRouter } from './llm-executor-router.ts'

/**
 * Sleep utility for delays between batches
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute operations with provider-aware parallelization
 *
 * @param operations - Array of operations to execute
 * @param options - Parallel execution options
 * @param context - Execution context (document, settings, etc.)
 * @param supabase - Supabase client for database operations
 * @param documentRef - Provider-specific document reference (Buffer, URL, cache ref, or file_id)
 * @returns Array of operation execution results
 */
export async function executeOperationsParallel(
  operations: OperationSnapshot[],
  options: ParallelExecutionOptions,
  context: {
    document: DocumentSnapshot
    systemPrompt: string | null
    settings: ProcessorSettings
    apiKey: string
  },
  supabase: any,
  documentRef?: string | Buffer | { fileUri: string; fileName: string; cacheName: string }
): Promise<OperationExecutionResult[]> {
  const { config, provider, startIndex, isFirstBatch } = options
  const { execution_mode, max_concurrency, warmup_operations, batch_delay_ms, rate_limit_safety } = config

  console.log(`[ParallelExecutor] Starting execution:`, {
    mode: execution_mode,
    operations: operations.length,
    startIndex,
    maxConcurrency: max_concurrency,
    warmupOps: warmup_operations,
    batchDelay: batch_delay_ms,
    provider,
    isFirstBatch,
  })

  // Track adaptive concurrency for rate limit safety
  let currentConcurrency = max_concurrency
  const results: OperationExecutionResult[] = []

  // Determine execution strategy based on mode and provider
  if (execution_mode === 'serial') {
    // Serial execution (current behavior)
    console.log(`[ParallelExecutor] Using serial execution`)
    return await executeSerial(operations, context, supabase, documentRef, startIndex)
  } else if (execution_mode === 'hybrid' && provider === 'anthropic' && isFirstBatch) {
    // Hybrid mode for Anthropic: warmup operations serially, then parallelize
    console.log(`[ParallelExecutor] Using hybrid execution (Anthropic cache warmup)`)

    // Execute warmup operations serially
    const warmupOps = operations.slice(0, warmup_operations)
    const warmupResults = await executeSerial(warmupOps, context, supabase, documentRef, startIndex)
    results.push(...warmupResults)

    // Execute remaining operations in parallel
    const parallelOps = operations.slice(warmup_operations)
    if (parallelOps.length > 0) {
      console.log(`[ParallelExecutor] Warmup complete, executing ${parallelOps.length} operations in parallel`)
      const parallelResults = await executeInBatches(
        parallelOps,
        context,
        supabase,
        documentRef,
        startIndex + warmup_operations,
        currentConcurrency,
        batch_delay_ms,
        rate_limit_safety
      )
      results.push(...parallelResults)
    }

    return results
  } else {
    // Full parallel execution (Gemini, Mistral, or Anthropic after first batch)
    console.log(`[ParallelExecutor] Using parallel execution`)
    return await executeInBatches(
      operations,
      context,
      supabase,
      documentRef,
      startIndex,
      currentConcurrency,
      batch_delay_ms,
      rate_limit_safety
    )
  }
}

/**
 * Execute operations serially (one by one)
 */
async function executeSerial(
  operations: OperationSnapshot[],
  context: {
    document: DocumentSnapshot
    systemPrompt: string | null
    settings: ProcessorSettings
    apiKey: string
  },
  supabase: any,
  documentRef: any,
  startIndex: number
): Promise<OperationExecutionResult[]> {
  const results: OperationExecutionResult[] = []

  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i]
    const operationIndex = startIndex + i

    console.log(`[Serial] Executing operation ${operationIndex}: ${operation.name}`)

    try {
      const params: LLMExecutionParams = {
        operation,
        document: context.document,
        systemPrompt: context.systemPrompt,
        settings: context.settings,
        apiKey: context.apiKey,
        enableCache: operationIndex === 0, // Only first operation enables cache creation
      }

      const result = await executeLLMOperationWithRetryRouter(params, supabase, documentRef)

      // Update documentRef if provider returned one (Mistral, Anthropic Files API)
      if (result.documentUrl) {
        documentRef = result.documentUrl
      } else if (result.fileId) {
        documentRef = result.fileId
      }

      results.push({
        operation,
        operationIndex,
        success: true,
        result,
      })

      console.log(`[Serial] Operation ${operationIndex} completed successfully`)
    } catch (error) {
      console.error(`[Serial] Operation ${operationIndex} failed:`, error)

      results.push({
        operation,
        operationIndex,
        success: false,
        error: error as LLMError,
      })
    }
  }

  return results
}

/**
 * Execute operations in parallel batches with concurrency limiting
 */
async function executeInBatches(
  operations: OperationSnapshot[],
  context: {
    document: DocumentSnapshot
    systemPrompt: string | null
    settings: ProcessorSettings
    apiKey: string
  },
  supabase: any,
  documentRef: any,
  startIndex: number,
  maxConcurrency: number,
  batchDelayMs: number,
  rateLimitSafety: boolean
): Promise<OperationExecutionResult[]> {
  const results: OperationExecutionResult[] = []
  let currentConcurrency = maxConcurrency

  // Process operations in batches respecting concurrency limit
  for (let i = 0; i < operations.length; i += currentConcurrency) {
    const batch = operations.slice(i, i + currentConcurrency)
    const batchStartIndex = startIndex + i

    console.log(`[Parallel] Executing batch: operations ${batchStartIndex}-${batchStartIndex + batch.length - 1}`)

    // Execute batch in parallel using Promise.allSettled (continue-on-failure)
    const batchPromises = batch.map(async (operation, batchIdx) => {
      const operationIndex = batchStartIndex + batchIdx

      try {
        const params: LLMExecutionParams = {
          operation,
          document: context.document,
          systemPrompt: context.systemPrompt,
          settings: context.settings,
          apiKey: context.apiKey,
          enableCache: operationIndex === 0, // First operation in entire run
        }

        const result = await executeLLMOperationWithRetryRouter(params, supabase, documentRef)

        console.log(`[Parallel] Operation ${operationIndex} completed successfully`)

        return {
          operation,
          operationIndex,
          success: true,
          result,
        } as OperationExecutionResult
      } catch (error) {
        console.error(`[Parallel] Operation ${operationIndex} failed:`, error)

        return {
          operation,
          operationIndex,
          success: false,
          error: error as LLMError,
        } as OperationExecutionResult
      }
    })

    const batchResults = await Promise.allSettled(batchPromises)

    // Process results and check for rate limit errors
    let rateLimitCount = 0

    for (const settledResult of batchResults) {
      if (settledResult.status === 'fulfilled') {
        const opResult = settledResult.value

        // Check if this was a rate limit error
        if (!opResult.success && opResult.error && isRateLimitError(opResult.error)) {
          rateLimitCount++
        }

        results.push(opResult)
      } else {
        // Promise rejection (shouldn't happen with proper error handling, but fallback)
        console.error(`[Parallel] Unexpected promise rejection:`, settledResult.reason)
      }
    }

    // Adaptive rate limiting: reduce concurrency if hitting rate limits
    if (rateLimitSafety && rateLimitCount > 0) {
      const previousConcurrency = currentConcurrency
      currentConcurrency = Math.max(1, Math.floor(currentConcurrency / 2))

      console.warn(
        `[Parallel] Rate limit detected (${rateLimitCount}/${batch.length} operations). ` +
          `Reducing concurrency: ${previousConcurrency} → ${currentConcurrency}`
      )
    }

    // Delay between batches for rate limit safety
    if (i + currentConcurrency < operations.length && batchDelayMs > 0) {
      console.log(`[Parallel] Delaying ${batchDelayMs}ms before next batch`)
      await sleep(batchDelayMs)
    }
  }

  return results
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: LLMError): boolean {
  return (
    error.type === LLMErrorType.RATE_LIMIT ||
    error.message?.includes('429') ||
    error.message?.toLowerCase().includes('rate limit') ||
    error.message?.toLowerCase().includes('too many requests')
  )
}

/**
 * Get default execution config for provider (fallback if not in database)
 */
export function getDefaultExecutionConfig(provider: LLMProvider): ExecutionConfig {
  switch (provider) {
    case 'anthropic':
      return {
        execution_mode: 'hybrid',
        max_concurrency: 5,
        warmup_operations: 1,
        batch_delay_ms: 200,
        rate_limit_safety: true,
      }
    case 'google':
      return {
        execution_mode: 'parallel',
        max_concurrency: 5,
        warmup_operations: 0,
        batch_delay_ms: 6000,
        rate_limit_safety: true,
      }
    case 'mistral':
      return {
        execution_mode: 'parallel',
        max_concurrency: 3,
        warmup_operations: 0,
        batch_delay_ms: 1000,
        rate_limit_safety: true,
      }
    default:
      // Conservative default
      return {
        execution_mode: 'serial',
        max_concurrency: 1,
        warmup_operations: 0,
        batch_delay_ms: 0,
        rate_limit_safety: true,
      }
  }
}
