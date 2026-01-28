/**
 * TanStack Query hooks for playbook snapshots
 *
 * @module app/queries/playbook-snapshots
 * @description
 * Provides React Query hooks for managing playbook/processor publishing workflow.
 * Enables publishing, unpublishing, and visibility management of playbook snapshots.
 *
 * **Features:**
 * - Publish processors as frozen snapshots
 * - Unpublish/republish without deleting data
 * - Update snapshot visibility (private, organization, public)
 * - List all snapshots for a processor
 * - Fetch snapshot details for running from published version
 *
 * **Architecture:**
 * - Uses RPC functions for all operations (SECURITY DEFINER)
 * - Snapshots are immutable once created
 * - Visibility controls access for portal/gallery features
 *
 * @since Phase 2.0 - Publish Workflow
 */

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

/**
 * Visibility options for playbook snapshots
 */
export type PlaybookVisibility = 'private' | 'organization' | 'public'

/**
 * Snapshot metadata returned from queries
 */
export interface PlaybookSnapshotMeta {
  id: string
  version_number: number
  visibility: PlaybookVisibility
  is_published: boolean
  operation_count: number
  published_at: string
  unpublished_at: string | null
  created_at: string
  created_by?: string
  created_by_name?: string | null
}

/**
 * Full snapshot data including configuration
 */
export interface PlaybookSnapshot {
  id: string
  processor_id: string | null
  creator_organization_id: string
  name: string
  description: string | null
  version_number: number
  visibility: PlaybookVisibility
  is_published: boolean
  snapshot: {
    processor: {
      id: string
      name: string
      description: string | null
      system_prompt: string | null
      configuration: Record<string, unknown> | null
    }
    operations: Array<{
      id: string
      name: string
      description: string | null
      operation_type: string
      prompt: string
      position: number
      area: string | null
      configuration: Record<string, unknown> | null
      output_schema: Record<string, unknown> | null
    }>
  }
  published_at: string
  created_at: string
}

/**
 * Hook to publish a processor as a frozen snapshot
 *
 * Creates a new version of the playbook snapshot with the current processor
 * and operations state. Auto-unpublishes any existing published snapshot
 * for the same processor (enforcing one published per processor).
 *
 * @returns Mutation hook for publishing
 *
 * @example
 * ```tsx
 * const publishPlaybook = usePublishPlaybook()
 *
 * const handlePublish = async () => {
 *   const result = await publishPlaybook.mutateAsync({
 *     processorId: 'uuid',
 *     visibility: 'organization'
 *   })
 *   console.log(`Published v${result.version_number}`)
 * }
 * ```
 */
