/**
 * Workbench Validation Schemas
 *
 * Validation schemas for workbench test execution using Anthropic's Claude API.
 * Based on official API documentation: https://docs.claude.com/en/api/messages
 */

import { z } from 'zod'

/**
 * Extended thinking configuration (Anthropic-specific)
 * Minimum budget: 1024 tokens
 * Must be less than max_tokens parameter
 */
export const thinkingConfigSchema = z.object({
  type: z.literal('enabled'),
  budget_tokens: z
    .number()
    .int()
    .min(1024, 'Thinking budget must be at least 1024 tokens')
    .describe('Token budget for extended thinking (minimum 1024)')
})

export type ThinkingConfig = z.infer<typeof thinkingConfigSchema>

/**
 * Message execution metadata
 * Captures all parameters and metrics for each message execution
 */
export const messageMetadataSchema = z.object({
  mode: z.enum(['stateful', 'stateless']),
  cacheCreated: z.boolean(),
  systemPromptSent: z.boolean(),
  fileSent: z.boolean().optional(),
  thinkingEnabled: z.boolean(),
  citationsEnabled: z.boolean(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedReadTokens: z.number().optional(),
  cachedWriteTokens: z.number().optional(),
  executionTimeMs: z.number().optional()
})

export type MessageMetadata = z.infer<typeof messageMetadataSchema>

/**
 * Conversation message in workbench history
 *
 * Content can be:
 * - string: Simple text message
 * - array: Content blocks (e.g., [{type: 'document', ...}, {type: 'text', text: '...'}])
 *
 * We store the EXACT structure sent to Anthropic API to ensure cache hits.
 */
export const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string(),
    z.array(z.any())
  ]),
  timestamp: z.string(),
  metadata: messageMetadataSchema.optional(),
  // Legacy field for backward compatibility
  tokensUsed: z.object({
    input: z.number(),
    output: z.number(),
    cached_read: z.number().optional(),
    cached_write: z.number().optional()
  }).optional()
})

export type ConversationMessage = z.infer<typeof conversationMessageSchema>

/**
 * Workbench test execution settings
 * Based on Anthropic API parameters
 */
export const workbenchSettingsSchema = z.object({
  model_id: z.string().optional(),
  temperature: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Controls randomness (0-1, default 1.0)'),
  max_tokens: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum tokens to generate (minimum 1)'),
  top_p: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Nucleus sampling parameter (0-1)'),
  top_k: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Sample from top K options'),
  thinking: thinkingConfigSchema.optional(),
  citations_enabled: z
    .boolean()
    .optional()
    .describe('Enable document citations'),
  create_cache: z
    .boolean()
    .optional()
    .describe('Create cache for this message (adds cache_control markers)'),
  stop_sequences: z
    .array(z.string())
    .optional()
    .describe('Custom stop sequences')
})

export type WorkbenchSettings = z.infer<typeof workbenchSettingsSchema>

/**
 * Complete workbench test execution request
 *
 * Used when calling execute-workbench-test Edge Function.
 * Supports two modes:
 * - Stateful: Document testing with caching and conversation history
 * - Stateless: Independent single queries
 *
 * @example Stateful mode (first message)
 * ```typescript
 * const testInput: WorkbenchTestInput = {
 *   processor_id: "uuid",
 *   mode: "stateful",
 *   system_prompt: "You are a helpful assistant...",
 *   send_system_prompt: true,
 *   file_content: "Document text here...",
 *   file_type: "text/plain",
 *   conversation_history: [],  // First message
 *   new_prompt: "What are the key points in this document?",
 *   settings: {
 *     model_id: "claude-3-5-sonnet-20241022",
 *     caching_enabled: true  // Auto-enabled in stateful mode
 *   }
 * }
 * ```
 *
 * @example Stateful mode (follow-up message)
 * ```typescript
 * const followUpInput: WorkbenchTestInput = {
 *   processor_id: "uuid",
 *   mode: "stateful",
 *   send_system_prompt: false,  // System prompt cached from first message
 *   conversation_history: [
 *     { role: "user", content: "First question?", timestamp: "...", metadata: {...} },
 *     { role: "assistant", content: "First answer...", timestamp: "...", metadata: {...} }
 *   ],
 *   new_prompt: "Follow-up question?",
 *   settings: {
 *     caching_enabled: true  // Cache hit on system + document
 *   }
 * }
 * ```
 *
 * @example Stateless mode
 * ```typescript
 * const statelessInput: WorkbenchTestInput = {
 *   processor_id: "uuid",
 *   mode: "stateless",
 *   system_prompt: "You are a helpful assistant...",
 *   send_system_prompt: true,  // Sent with every message
 *   conversation_history: [],  // Always empty in stateless mode
 *   new_prompt: "Calculate 2+2",
 *   settings: {
 *     caching_enabled: false  // Auto-disabled in stateless mode
 *   }
 * }
 * ```
 */
