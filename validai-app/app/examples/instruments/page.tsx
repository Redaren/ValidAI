import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createTypedServerClient } from '@/lib/supabase/typed-clients'
import { getInstruments } from '@/app/queries/instruments/get-instruments'
import { createQueryClient } from '@/lib/query-client'
import { InstrumentsClient } from './instruments-client'

export default async function ModernInstrumentsPage() {
  const queryClient = createQueryClient()
  const supabase = await createTypedServerClient()

  // Prefetch data on server
  await queryClient.prefetchQuery({
    queryKey: ['instruments'],
    queryFn: () => getInstruments(supabase),
  })

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Modern Instruments (TanStack Query)</h1>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <InstrumentsClient />
      </HydrationBoundary>
    </div>
  )
}