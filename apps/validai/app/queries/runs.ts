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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTypedBrowserClient } from '@/lib/supabase/typed-clients'
import { useEffect } from 'react'
import type { Database } from '@/lib/database.types'

type Run = Database['public']['Tables']['runs']['Row']
type OperationResult = Database['public']['Tables']['operation_results']['Row']

/**
 * Hook to create a new processor run
 *
 * Invokes the execute-processor-run Edge Function which:
 * 1. Creates a frozen snapshot of the processor state
 * 2. Creates a run record in the database
 * 3. Triggers background execution
 * 4. Returns immediately with run_id (HTTP 202)
 *
 * @returns Mutation hook for creating runs
 *
 * @example
 * ```tsx
 * const createRun = useCreateRun()
 *
 * const handleRun = async () => {
 *   const { run_id } = await createRun.mutateAsync({
 *     processor_id: 'uuid',
 *     document_id: 'uuid'
 *   })
 *   router.push(`/proc/${processor_id}/runs/${run_id}`)
 * }
 * ```
 */
export function useCreateRun() {
  const supabase = createTypedBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      processor_id,
      document_id,
    }: {
      processor_id: string
      document_id: string
    }) => {
      const { data, error } = await supabase.functions.invoke('execute-processor-run', {
        body: { processor_id, document_id },
      })

      if (error) {
        throw new Error(error.message || 'Failed to create processor run')
      }
      return data as { run_id: string; status: string; message: string }
    },
    onSuccess: (data, variables) => {
      // Invalidate processor runs list
      queryClient.invalidateQueries({
        queryKey: ['processor-runs', variables.processor_id],
      })
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
  const supabase = createTypedBrowserClient()
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
  const supabase = createTypedBrowserClient()
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
 * @param processorId - UUID of the processor
 * @param options - Query options
 * @returns Query hook with runs array
 *
 * @example
 * ```tsx
 * const { data: runs } = useProcessorRuns(processorId)
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
    /** Limit number of runs returned */
    limit?: number
  }
) {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['processor-runs', processorId, options?.limit],
    queryFn: async () => {
      if (!processorId) throw new Error('Processor ID is required')

      let query = supabase
        .from('validai_runs')
        .select('*')
        .eq('processor_id', processorId)
        .order('started_at', { ascending: false })

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Run[]
    },
    enabled: !!processorId,
  })
}