export function usePublishPlaybook() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      processorId: string
      visibility?: PlaybookVisibility
    }) => {
      const { data, error } = await supabase.rpc('publish_playbook', {
        p_processor_id: params.processorId,
        p_visibility: params.visibility || 'private',
      })

      if (error) {
        logger.error('Failed to publish playbook:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to publish playbook')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        snapshot_id: string
        version_number: number
        operation_count: number
        message: string
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ['published-snapshot', variables.processorId],
      })
      queryClient.invalidateQueries({
        queryKey: ['processor-snapshots', variables.processorId],
      })
      queryClient.invalidateQueries({
        queryKey: ['processor-detail', variables.processorId],
      })
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })
    },
    onError: (error) => {
      logger.error('Publish playbook mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to unpublish a snapshot (hide without deleting)
 *
 * Sets is_published to false on the snapshot.
 * The snapshot data is preserved for potential republishing.
 *
 * @returns Mutation hook for unpublishing
 *
 * @example
 * ```tsx
 * const unpublishPlaybook = useUnpublishPlaybook()
 *
 * const handleUnpublish = async () => {
 *   await unpublishPlaybook.mutateAsync(snapshotId)
 * }
 * ```
 */
export function useUnpublishPlaybook() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const { data, error } = await supabase.rpc('unpublish_playbook', {
        p_snapshot_id: snapshotId,
      })

      if (error) {
        logger.error('Failed to unpublish playbook:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to unpublish playbook')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        success: boolean
        message: string
      }
    },
    onSuccess: () => {
      // Invalidate all processor and snapshot queries
      queryClient.invalidateQueries({ queryKey: ['published-snapshot'] })
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['processor-detail'] })
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })
    },
    onError: (error) => {
      logger.error('Unpublish playbook mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to republish a previously unpublished snapshot
 *
 * Sets is_published back to true on the target snapshot.
 * Auto-unpublishes any other published snapshot for the same processor.
 * No new snapshot is created - uses the existing snapshot data.
 *
 * @returns Mutation hook for republishing
 *
 * @example
 * ```tsx
 * const republishPlaybook = useRepublishPlaybook()
 *
 * const handleRepublish = async () => {
 *   await republishPlaybook.mutateAsync(snapshotId)
 * }
 * ```
 */
export function useRepublishPlaybook() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const { data, error } = await supabase.rpc('republish_playbook', {
        p_snapshot_id: snapshotId,
      })

      if (error) {
        logger.error('Failed to republish playbook:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to republish playbook')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        success: boolean
        message: string
      }
    },
    onSuccess: () => {
      // Invalidate all processor and snapshot queries
      queryClient.invalidateQueries({ queryKey: ['published-snapshot'] })
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['processor-detail'] })
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })
    },
    onError: (error) => {
      logger.error('Republish playbook mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to update visibility of a published snapshot
 *
 * Changes who can see and run the snapshot:
 * - private: Only creator organization
 * - organization: All members of creator organization
 * - public: Anyone with app access (portal phase)
 *
 * @returns Mutation hook for updating visibility
 *
 * @example
 * ```tsx
 * const updateVisibility = useUpdatePlaybookVisibility()
 *
 * const handleVisibilityChange = async () => {
 *   await updateVisibility.mutateAsync({
 *     snapshotId: 'uuid',
 *     visibility: 'organization'
 *   })
 * }
 * ```
 */
export function useUpdatePlaybookVisibility() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      snapshotId: string
      visibility: PlaybookVisibility
    }) => {
      const { data, error } = await supabase.rpc('update_playbook_visibility', {
        p_snapshot_id: params.snapshotId,
        p_visibility: params.visibility,
      })

      if (error) {
        logger.error('Failed to update playbook visibility:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to update visibility')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        success: boolean
        message: string
      }
    },
    onSuccess: () => {
      // Invalidate snapshot queries
      queryClient.invalidateQueries({ queryKey: ['published-snapshot'] })
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['playbook-snapshot'] })
    },
    onError: (error) => {
      logger.error('Update visibility mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Snapshot data for dirty state comparison
 * Only includes fields needed for comparing processor state
 */
export interface SnapshotForComparison {
  id: string
  processor_id: string | null
  version_number: number
  snapshot: {
    processor: {
      id: string
      name: string
      description: string | null
      system_prompt: string | null
      configuration: Record<string, unknown> | null
      area_configuration?: Record<string, unknown> | null
    }
    operations: Array<{
      id: string
      name: string
      description: string | null
      operation_type: string
      prompt: string
      position: number
      area: string | null
      configuration: Record<string, unknown> | null
      output_schema: Record<string, unknown> | null
    }>
  }
}

/**
 * Published snapshot data for a processor
 */
export interface PublishedSnapshotMeta {
  id: string
  version_number: number
  visibility: PlaybookVisibility
  published_at: string
}

/**
 * Hook to fetch the published snapshot for a processor
 *
 * Returns the currently published snapshot metadata, or null if none.
 * Uses the new architecture where snapshot table is source of truth.
 *
 * @param processorId - UUID of the processor
 * @returns Query hook with published snapshot or null
 *
 * @example
 * ```tsx
 * const { data: publishedSnapshot } = usePublishedSnapshot(processorId)
 *
 * const hasPublishedVersion = !!publishedSnapshot
 * if (publishedSnapshot) {
 *   console.log(`Published v${publishedSnapshot.version_number}`)
 * }
 * ```
 */
export function usePublishedSnapshot(processorId: string | undefined) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['published-snapshot', processorId],
    queryFn: async () => {
      if (!processorId) return null

      const { data, error } = await supabase
        .from('validai_playbook_snapshots')
        .select('id, version_number, visibility, published_at')
        .eq('processor_id', processorId)
        .eq('is_published', true)
        .maybeSingle() // Returns null if not found, no error

      if (error) {
        logger.error('Failed to fetch published snapshot:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to fetch published snapshot')
      }

      return data as PublishedSnapshotMeta | null
    },
    enabled: !!processorId,
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Hook to fetch all snapshots for a processor
 *
 * Returns version history with metadata (no full snapshot data).
 * Only accessible by creator organization.
 *
 * @param processorId - UUID of the processor
 * @returns Query hook with snapshot list
 *
 * @example
 * ```tsx
 * const { data: snapshots } = useProcessorSnapshots(processorId)
 *
 * snapshots?.map(snap => (
 *   <div key={snap.id}>
 *     Version {snap.version_number} - {snap.visibility}
 *   </div>
 * ))
 * ```
 */
export function useProcessorSnapshots(processorId: string | undefined) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['processor-snapshots', processorId],
    queryFn: async () => {
      if (!processorId) throw new Error('Processor ID is required')

      const { data, error } = await supabase.rpc('get_processor_snapshots', {
        p_processor_id: processorId,
      })

      if (error) {
        logger.error('Failed to fetch processor snapshots:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to fetch snapshots')
      }

      return (data || []) as PlaybookSnapshotMeta[]
    },
    enabled: !!processorId,
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Hook to fetch a single snapshot by ID
 *
 * Returns full snapshot data including processor config and operations.
 * Respects visibility rules.
 *
 * @param snapshotId - UUID of the snapshot
 * @returns Query hook with snapshot data
 *
 * @example
 * ```tsx
 * const { data: snapshot } = usePlaybookSnapshot(snapshotId)
 *
 * // Access frozen configuration
 * const operations = snapshot?.snapshot.operations
 * ```
 */
export function usePlaybookSnapshot(snapshotId: string | undefined) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['playbook-snapshot', snapshotId],
    queryFn: async () => {
      if (!snapshotId) throw new Error('Snapshot ID is required')

      const { data, error } = await supabase.rpc('get_playbook_snapshot', {
        p_snapshot_id: snapshotId,
      })

      if (error) {
        logger.error('Failed to fetch playbook snapshot:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to fetch snapshot')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      if (!result) {
        throw new Error('Snapshot not found or access denied')
      }

      return result as PlaybookSnapshot
    },
    enabled: !!snapshotId,
    staleTime: 60 * 1000, // 1 minute (snapshots are immutable)
  })
}

