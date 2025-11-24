/**
 * Bulk Operations Import Hook
 *
 * TanStack Query mutation for bulk importing operations with area creation.
 * Handles creating new areas and operations, updating existing operations,
 * and managing positions.
 *
 * @module app/queries/operations/use-bulk-operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { createBrowserClient } from '@playze/shared-auth/client'
import type { BulkOperationRow } from '@/lib/validations'
import type { ProcessorDetail } from '../processors/use-processor-detail'

/**
 * Import mode for each operation
 */
export type ImportMode = 'create' | 'update'

/**
 * Operation to import with its mode
 */
export interface OperationToImport {
  operation: BulkOperationRow
  mode: ImportMode
}

/**
 * Payload for bulk import mutation
 */
export interface BulkImportMutationPayload {
  processorId: string
  operations: OperationToImport[]
  newAreas: string[]
}

/**
 * Result of bulk import mutation
 */
export interface BulkImportResult {
  areasCreated: number
  operationsCreated: number
  operationsUpdated: number
  totalOperations: number
}

/**
 * Hook for bulk importing operations
 *
 * This mutation:
 * 1. Creates new areas (if any) with sequential display_order
 * 2. Groups operations by area
 * 3. For each area, imports operations with sequential positions (1, 2, 3...)
 * 4. Creates or updates operations based on mode
 * 5. Sets required = false for all imported operations
 * 6. Invalidates processor cache to refresh UI
 *
 * @example
 * ```tsx
 * const bulkImport = useBulkImportOperations()
 *
 * const handleImport = () => {
 *   bulkImport.mutate({
 *     processorId,
 *     operations: [
 *       { operation: {...}, mode: 'create' },
 *       { operation: {...}, mode: 'update' },
 *     ],
 *     newAreas: ['Analysis', 'Summary'],
 *   })
 * }
 * ```
 */
export function useBulkImportOperations() {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async (payload: BulkImportMutationPayload): Promise<BulkImportResult> => {
      const { processorId, operations, newAreas } = payload
      let areasCreated = 0
      let operationsCreated = 0
      let operationsUpdated = 0

      // Step 1: Fetch processor to get organization_id and area_configuration
      const { data: processor, error: fetchProcessorError } = await supabase
        .from('validai_processors')
        .select('organization_id, area_configuration')
        .eq('id', processorId)
        .single()

      if (fetchProcessorError) throw fetchProcessorError
      if (!processor) throw new Error('Processor not found')

      const organizationId = processor.organization_id

      // Step 2: Create new areas if needed
      if (newAreas.length > 0) {
        const currentConfig = (processor?.area_configuration as ProcessorDetail['area_configuration']) || {
          areas: [],
        }
        const currentAreas = currentConfig.areas || []

        // Calculate next display_order
        const maxDisplayOrder = currentAreas.reduce(
          (max, area) => Math.max(max, area.display_order),
          0
        )

        // Add new areas with sequential display_order
        const newAreaObjects = newAreas.map((name, index) => ({
          name,
          display_order: maxDisplayOrder + index + 1,
        }))

        const updatedConfig = {
          areas: [...currentAreas, ...newAreaObjects],
        }

        // Update area configuration
        const { error: updateError } = await supabase
          .from('validai_processors')
          .update({ area_configuration: updatedConfig })
          .eq('id', processorId)

        if (updateError) throw updateError

        areasCreated = newAreas.length
      }

      // Step 3: Group operations by area and import
      const operationsByArea = new Map<string, OperationToImport[]>()
      operations.forEach(opToImport => {
        const area = opToImport.operation.area
        const existing = operationsByArea.get(area) || []
        existing.push(opToImport)
        operationsByArea.set(area, existing)
      })

      // Step 4: Import operations for each area
      for (const [area, areaOperations] of operationsByArea.entries()) {
        // Get max position in this area for new operations
        const { data: existingOps, error: fetchError } = await supabase
          .from('validai_operations')
          .select('position')
          .eq('processor_id', processorId)
          .eq('area', area)
          .order('position', { ascending: false })
          .limit(1)

        if (fetchError) throw fetchError

        const maxPosition = existingOps?.[0]?.position || 0
        let nextPosition = Number(maxPosition) + 1

        // Import each operation in order
        for (const opToImport of areaOperations) {
          const { operation, mode } = opToImport

          if (mode === 'create') {
            // Create new operation
            const { error: insertError } = await supabase
              .from('validai_operations')
              .insert({
                organization_id: organizationId,
                processor_id: processorId,
                name: operation.name,
                description: operation.description,
                operation_type: operation.operation_type,
                prompt: operation.prompt,
                area: operation.area,
                position: nextPosition,
                required: false, // Always false for imported operations
                configuration: null,
                output_schema: null,
                validation_rules: null,
              })

            if (insertError) throw insertError

            operationsCreated++
            nextPosition++ // Increment position for next operation
          } else if (mode === 'update') {
            // Update existing operation (find by name)
            const { error: updateError } = await supabase
              .from('validai_operations')
              .update({
                description: operation.description,
                operation_type: operation.operation_type,
                prompt: operation.prompt,
                area: operation.area,
                position: nextPosition,
                required: false, // Set to false even for updates
              })
              .eq('processor_id', processorId)
              .eq('name', operation.name)

            if (updateError) throw updateError

            operationsUpdated++
            nextPosition++ // Increment position for next operation
          }
        }
      }

      return {
        areasCreated,
        operationsCreated,
        operationsUpdated,
        totalOperations: operations.length,
      }
    },
    onSuccess: (result, variables) => {
      // Invalidate processor detail to refresh operations list
      queryClient.invalidateQueries({
        queryKey: ['processor', variables.processorId],
      })
    },
    onError: (error) => {
      logger.error('Failed to bulk import operations:', extractErrorDetails(error))
    },
  })
}
