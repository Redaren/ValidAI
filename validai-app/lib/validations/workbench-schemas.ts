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
 * Conversation message in workbench history
 */
export const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
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
  caching_enabled: z
    .boolean()
    .optional()
    .describe('Enable prompt caching (5-min TTL)'),
  stop_sequences: z
    .array(z.string())
    .optional()
    .describe('Custom stop sequences')
})

export type WorkbenchSettings = z.infer<typeof workbenchSettingsSchema>

/**
 * Complete workbench test execution request
 */
export const workbenchTestSchema = z.object({
  processor_id: z.string().uuid('Invalid processor ID'),
  system_prompt: z.string().optional(),
  file_content: z.string().optional(),
  file_type: z
    .enum(['text/plain', 'application/pdf'])
    .optional()
    .describe('MIME type for document'),
  conversation_history: z
    .array(conversationMessageSchema)
    .default([])
    .describe('Previous conversation turns'),
  new_prompt: z
    .string()
    .min(1, 'Prompt cannot be empty')
    .describe('Current user prompt'),
  settings: workbenchSettingsSchema
})

export type WorkbenchTestInput = z.infer<typeof workbenchTestSchema>

/**
 * Workbench test execution response
 */
export const workbenchTestResponseSchema = z.object({
  execution_id: z.string().uuid(),  // For real-time subscription
  response: z.string(),
  thinking_blocks: z.array(z.any()).optional(),
  citations: z.array(z.any()).optional(),
  tokensUsed: z.object({
    input: z.number(),
    output: z.number(),
    cached_read: z.number().optional(),
    cached_write: z.number().optional(),
    total: z.number()
  }),
  executionTime: z.number(),
  timestamp: z.string()
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
