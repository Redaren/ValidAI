/**
 * Transform Processor Data Utility
 *
 * Transforms flat database rows from get_processor_with_operations RPC
 * into the nested structure expected by frontend components.
 *
 * The database function returns one row per operation (flat structure),
 * but components expect a single processor object with an operations array.
 */

import { Operation, ProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

/**
 * Raw row structure returned by get_processor_with_operations RPC.
 * Each row contains both processor fields and operation fields.
 */
interface ProcessorWithOperationsRow {
  // Processor fields
  processor_id: string
  processor_name: string
  processor_description: string | null
  processor_usage_description: string | null
  processor_status: string
  processor_visibility: string
  processor_system_prompt: string | null
  processor_area_configuration: any
  processor_configuration: any
  processor_tags: string[] | null
  processor_created_at: string
  processor_updated_at: string
  processor_published_at: string | null
  processor_loaded_snapshot_id: string | null
  processor_created_by?: string
  created_by?: string
  creator_name: string | null

  // Operation fields (nullable - processor may have no operations)
  operation_id: string | null
  operation_name: string | null
  operation_description: string | null
  operation_type: string | null
  operation_prompt: string | null
  operation_output_schema: any
  operation_validation_rules: any
  operation_area: string | null
  operation_position: string | null
  operation_required: boolean | null
  operation_configuration: any
  operation_created_at?: string
  operation_updated_at?: string
}

/**
 * Transforms flat database rows into nested processor structure.
 *
 * **Input:** Array of flat rows (one per operation)
 * **Output:** Single processor object with operations array
 *
 * Handles edge cases:
 * - Processor with no operations (returns empty operations array)
 * - Processors with multiple operations (groups into array)
 * - Missing operation timestamps (uses current time as fallback)
 *
 * @param data - Flat rows from get_processor_with_operations RPC
 * @returns Processor object with nested operations array
 * @throws Error if data is empty or invalid
 *
 * @example
 * ```typescript
 * const { data } = await supabase.rpc('get_processor_with_operations', { p_processor_id: id })
 * const processor = transformProcessorData(data)
 * ```
 */
export function transformProcessorData(
  data: ProcessorWithOperationsRow[]
): ProcessorDetail {
  if (!data || data.length === 0) {
    throw new Error('No processor data to transform')
  }

  // Use first row for processor-level fields (same across all rows)
  const firstRow = data[0]

  // Extract and group all operations
  const operations: Operation[] = data
    .filter((row) => row.operation_id) // Filter out processors with no operations
    .map((row) => ({
      id: row.operation_id!,
      name: row.operation_name!,
      description: row.operation_description,
      operation_type: row.operation_type as any,
      prompt: row.operation_prompt!,
      output_schema: row.operation_output_schema,
      validation_rules: row.operation_validation_rules,
      area: row.operation_area!,
      position: parseFloat(row.operation_position!),
      required: row.operation_required!,
      configuration: row.operation_configuration,
      created_at: row.operation_created_at || new Date().toISOString(),
      updated_at: row.operation_updated_at || new Date().toISOString(),
    }))

  // Build processor object with nested operations
  const processor: ProcessorDetail = {
    processor_id: firstRow.processor_id,
    processor_name: firstRow.processor_name,
    processor_description: firstRow.processor_description,
    usage_description: firstRow.processor_usage_description,
    status: firstRow.processor_status as any,
    visibility: firstRow.processor_visibility as any,
    system_prompt: firstRow.processor_system_prompt,
    area_configuration: firstRow.processor_area_configuration,
    configuration: firstRow.processor_configuration,
    tags: firstRow.processor_tags,
    created_by: firstRow.processor_created_by || firstRow.created_by!,
    created_by_name: firstRow.creator_name,
    created_at: firstRow.processor_created_at,
    updated_at: firstRow.processor_updated_at,
    published_at: firstRow.processor_published_at,
    loaded_snapshot_id: firstRow.processor_loaded_snapshot_id,
    operations, // Always an array (empty or populated)
  }

  return processor
}
