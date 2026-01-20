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
 * and operations state. Updates processor status to 'published' and sets
 * the active_snapshot_id.
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
        queryKey: ['processor-detail', variables.processorId],
      })
      queryClient.invalidateQueries({
        queryKey: ['processor-snapshots', variables.processorId],
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
 * Sets is_published to false and clears active_snapshot_id on the processor.
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
      queryClient.invalidateQueries({ queryKey: ['processor-detail'] })
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
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
 * Sets is_published back to true and restores active_snapshot_id on the processor.
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
      queryClient.invalidateQueries({ queryKey: ['processor-detail'] })
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
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
      queryClient.invalidateQueries({ queryKey: ['processor-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['playbook-snapshot'] })
    },
    onError: (error) => {
      logger.error('Update visibility mutation failed:', extractErrorDetails(error))
    },
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
