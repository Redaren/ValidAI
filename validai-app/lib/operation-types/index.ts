/**
 * Operation Type Configuration System
 *
 * Central registry of all operation types with their schemas and metadata.
 * Used by workbench UI and Edge Function to determine execution strategy.
 *
 * @module lib/operation-types
 */

import type { OperationTypeConfig, OperationType } from './types'
import { validationOutputSchema, genericOutputSchema } from './schemas'

/**
 * Operation Type Registry
 *
 * Defines all available operation types with their configurations.
 * Each operation type specifies how it should be executed and validated.
 *
 * @constant OPERATION_TYPES
 */
export const OPERATION_TYPES: Record<OperationType, OperationTypeConfig> = {
  /**
   * Generic Operation Type
   *
   * Flexible, unstructured text generation.
   * Uses generateText() for free-form responses.
   * No schema validation - accepts any output format.
   */
  generic: {
    id: 'generic',
    displayName: 'Generic',
    description: 'Free-form text generation without structured output constraints',
    icon: '📝',
    useStructuredOutput: false,
    schema: genericOutputSchema,
    promptGuidance: 'Write a prompt that describes what you want the LLM to analyze or generate. The response will be unstructured text.'
  },

  /**
   * Validation Operation Type
   *
   * Binary true/false validation with reasoning.
   * Uses generateObject() with strict boolean + comment schema.
   * Perfect for compliance checks, requirement verification, etc.
   */
  validation: {
    id: 'validation',
    displayName: 'True / False',
    description: 'Binary validation that returns true/false with supporting reasoning',
    icon: '✓✗',
    useStructuredOutput: true,
    schema: validationOutputSchema,
    promptGuidance: 'Ask a yes/no question that requires validation. Example: "Does this document meet GDPR requirements?"'
  },

  /**
   * Future: Extraction Operation Type
   *
   * Structured data extraction from documents.
   * Will use generateObject() with custom schema per operation.
   */
  extraction: {
    id: 'extraction',
    displayName: 'Extraction',
    description: 'Extract specific structured data fields from documents',
    icon: '🔍',
    useStructuredOutput: false, // Set to true when implementing
    schema: null, // TODO: Add extraction schema
    promptGuidance: 'Specify what data fields to extract. Example: "Extract company name, address, and founding date."'
  },

  /**
   * Future: Rating Operation Type
   *
   * Numerical scoring with qualitative feedback.
   * Will use generateObject() with rating schema.
   */
  rating: {
    id: 'rating',
    displayName: 'Rating',
    description: 'Score content on a numerical scale with reasoning',
    icon: '⭐',
    useStructuredOutput: false, // Set to true when implementing
    schema: null, // TODO: Add rating schema
    promptGuidance: 'Define rating criteria and scale. Example: "Rate document quality on a scale of 1-10."'
  },

  /**
   * Future: Classification Operation Type
   *
   * Categorization with confidence scores.
   * Will use generateObject() with classification schema.
   */
  classification: {
    id: 'classification',
    displayName: 'Classification',
    description: 'Assign content to predefined categories with confidence scores',
    icon: '🏷️',
    useStructuredOutput: false, // Set to true when implementing
    schema: null, // TODO: Add classification schema
    promptGuidance: 'List possible categories. Example: "Classify as: Contract, Invoice, Report, or Other."'
  },

  /**
   * Future: Analysis Operation Type
   *
   * Comprehensive structured analysis.
   * Will use generateObject() with analysis schema.
   */
  analysis: {
    id: 'analysis',
    displayName: 'Analysis',
    description: 'Generate structured analytical insights with key findings',
    icon: '📊',
    useStructuredOutput: false, // Set to true when implementing
    schema: null, // TODO: Add analysis schema
    promptGuidance: 'Specify analysis dimensions. Example: "Analyze risks, opportunities, and recommendations."'
  }
}

/**
 * Get operation type configuration by ID
 *
 * @param operationType - Operation type enum value
 * @returns Operation type configuration
 */
export function getOperationTypeConfig(operationType: OperationType): OperationTypeConfig {
  return OPERATION_TYPES[operationType]
}

/**
 * Get all operation type configurations as array
 *
 * @returns Array of all operation type configs
 */
export function getAllOperationTypes(): OperationTypeConfig[] {
  return Object.values(OPERATION_TYPES)
}

/**
 * Check if operation type uses structured output
 *
 * @param operationType - Operation type enum value
 * @returns True if operation uses generateObject, false if generateText
 */
export function usesStructuredOutput(operationType: OperationType): boolean {
  return OPERATION_TYPES[operationType].useStructuredOutput
}

// Re-export types and schemas for convenience
export type { OperationType, OperationTypeConfig, StructuredOutputResult } from './types'
export { validationOutputSchema, genericOutputSchema } from './schemas'
export type { ValidationOutput } from './schemas'