/**
 * Hook to fetch a snapshot for dirty state comparison
 *
 * Unlike usePlaybookSnapshot (which uses RPC for published access),
 * this queries the table directly to work with ANY snapshot including
 * unpublished versions. This is safe because:
 * - RLS enforces we can only access our organization's snapshots
 * - The snapshot belongs to our processor (we control loaded_snapshot_id)
 *
 * @param snapshotId - UUID of the snapshot
 * @returns Query hook with snapshot data for comparison
 *
 * @example
 * ```tsx
 * const { data: loadedSnapshot } = useSnapshotForComparison(processor?.loaded_snapshot_id)
 *
 * // Use for dirty state comparison
 * const { isDirty } = useDirtyState(processor, loadedSnapshot)
 * ```
 */
export function useSnapshotForComparison(snapshotId: string | undefined) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['snapshot-comparison', snapshotId],
    queryFn: async () => {
      if (!snapshotId) return null

      const { data, error } = await supabase
        .from('validai_playbook_snapshots')
        .select('id, processor_id, snapshot, version_number')
        .eq('id', snapshotId)
        .maybeSingle()

      if (error) {
        logger.error('Failed to fetch snapshot for comparison:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to fetch snapshot')
      }

      return data as SnapshotForComparison | null
    },
    enabled: !!snapshotId,
    staleTime: 60 * 1000, // 1 minute (snapshots are immutable)
  })
}

/**
 * Hook to save current processor state as a new version (without publishing)
 *
 * Creates a new snapshot from the current processor and operations state.
 * Does NOT publish the version - use useSetPublishedVersion to publish.
 * Sets loaded_snapshot_id to track the saved version.
 *
 * @returns Mutation hook for saving version
 *
 * @example
 * ```tsx
 * const saveAsVersion = useSaveAsVersion()
 *
 * const handleSave = async () => {
 *   const result = await saveAsVersion.mutateAsync({
 *     processorId: 'uuid',
 *     visibility: 'organization'
 *   })
 *   console.log(`Saved as v${result.version_number}`)
 * }
 * ```
 */
