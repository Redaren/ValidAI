/**
 * Operation Type Configuration System
 *
 * Central registry of all operation types with their schemas and metadata.
 * Used by workbench UI and Edge Function to determine execution strategy.
 *
 * @module lib/operation-types
 */

import type { OperationTypeConfig, OperationType } from './types'
import {
  validationOutputSchema,
  genericOutputSchema,
  extractionOutputSchema,
  ratingOutputSchema,
  classificationOutputSchema,
  analysisOutputSchema,
  trafficLightOutputSchema
} from './schemas'

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
    promptGuidance: 'Ask a yes/no question that requires validation. Example: "Does this document have confidentiality clauses?"'
  },

  /**
   * Extraction Operation Type
   *
   * Structured data extraction from documents.
   * Uses generateObject() with array + comment schema.
   */
  extraction: {
    id: 'extraction',
    displayName: 'Extraction',
    description: 'Extract specific structured information from documents',
    icon: '🔍',
    useStructuredOutput: true,
    schema: extractionOutputSchema,
    promptGuidance: 'Specify what items to extract as a list. Example: "Extract all company names mentioned in the document."'
  },

  /**
   * Rating Operation Type
   *
   * Numerical scoring with qualitative feedback.
   * Uses generateObject() with value + comment schema.
   */
  rating: {
    id: 'rating',
    displayName: 'Rating',
    description: 'Score content on a numerical scale with reasoning',
    icon: '⭐',
    useStructuredOutput: true,
    schema: ratingOutputSchema,
    promptGuidance: 'Define rating criteria and scale. Example: "Rate document quality on a scale of 1-10 based on clarity and completeness."'
  },

  /**
   * Classification Operation Type
   *
   * Categorization with reasoning.
   * Uses generateObject() with classification + comment schema.
   */
  classification: {
    id: 'classification',
    displayName: 'Classification',
    description: 'Assign content to predefined categories with confidence scores',
    icon: '🏷️',
    useStructuredOutput: true,
    schema: classificationOutputSchema,
    promptGuidance: 'List possible categories. Example: "Classify this document as: Contract, Invoice, Report, or Other."'
  },

  /**
   * Analysis Operation Type
   *
   * Comprehensive structured analysis.
   * Uses generateObject() with conclusion + comment schema.
   */
  analysis: {
    id: 'analysis',
    displayName: 'Analysis',
    description: 'Generate structured analytical insights with key findings',
    icon: '📊',
    useStructuredOutput: true,
    schema: analysisOutputSchema,
    promptGuidance: 'Specify analysis dimensions. Example: "Analyze the document for legal risks, compliance issues, and recommendations."'
  },

  /**
   * Traffic Light Operation Type
   *
   * Risk assessment with red/yellow/green status indicators.
   * Uses generateObject() with traffic_light + comment schema.
   */
  traffic_light: {
    id: 'traffic_light',
    displayName: 'Traffic Light',
    description: 'Risk assessment with red/yellow/green status indicator',
    icon: '🚦',
    useStructuredOutput: true,
    schema: trafficLightOutputSchema,
    promptGuidance: 'Define risk criteria for red (high risk), yellow (medium risk), green (low risk). Example: "Assess contract risk level based on liability, payment terms, and compliance."'
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
export {
  validationOutputSchema,
  genericOutputSchema,
  extractionOutputSchema,
  ratingOutputSchema,
  classificationOutputSchema,
  analysisOutputSchema,
  trafficLightOutputSchema
} from './schemas'
export type {
  ValidationOutput,
  ExtractionOutput,
  RatingOutput,
  ClassificationOutput,
  AnalysisOutput,
  TrafficLightOutput
} from './schemas'
