/**
 * TanStack Query hooks for processor runs
 *
 * @module app/queries/runs
 * @description
 * Provides React Query hooks for managing processor runs and operation results.
 * Implements real-time subscriptions for live progress updates during execution.
 *
 * **Features:**
 * - Create new processor runs via Edge Function
 * - Fetch run details with real-time updates
 * - Fetch operation results for a run
 * - List all runs for a processor
 * - Real-time subscriptions for live progress tracking
 *
 * **Architecture:**
 * - Uses Edge Function invoke for run creation (execute-processor-run)
 * - Uses PostgREST for data fetching (runs, operation_results tables)
 * - Uses Supabase Realtime for live updates during processing
 *
 * @since Phase 1.8
 */

'use client'

import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import { useEffect } from 'react'
import type { Database } from '@playze/shared-types'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

/**
 * Hook to create a new processor run
 *
 * Invokes the execute-processor-run Edge Function which:
 * 1. Creates a frozen snapshot of the processor state (or uses existing snapshot)
 * 2. Creates a run record in the database
 * 3. Triggers background execution
 * 4. Returns immediately with run_id (HTTP 202)
 *
 * **Run source options:**
 * - processor_id only: Uses live processor data (draft mode)
 * - processor_id + use_published_snapshot: Uses processor's active published snapshot
 * - playbook_snapshot_id only: Uses snapshot directly (portal/gallery runs)
 *
 * **Document options:**
 * - document_id: Existing document in validai_documents (Storage)
 * - file_upload: Direct upload (base64, no Storage)
 *
 * @returns Mutation hook for creating runs
 *
 * @example Draft run (live data)
 * ```tsx
 * const createRun = useCreateRun()
 * const { run_id } = await createRun.mutateAsync({
 *   processor_id: 'uuid',
 *   file_upload: { ... }
 * })
 * ```
 *
 * @example Published run (from snapshot)
 * ```tsx
 * const createRun = useCreateRun()
 * const { run_id } = await createRun.mutateAsync({
 *   processor_id: 'uuid',
 *   use_published_snapshot: true,
 *   file_upload: { ... }
 * })
 * ```
 *
 * @example Gallery run (direct from snapshot)
 * ```tsx
 * const createRun = useCreateRun()
 * const { run_id } = await createRun.mutateAsync({
 *   playbook_snapshot_id: 'uuid',
 *   file_upload: { ... }
 * })
 * ```
 */
export function useCreateRun() {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      // Run source options (one required)
      processor_id?: string
      use_published_snapshot?: boolean
      playbook_snapshot_id?: string
      // Document options (one required)
      document_id?: string
      file_upload?: {
        file: string           // base64 encoded
        filename: string
        mime_type: string
        size_bytes: number
      }
    }) => {
      // Validate run source: either processor_id or playbook_snapshot_id
      if (!params.processor_id && !params.playbook_snapshot_id) {
        throw new Error('Either processor_id or playbook_snapshot_id is required')
      }

      if (params.processor_id && params.playbook_snapshot_id) {
        throw new Error('Cannot provide both processor_id and playbook_snapshot_id')
      }

      // Validate document: either document_id or file_upload
      if (!params.document_id && !params.file_upload) {
        throw new Error('Either document_id or file_upload is required')
      }

      if (params.document_id && params.file_upload) {
        throw new Error('Cannot provide both document_id and file_upload')
      }

      const { data, error } = await supabase.functions.invoke('execute-processor-run', {
        body: params,
      })

      if (error) {
        throw new Error(error.message || 'Failed to create processor run')
      }
      return data as { run_id: string; status: string; message: string }
    },
    onSuccess: (data, variables) => {
      // Invalidate processor runs list
      if (variables.processor_id) {
        queryClient.invalidateQueries({
          queryKey: ['processor-runs', variables.processor_id],
        })
      }
    },
  })
}

/**
 * Hook to fetch a single run with real-time updates
 *
 * Fetches run details and subscribes to real-time updates for live progress tracking.
 * Automatically refetches when run status changes from processing to completed/failed.
 *
 * @param runId - UUID of the run to fetch
 * @param options - Query options
 * @returns Query hook with run data
 *
 * @example
 * ```tsx
 * const { data: run } = useRun(runId)
 *
 * if (run?.status === 'processing') {
 *   // Show progress bar
 * }
 * ```
 */