export const workbenchTestSchema = z.object({
  processor_id: z.string().uuid('Invalid processor ID'),
  mode: z
    .enum(['stateful', 'stateless'])
    .describe('Execution mode: stateful (cached conversation) or stateless (independent)'),
  system_prompt: z.string().optional(),
  send_system_prompt: z
    .boolean()
    .describe('Whether to send system prompt with this message'),
  send_file: z
    .boolean()
    .describe('Whether to send file content with this message'),
  file_content: z.string().optional(),
  file_type: z
    .enum(['text/plain', 'application/pdf'])
    .optional()
    .describe('MIME type for document'),
  conversation_history: z
    .array(conversationMessageSchema)
    .default([])
    .describe('Previous conversation turns (only in stateful mode)'),
  new_prompt: z
    .string()
    .min(1, 'Prompt cannot be empty')
    .describe('Current user prompt'),
  settings: workbenchSettingsSchema
})

export type WorkbenchTestInput = z.infer<typeof workbenchTestSchema>

/**
 * Workbench test execution response
 *
 * Returned by execute-workbench-test Edge Function after successful execution.
 * Includes execution_id for real-time status tracking and metadata about the execution.
 *
 * @example
 * ```typescript
 * const response: WorkbenchTestResponse = {
 *   execution_id: "uuid",  // Subscribe to this for real-time updates
 *   response: "Based on the document, the key points are...",
 *   thinking_blocks: [
 *     { type: "thinking", content: "Let me analyze this step by step..." }
 *   ],
 *   citations: [
 *     { type: "citation", text: "specific passage from document" }
 *   ],
 *   metadata: {
 *     mode: "stateful",
 *     cacheEnabled: true,
 *     systemPromptSent: true,
 *     thinkingEnabled: false,
 *     citationsEnabled: true,
 *     inputTokens: 1000,
 *     outputTokens: 500,
 *     cachedReadTokens: 900,  // 90% of input was cached
 *     cachedWriteTokens: 0,   // No new cache created this turn
 *     executionTimeMs: 2340
 *   },
 *   tokensUsed: {
 *     input: 1000,
 *     output: 500,
 *     cached_read: 900,
 *     cached_write: 0,
 *     total: 1500
 *   },
 *   executionTime: 2340,  // milliseconds
 *   timestamp: "2025-10-03T12:34:56Z"
 * }
 * ```
 */
export const workbenchTestResponseSchema = z.object({
  execution_id: z.string().uuid(),  // For real-time subscription
  response: z.string(),
  thinking_blocks: z.array(z.any()).optional(),
  citations: z.array(z.any()).optional(),
  metadata: messageMetadataSchema,  // Execution metadata
  tokensUsed: z.object({
    input: z.number(),
    output: z.number(),
    cached_read: z.number().optional(),
    cached_write: z.number().optional(),
    total: z.number()
  }),
  executionTime: z.number(),
  timestamp: z.string(),
  // Actual content structure sent to Anthropic (for cache consistency)
  user_content_sent: z.union([z.string(), z.array(z.any())]),
  system_sent: z.union([z.string(), z.array(z.any())]).optional()
})

export type WorkbenchTestResponse = z.infer<typeof workbenchTestResponseSchema>

/**
 * Workbench execution record (from database)
 */
export const workbenchExecutionSchema = z.object({
  id: z.string().uuid(),
  processor_id: z.string().uuid(),
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  prompt: z.string(),
  settings: z.any(),
  model_used: z.string().optional().nullable(),
  response: z.string().optional().nullable(),
  partial_response: z.string().optional().nullable(),
  thinking_blocks: z.any().optional().nullable(),
  citations: z.any().optional().nullable(),
  tokens_used: z.any().optional().nullable(),
  execution_time_ms: z.number().optional().nullable(),
  error_message: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string()
})

export type WorkbenchExecution = z.infer<typeof workbenchExecutionSchema>
