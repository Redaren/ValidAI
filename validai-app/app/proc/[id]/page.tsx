import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { createQueryClient } from '@/lib/query-client'
import { ProcessorDetailClient } from './processor-detail-client'
import { notFound } from 'next/navigation'

interface ProcessorDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProcessorDetailPage({
  params,
}: ProcessorDetailPageProps) {
  const { id } = await params
  const queryClient = createQueryClient()
  const supabase = await createClient()

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