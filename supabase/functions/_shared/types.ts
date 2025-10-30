/**
 * Shared Type Definitions for LLM Execution
 *
 * @module _shared/types
 * @description
 * Common type definitions used across Edge Functions for LLM execution.
 * Centralizes types to ensure consistency between workbench and production run execution.
 */

/**
 * Operation type enum matching database operation_type
 */
export type OperationType =
  | 'generic'
  | 'validation'
  | 'extraction'
  | 'rating'
  | 'classification'
  | 'analysis'
  | 'traffic_light'

/**
 * Snapshot of an operation from run.snapshot.operations[i]
 * Used in production runs to execute with frozen configuration
 */
export interface OperationSnapshot {
  id: string
  name: string
  description: string | null
  operation_type: OperationType
  prompt: string
  position: number
  area: string
  configuration: Record<string, any> | null
  output_schema: Record<string, any> | null
}

/**
 * Snapshot of a document from run.snapshot.document
 * Used to fetch file content during execution
 */
export interface DocumentSnapshot {
  id: string
  name: string
  size_bytes: number
  mime_type: string
  storage_path: string
}

/**
 * Supported LLM providers
 */
export type LLMProvider = 'anthropic' | 'mistral'

/**
 * Processor configuration settings
 * Extracted from processors.configuration.settings_override or defaults
 */
export interface ProcessorSettings {
  provider?: LLMProvider  // LLM provider (anthropic, mistral, etc.)
  selected_model_id?: string
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  thinking?: {
    enabled: boolean
    budget_tokens: number
  }
  enable_caching?: boolean
  stop_sequences?: string[]
  supports_top_p?: boolean  // Whether model supports top_p parameter alongside temperature
  use_anthropic_files_api?: boolean  // Enable Anthropic Files API (defaults to true)
}

/**
 * Parameters for LLM execution
 * Used by shared llm-executor utility
 */
export interface LLMExecutionParams {
  operation: OperationSnapshot
  document: DocumentSnapshot
  systemPrompt: string | null
  settings: ProcessorSettings
  apiKey: string
  enableCache: boolean
  previousMessages?: Message[]  // For conversation history (future use)
}

/**
 * Message structure for LLM API
 * Matches Vercel AI SDK format
 */
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

/**
 * Content block for multi-part messages
 */
export interface ContentBlock {
  type: 'text' | 'file'
  text?: string
  data?: Buffer | string
  mediaType?: string
  providerOptions?: {
    anthropic?: {
      cacheControl?: { type: 'ephemeral' }
    }
  }
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  input: number
  output: number
  cached_read: number
  cached_write: number
}

/**
 * Result of LLM execution
 * Returned by shared llm-executor utility
 */
export interface LLMExecutionResult {
  response: string
  structured_output: any | null
  thinking_blocks: any[] | null
  model: string
  tokens: TokenUsage
  executionTime: number
  cacheHit: boolean
  documentUrl?: string  // Mistral signed URL for document reuse (valid 24 hours)
  fileId?: string  // Anthropic file_id for document reuse (indefinite storage)
}

/**
 * Error types for retry logic
 */
export enum LLMErrorType {
  RATE_LIMIT = 'RateLimitError',
  TIMEOUT = 'TimeoutError',
  NETWORK = 'NetworkError',
  AUTH = 'AuthenticationError',
  VALIDATION = 'ValidationError',
  UNKNOWN = 'UnknownError'
}

/**
 * Extended error with retry metadata
 */
export interface LLMError extends Error {
  type: LLMErrorType
  retryCount?: number
  isTransient: boolean
}
