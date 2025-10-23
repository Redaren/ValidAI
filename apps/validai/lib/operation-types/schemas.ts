/**
 * Operation Output Schemas
 *
 * Defines Zod schemas for structured outputs from different operation types.
 * These schemas are used by Vercel AI SDK's generateObject() to validate
 * and structure LLM responses.
 *
 * @module lib/operation-types/schemas
 */

import { z } from 'zod'

/**
 * Validation (True/False) Output Schema
 *
 * Used for binary validation operations that return a boolean result
 * with supporting reasoning.
 *
 * @example
 * {
 *   result: true,
 *   comment: "The document meets all required criteria because..."
 * }
 */
export const validationOutputSchema = z.object({
  result: z.boolean().describe('The validation result (true/false)'),
  comment: z.string().describe('Reasoning and explanation for the decision')
})

/**
 * Generic Output Schema
 *
 * Null schema for generic operations that don't use structured output.
 * These operations use generateText() instead of generateObject().
 */
export const genericOutputSchema = null

/**
 * Extraction Output Schema
 *
 * For structured data extraction operations.
 * Extracts array of items with explanatory context.
 *
 * @example
 * {
 *   items: ["Item 1", "Item 2", "Item 3"],
 *   comment: "Extracted all payment terms from Section 3..."
 * }
 */
export const extractionOutputSchema = z.object({
  items: z.array(z.string()).describe('Array of extracted items'),
  comment: z.string().describe('Context and explanation of extraction')
})

/**
 * Rating Output Schema
 *
 * For scoring and rating operations.
 * Returns numeric value with qualitative feedback.
 *
 * @example
 * {
 *   value: 8.5,
 *   comment: "Document scored 8.5/10 because it demonstrates..."
 * }
 */
export const ratingOutputSchema = z.object({
  value: z.number().describe('Numerical rating value'),
  comment: z.string().describe('Rationale and explanation for rating')
})

/**
 * Classification Output Schema
 *
 * For categorization operations.
 * Assigns content to categories with reasoning.
 *
 * @example
 * {
 *   classification: "Contract - Employment Agreement",
 *   comment: "Classified as employment agreement due to..."
 * }
 */
export const classificationOutputSchema = z.object({
  classification: z.string().describe('Assigned category or classification'),
  comment: z.string().describe('Reasoning for classification decision')
})

/**
 * Analysis Output Schema
 *
 * For comprehensive analysis operations.
 * Provides structured analytical conclusion with supporting detail.
 *
 * @example
 * {
 *   conclusion: "Document meets compliance requirements with minor issues",
 *   comment: "Detailed analysis reveals: 1) All required sections present..."
 * }
 */
export const analysisOutputSchema = z.object({
  conclusion: z.string().describe('Main analytical conclusion'),
  comment: z.string().describe('Supporting analysis and detailed explanation')
})

/**
 * Traffic Light Output Schema
 *
 * For risk assessment operations with red/yellow/green status indicators.
 * Provides visual status with explanatory reasoning.
 *
 * @example
 * {
 *   traffic_light: "red",
 *   comment: "High risk identified due to missing liability clauses and insufficient insurance coverage..."
 * }
 */
export const trafficLightOutputSchema = z.object({
  traffic_light: z.enum(['red', 'yellow', 'green']).describe('Traffic light status indicator (red=high risk, yellow=medium risk, green=low risk)'),
  comment: z.string().describe('Explanation for the traffic light status')
})

/**
 * TypeScript types inferred from schemas
 */
export type ValidationOutput = z.infer<typeof validationOutputSchema>
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>
export type RatingOutput = z.infer<typeof ratingOutputSchema>
export type ClassificationOutput = z.infer<typeof classificationOutputSchema>
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>
export type TrafficLightOutput = z.infer<typeof trafficLightOutputSchema>
