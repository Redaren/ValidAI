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
 * Future: Extraction Output Schema
 *
 * For structured data extraction operations.
 * Will extract specific fields from documents.
 */
// export const extractionOutputSchema = z.object({
//   extracted_data: z.record(z.string(), z.any()).describe('Extracted key-value pairs'),
//   confidence: z.number().min(0).max(1).describe('Confidence score for extraction')
// })

/**
 * Future: Rating Output Schema
 *
 * For scoring and rating operations.
 * Returns numeric scores with qualitative feedback.
 */
// export const ratingOutputSchema = z.object({
//   score: z.number().describe('Numerical score'),
//   max_score: z.number().optional().describe('Maximum possible score'),
//   rationale: z.string().describe('Explanation of the rating'),
//   strengths: z.array(z.string()).optional().describe('Positive aspects'),
//   improvements: z.array(z.string()).optional().describe('Areas for improvement')
// })

/**
 * Future: Classification Output Schema
 *
 * For categorization operations.
 * Assigns content to predefined categories.
 */
// export const classificationOutputSchema = z.object({
//   category: z.string().describe('Assigned category'),
//   confidence: z.number().min(0).max(1).describe('Classification confidence'),
//   reasoning: z.string().describe('Why this category was chosen'),
//   alternative_categories: z.array(z.object({
//     category: z.string(),
//     confidence: z.number()
//   })).optional().describe('Other possible categories')
// })

/**
 * Future: Analysis Output Schema
 *
 * For comprehensive analysis operations.
 * Provides structured analytical insights.
 */
// export const analysisOutputSchema = z.object({
//   summary: z.string().describe('High-level summary'),
//   key_findings: z.array(z.string()).describe('Main insights'),
//   details: z.record(z.string(), z.any()).optional().describe('Detailed analysis sections'),
//   recommendations: z.array(z.string()).optional().describe('Suggested actions')
// })

/**
 * TypeScript types inferred from schemas
 */
export type ValidationOutput = z.infer<typeof validationOutputSchema>
// export type ExtractionOutput = z.infer<typeof extractionOutputSchema>
// export type RatingOutput = z.infer<typeof ratingOutputSchema>
// export type ClassificationOutput = z.infer<typeof classificationOutputSchema>
// export type AnalysisOutput = z.infer<typeof analysisOutputSchema>