export function useSaveAsVersion() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      processorId: string
      visibility?: PlaybookVisibility
    }) => {
      const { data, error } = await supabase.rpc('save_as_version', {
        p_processor_id: params.processorId,
        p_visibility: params.visibility || 'private',
      })

      if (error) {
        logger.error('Failed to save version:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to save version')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        snapshot_id: string
        version_number: number
        operation_count: number
        message: string
      }
    },
    onSuccess: async (data, variables) => {
      // Await processor refetch first - this updates loaded_snapshot_id
      await queryClient.invalidateQueries({
        queryKey: ['processor', variables.processorId],
      })
      // Then await snapshots refetch
      await queryClient.invalidateQueries({
        queryKey: ['processor-snapshots', variables.processorId],
      })
      // Now invalidate snapshot comparison - will fetch with new loaded_snapshot_id
      queryClient.invalidateQueries({
        queryKey: ['snapshot-comparison', data.snapshot_id],
      })
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })
    },
    onError: (error) => {
      logger.error('Save version mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to load a snapshot version into the processor editor
 *
 * Replaces the current processor configuration and operations with
 * the data from the specified snapshot. Sets loaded_snapshot_id.
 *
 * @returns Mutation hook for loading snapshot
 *
 * @example
 * ```tsx
 * const loadSnapshot = useLoadSnapshot()
 *
 * const handleLoad = async () => {
 *   await loadSnapshot.mutateAsync({
 *     processorId: 'uuid',
 *     snapshotId: 'uuid'
 *   })
 * }
 * ```
 */
export function useLoadSnapshot() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      processorId: string
      snapshotId: string
    }) => {
      const { data, error } = await supabase.rpc('load_snapshot', {
        p_processor_id: params.processorId,
        p_snapshot_id: params.snapshotId,
      })

      if (error) {
        logger.error('Failed to load snapshot:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to load snapshot')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        success: boolean
        message: string
        version_number: number
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate processor queries to reload data
      queryClient.invalidateQueries({
        queryKey: ['processor', variables.processorId],
      })
      queryClient.invalidateQueries({
        queryKey: ['processor-snapshots', variables.processorId],
      })
      // Invalidate snapshot comparison queries (for dirty state)
      queryClient.invalidateQueries({
        queryKey: ['snapshot-comparison'],
      })
    },
    onError: (error) => {
      logger.error('Load snapshot mutation failed:', extractErrorDetails(error))
    },
  })
}

/**
 * Hook to toggle publish status on an existing snapshot
 *
 * When publishing: auto-unpublishes any other published snapshot for the processor.
 * When unpublishing: clears the active_snapshot_id and sets processor to draft.
 *
 * @returns Mutation hook for setting published version
 *
 * @example
 * ```tsx
 * const setPublishedVersion = useSetPublishedVersion()
 *
 * // Publish a version
 * await setPublishedVersion.mutateAsync({ snapshotId: 'uuid', publish: true })
 *
 * // Unpublish
 * await setPublishedVersion.mutateAsync({ snapshotId: 'uuid', publish: false })
 * ```
 */
export function useSetPublishedVersion() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      snapshotId: string
      publish: boolean
      processorId?: string // For cache invalidation
    }) => {
      const { data, error } = await supabase.rpc('set_published_version', {
        p_snapshot_id: params.snapshotId,
        p_publish: params.publish,
      })

      if (error) {
        logger.error('Failed to set published version:', extractErrorDetails(error))
        throw new Error(error.message || 'Failed to set published version')
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) ? data[0] : data

      return result as {
        success: boolean
        message: string
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate all processor and snapshot queries
      queryClient.invalidateQueries({ queryKey: ['published-snapshot'] })
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['processor'] })
      queryClient.invalidateQueries({ queryKey: ['user-processors'] })
      if (variables.processorId) {
        queryClient.invalidateQueries({
          queryKey: ['processor', variables.processorId],
        })
      }
    },
    onError: (error) => {
      logger.error('Set published version mutation failed:', extractErrorDetails(error))
    },
  })
}
