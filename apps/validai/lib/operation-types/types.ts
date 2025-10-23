/**
 * Operation Type System Types
 *
 * Type definitions for the operation type configuration system.
 * Defines the structure of operation type metadata and configurations.
 *
 * @module lib/operation-types/types
 */

import type { z } from 'zod'
import type { Database } from '@/lib/database.types'

/**
 * Operation type enum from database
 */
export type OperationType = Database['public']['Enums']['operation_type']

/**
 * Operation Type Configuration
 *
 * Defines metadata and behavior for each operation type.
 *
 * @interface OperationTypeConfig
 * @property {OperationType} id - Database enum value
 * @property {string} displayName - User-facing name
 * @property {string} description - Brief explanation of what this operation does
 * @property {string} icon - Emoji or icon for UI display
 * @property {boolean} useStructuredOutput - Whether to use generateObject vs generateText
 * @property {z.ZodSchema | null} schema - Zod schema for structured output (null for generic)
 * @property {string} promptGuidance - Template or guidance text for users creating operations
 */
export interface OperationTypeConfig {
  id: OperationType
  displayName: string
  description: string
  icon: string
  useStructuredOutput: boolean
  schema: z.ZodSchema | null
  promptGuidance: string
}

/**
 * Structured output result from LLM
 *
 * Contains both the original text response and the parsed structured data.
 * Only present when useStructuredOutput is true.
 */
export interface StructuredOutputResult {
  text?: string
  object: Record<string, unknown>
}
