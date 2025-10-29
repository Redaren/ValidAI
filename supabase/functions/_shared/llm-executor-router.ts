/**
 * LLM Provider Router
 *
 * @module _shared/llm-executor-router
 * @description
 * Factory pattern router for directing LLM execution to the appropriate provider-specific executor.
 * Enables multi-provider support with a unified interface for Edge Functions.
 *
 * ## Architecture
 * - Factory pattern for provider-specific executors
 * - Single unified interface for both execute-processor-run and execute-workbench-test
 * - Extensible for future providers (OpenAI, Google, Cohere, etc.)
 * - Type-safe provider resolution with helpful error messages
 *
 * ## Supported Providers
 * - **Anthropic**: Uses Vercel AI SDK with prompt caching and extended thinking
 * - **Mistral**: Uses native Mistral SDK with document upload and JSON mode
 *
 * ## Usage
 * ```typescript
 * // In Edge Functions, replace direct executor calls with router
 * const result = await executeLLMOperationWithRetryRouter(params, supabase, signedDocumentUrl)
 *
 * // Provider is automatically determined from settings.provider
 * // Falls back to 'anthropic' if not specified
 * ```
 *
 * @version 1.0.0
 * @since 2025-10-29
 */

import { executeLLMOperation, executeLLMOperationWithRetry } from './llm-executor.ts'
import { executeLLMOperationMistral, executeLLMOperationMistralWithRetry } from './llm-executor-mistral.ts'
import type { LLMExecutionParams, LLMExecutionResult } from './types.ts'

/**
 * Supported LLM providers
 */
export type LLMProvider = 'anthropic' | 'mistral'

/**
 * Factory map of LLM executors by provider (without retry)
 *
 * @description
 * Maps provider names to their executor functions. Extensible design allows
 * adding new providers by simply adding an entry to this object.
 *
 * Future providers can be added like:
 * ```typescript
 * const executors = {
 *   anthropic: executeLLMOperation,
 *   mistral: executeLLMOperationMistral,
 *   openai: executeLLMOperationOpenAI,    // Future
 *   google: executeLLMOperationGoogle,    // Future
 *   cohere: executeLLMOperationCohere,    // Future
 * }
 * ```
 */
const executors = {
  anthropic: executeLLMOperation,
  mistral: executeLLMOperationMistral,
  // Future providers can be added here
} as const

/**
 * Factory map of LLM executors with retry logic
 *
 * @description
 * Maps provider names to their executor functions with built-in retry logic.
 * Matches the structure of executors but includes exponential backoff retry handling.
 */
const executorsWithRetry = {
  anthropic: executeLLMOperationWithRetry,
  mistral: executeLLMOperationMistralWithRetry,
  // Future providers can be added here
} as const

/**
 * Route to appropriate LLM executor based on provider
 *
 * @param params - Execution parameters (includes settings.provider)
 * @param supabase - Supabase client
 * @param signedDocumentUrl - Optional pre-uploaded document URL (Mistral only, ignored by Anthropic)
 * @returns Execution result from provider-specific executor
 * @throws Error if provider is unknown/unsupported
 *
 * @description
 * Factory function that routes execution to the correct provider-specific executor.
 * Provider is determined from params.settings.provider, with 'anthropic' as default.
 *
 * **Note:** The signedDocumentUrl parameter is only used by Mistral executor for URL reuse.
 * Anthropic executor ignores this parameter as it processes documents inline.
 */
export async function executeLLMOperationWithRouter(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string
): Promise<LLMExecutionResult> {
  const provider = (params.settings.provider || 'anthropic') as LLMProvider

  console.log(`[Router] Routing LLM execution to ${provider} executor`)

  const executor = executors[provider]

  if (!executor) {
    const supportedProviders = Object.keys(executors).join(', ')
    throw new Error(
      `Unknown LLM provider: ${provider}. Supported providers: ${supportedProviders}`
    )
  }

  // Route to provider-specific executor
  // Note: Anthropic executor accepts cachedDocumentBuffer (Buffer) as 3rd param
  // Mistral executor accepts signedDocumentUrl (string) as 3rd param
  // TypeScript may show warning, but both signatures are compatible with 'any' cast
  return await executor(params, supabase, signedDocumentUrl as any)
}

/**
 * Route to appropriate LLM executor with retry logic
 *
 * @param params - Execution parameters (includes settings.provider)
 * @param supabase - Supabase client
 * @param signedDocumentUrl - Optional pre-uploaded document URL (Mistral only, ignored by Anthropic)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Execution result from provider-specific executor
 * @throws Error if provider is unknown/unsupported or max retries exceeded
 *
 * @description
 * Factory function that routes execution to the correct provider-specific executor WITH retry logic.
 * Provider is determined from params.settings.provider, with 'anthropic' as default.
 *
 * Retry behavior:
 * - Exponential backoff: 1s, 5s, 15s
 * - Retries on: 429 (rate limit), 503 (service unavailable), timeouts, network errors
 * - Fails immediately on: auth errors, validation errors, permanent API errors
 *
 * **Note:** The signedDocumentUrl parameter is only used by Mistral executor for URL reuse.
 * Anthropic executor ignores this parameter as it processes documents inline.
 */
export async function executeLLMOperationWithRetryRouter(
  params: LLMExecutionParams,
  supabase: any,
  signedDocumentUrl?: string,
  maxRetries: number = 3
): Promise<LLMExecutionResult> {
  const provider = (params.settings.provider || 'anthropic') as LLMProvider

  console.log(`[Router] Routing LLM execution to ${provider} executor with retry (max: ${maxRetries})`)

  const executor = executorsWithRetry[provider]

  if (!executor) {
    const supportedProviders = Object.keys(executorsWithRetry).join(', ')
    throw new Error(
      `Unknown LLM provider: ${provider}. Supported providers: ${supportedProviders}`
    )
  }

  // Route to provider-specific executor with retry
  // Note: Both executors accept similar signatures, but with different 3rd param types
  // Anthropic: cachedDocumentBuffer (Buffer | undefined)
  // Mistral: signedDocumentUrl (string | undefined)
  // TypeScript may show warning, but both signatures are compatible with 'any' cast
  return await executor(params, supabase, signedDocumentUrl as any, maxRetries)
}

/**
 * Get list of supported providers
 *
 * @returns Array of supported provider names
 *
 * @description
 * Utility function to get the list of currently supported LLM providers.
 * Useful for validation and UI display purposes.
 */
export function getSupportedProviders(): LLMProvider[] {
  return Object.keys(executors) as LLMProvider[]
}

/**
 * Check if a provider is supported
 *
 * @param provider - Provider name to check
 * @returns True if provider is supported, false otherwise
 *
 * @description
 * Utility function to validate provider names before routing.
 * Can be used for input validation in Edge Functions.
 */
export function isProviderSupported(provider: string): provider is LLMProvider {
  return provider in executors
}
