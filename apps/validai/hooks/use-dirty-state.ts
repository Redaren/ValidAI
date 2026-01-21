/**
 * Dirty State Detection Hook
 *
 * @module hooks/use-dirty-state
 * @description
 * Compares current processor state with the loaded snapshot to detect unsaved changes.
 * Returns isDirty boolean indicating if there are changes that haven't been saved.
 *
 * @since Version Management UI Redesign
 */

'use client'

import { useMemo } from 'react'
import type { ProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import type { PlaybookSnapshot } from '@/app/queries/playbook-snapshots'

/**
 * Deep comparison utility for checking if two values are equal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false

  if (typeof a === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((item, index) => deepEqual(item, b[index]))
    }

    if (Array.isArray(a) || Array.isArray(b)) return false

    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)

    if (aKeys.length !== bKeys.length) return false

    return aKeys.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
  }

  return false
}

/**
 * Normalize operation data for comparison
 * Removes fields that aren't relevant for dirty checking
 */
function normalizeOperation(op: {
  name: string
  description: string | null
  operation_type: string
  prompt: string
  position: number
  area: string | null
  configuration: unknown | null
  output_schema: unknown | null
}): object {
  return {
    name: op.name,
    description: op.description || null,
    operation_type: op.operation_type,
    prompt: op.prompt,
    position: op.position,
    area: op.area || '',
    configuration: op.configuration || null,
    output_schema: op.output_schema || null,
  }
}

/**
 * Hook to detect if the processor has unsaved changes compared to loaded snapshot
 *
 * @param processor - Current processor state from useProcessorDetail
 * @param loadedSnapshot - The snapshot that's currently loaded (or null if new/no version)
 * @returns isDirty boolean and optional details about what changed
 *
 * @example
 * ```tsx
 * const { isDirty } = useDirtyState(processor, loadedSnapshot)
 *
 * // Show warning if dirty
 * if (isDirty) {
 *   return <Badge>Unsaved changes</Badge>
 * }
 * ```
 */
export function useDirtyState(
  processor: ProcessorDetail | undefined,
  loadedSnapshot: PlaybookSnapshot | null | undefined
): {
  isDirty: boolean
  hasLoadedVersion: boolean
} {
  return useMemo(() => {
    // If no processor, not dirty
    if (!processor) {
      return { isDirty: false, hasLoadedVersion: false }
    }

    // If no loaded snapshot, we're working on a new/unsaved processor
    // Consider dirty if there are any operations (there's work to save)
    if (!loadedSnapshot) {
      return {
        isDirty: processor.operations?.length > 0,
        hasLoadedVersion: false,
      }
    }

    const snapshotData = loadedSnapshot.snapshot

    // Compare system_prompt
    const currentSystemPrompt = processor.system_prompt || null
    const snapshotSystemPrompt = snapshotData.processor.system_prompt || null
    if (currentSystemPrompt !== snapshotSystemPrompt) {
      return { isDirty: true, hasLoadedVersion: true }
    }

    // Compare configuration
    if (!deepEqual(processor.configuration, snapshotData.processor.configuration)) {
      return { isDirty: true, hasLoadedVersion: true }
    }

    // Compare area_configuration (if it's stored in the snapshot)
    const snapshotAreaConfig = (snapshotData.processor as { area_configuration?: unknown }).area_configuration
    if (snapshotAreaConfig !== undefined && !deepEqual(processor.area_configuration, snapshotAreaConfig)) {
      return { isDirty: true, hasLoadedVersion: true }
    }

    // Compare operations
    const currentOps = processor.operations || []
    const snapshotOps = snapshotData.operations || []

    if (currentOps.length !== snapshotOps.length) {
      return { isDirty: true, hasLoadedVersion: true }
    }

    // Normalize and compare each operation
    const normalizedCurrent = currentOps.map(normalizeOperation)
    const normalizedSnapshot = snapshotOps.map(normalizeOperation)

    if (!deepEqual(normalizedCurrent, normalizedSnapshot)) {
      return { isDirty: true, hasLoadedVersion: true }
    }

    return { isDirty: false, hasLoadedVersion: true }
  }, [processor, loadedSnapshot])
}