export function useRun(
  runId: string | undefined,
  options?: {
    /** Enable real-time subscriptions (default: true) */
    realtime?: boolean
    /** Refetch interval in ms (default: none when realtime enabled) */
    refetchInterval?: number
  }
) {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()
  const enableRealtime = options?.realtime !== false

  const query = useQuery({
    queryKey: ['run', runId],
    queryFn: async () => {
      if (!runId) throw new Error('Run ID is required')

      const { data, error } = await supabase.from('validai_runs').select('*').eq('id', runId).single()

      if (error) throw error
      return data as Run
    },
    enabled: !!runId,
    refetchInterval: options?.refetchInterval,
  })

  // Real-time subscription for live updates
  useEffect(() => {
    if (!runId || !enableRealtime) return

    const channel = supabase
      .channel(`run:${runId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'validai_runs',
          filter: `id=eq.${runId}`,
        },
        () => {
          // Refetch run data when updated
          queryClient.invalidateQueries({ queryKey: ['run', runId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [runId, enableRealtime, supabase, queryClient])

  return query
}

/**
 * Hook to fetch operation results for a run with real-time updates
 *
 * Fetches all operation results for a run ordered by execution order.
 * Subscribes to real-time updates for new results and status changes.
 *
 * @param runId - UUID of the run
 * @param options - Query options
 * @returns Query hook with operation results array
 *
 * @example
 * ```tsx
 * const { data: results } = useOperationResults(runId)
 *
 * results?.map(result => (
 *   <div key={result.id}>
 *     {result.operation_snapshot.name}: {result.status}
 *   </div>
 * ))
 * ```
 */
export function useOperationResults(
  runId: string | undefined,
  options?: {
    /** Enable real-time subscriptions (default: true) */
    realtime?: boolean
  }
) {
  const supabase = createBrowserClient()
  const queryClient = useQueryClient()
  const enableRealtime = options?.realtime !== false

  const query = useQuery({
    queryKey: ['operation-results', runId],
    queryFn: async () => {
      if (!runId) throw new Error('Run ID is required')

      const { data, error } = await supabase
        .from('validai_operation_results')
        .select('*')
        .eq('run_id', runId)
        .order('execution_order', { ascending: true })

      if (error) throw error
      return data as OperationResult[]
    },
    enabled: !!runId,
  })

  // Real-time subscription for live updates
  useEffect(() => {
    if (!runId || !enableRealtime) return

    const channel = supabase
      .channel(`operation-results:${runId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT and UPDATE
          schema: 'public',
          table: 'validai_operation_results',
          filter: `run_id=eq.${runId}`,
        },
        () => {
          // Refetch operation results when updated
          queryClient.invalidateQueries({ queryKey: ['operation-results', runId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [runId, enableRealtime, supabase, queryClient])

  return query
}

/**
 * Hook to fetch all runs for a processor
 *
 * Fetches runs ordered by start time (newest first).
 * Used for the runs list page.
 *
 * **Performance:** Defaults to 50 most recent runs to prevent performance degradation.
 * Use `limit` option to override (e.g., for testing or admin views).
 *
 * @param processorId - UUID of the processor
 * @param options - Query options
 * @returns Query hook with runs array
 *
 * @example
 * ```tsx
 * // Default: 50 most recent runs
 * const { data: runs } = useProcessorRuns(processorId)
 *
 * // Custom limit
 * const { data: runs } = useProcessorRuns(processorId, { limit: 100 })
 *
 * runs?.map(run => (
 *   <Link key={run.id} href={`/proc/${processorId}/runs/${run.id}`}>
 *     {run.snapshot.document.name} - {run.status}
 *   </Link>
 * ))
 * ```
 */
export function useProcessorRuns(
  processorId: string | undefined,
  options?: {
    /** Limit number of runs returned (default: 50) */
    limit?: number
  }
) {
  const supabase = createBrowserClient()
  const limit = options?.limit ?? 50 // Default to 50 most recent runs

  return useQuery({
    queryKey: ['processor-runs', processorId, limit],
    queryFn: async () => {
      if (!processorId) throw new Error('Processor ID is required')

      const { data, error } = await supabase
        .from('validai_runs')
        .select('*')
        .eq('processor_id', processorId)
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as Run[]
    },
    enabled: !!processorId,
  })
}

/**
 * Hook to fetch multiple runs by IDs (for comparison)
 *
 * Fetches multiple runs in parallel using useQueries.
 * Used for the run comparison feature.
 *
 * @param runIds - Array of run UUIDs to fetch
 * @returns Object with runs array and loading/error states
 *
 * @example
 * ```tsx
 * const { runs, isLoading, isError } = useMultipleRuns(['id1', 'id2', 'id3'])
 *
 * runs?.map(run => (
 *   <div key={run.id}>{run.snapshot.document.name}</div>
 * ))
 * ```
 */
export function useMultipleRuns(runIds: string[]) {
  const supabase = createBrowserClient()

  const queries = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: ['run', runId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('validai_runs')
          .select('*')
          .eq('id', runId)
          .single()

        if (error) throw error
        return data as Run
      },
      enabled: !!runId,
    })),
  })

  return {
    runs: queries.map((q) => q.data).filter(Boolean) as Run[],
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    errors: queries.map((q) => q.error).filter(Boolean),
  }
}

/**
 * Hook to fetch operation results for multiple runs (for comparison)
 *
 * Fetches operation results for multiple runs in parallel using useQueries.
 * Used for the run comparison feature.
 *
 * @param runIds - Array of run UUIDs
 * @returns Object with results map (runId -> OperationResult[]) and loading/error states
 *
 * @example
 * ```tsx
 * const { resultsMap, isLoading } = useMultipleRunResults(['id1', 'id2'])
 *
 * // Access results for specific run
 * const run1Results = resultsMap['id1']
 * ```
 */
export function useMultipleRunResults(runIds: string[]) {
  const supabase = createBrowserClient()

  const queries = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: ['operation-results', runId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('validai_operation_results')
          .select('*')
          .eq('run_id', runId)
          .order('execution_order', { ascending: true })

        if (error) throw error
        return { runId, results: data as OperationResult[] }
      },
      enabled: !!runId,
    })),
  })

  // Convert array to map for easier lookup
  const resultsMap: Record<string, OperationResult[]> = {}
  queries.forEach((query) => {
    if (query.data) {
      resultsMap[query.data.runId] = query.data.results
    }
  })

  return {
    resultsMap,
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    errors: queries.map((q) => q.error).filter(Boolean),
  }
}
