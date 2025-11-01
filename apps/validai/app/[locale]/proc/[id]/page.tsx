import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createServerClient } from '@playze/shared-auth/server'
import { createQueryClient } from '@/lib/query-client'
import { ProcessorDetailClient } from './processor-detail-client'
import { notFound } from 'next/navigation'

/**
 * Props for the ProcessorDetailPage component.
 */
interface ProcessorDetailPageProps {
  /** Dynamic route parameters containing the processor ID */
  params: Promise<{
    /** The processor UUID from the URL path */
    id: string
  }>
}

/**
 * Server Component: Processor Detail Page
 *
 * This is the main server component for the `/proc/[id]` route. It implements
 * server-side data prefetching to improve initial page load performance.
 *
 * **Architecture Pattern:**
 * - Server Component (RSC) - Handles data prefetching
 * - Uses TanStack Query for cache hydration
 * - Delegates interactivity to ProcessorDetailClient (client component)
 *
 * **Data Flow:**
 * 1. Server prefetches processor data via Supabase RPC
 * 2. Data is dehydrated into HydrationBoundary state
 * 3. Client component rehydrates the cache immediately
 * 4. No loading state flicker on initial render
 *
 * **Error Handling:**
 * - Returns 404 if processor doesn't exist
 * - Returns 404 if user lacks access permissions
 *
 * @param params - Route parameters containing processor ID
 * @returns Server-rendered processor detail page with prefetched data
 */
export default async function ProcessorDetailPage({
  params,
}: ProcessorDetailPageProps) {
  const { id } = await params
  const queryClient = createQueryClient()
  const supabase = await createServerClient()

  // Prefetch processor data
  try {
    await queryClient.prefetchQuery({
      queryKey: ['processor', id],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_processor_with_operations', {
          p_processor_id: id,
        })

        if (error || !data || data.length === 0) {
          throw new Error('Processor not found')
        }

        return data[0]
      },
    })
  } catch (error) {
    // If prefetch fails, the processor doesn't exist or user doesn't have access
    notFound()
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProcessorDetailClient processorId={id} />
    </HydrationBoundary>
  )
}