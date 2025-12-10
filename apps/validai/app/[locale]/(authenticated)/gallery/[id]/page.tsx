import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createServerClient } from '@playze/shared-auth/server'
import { createQueryClient } from '@/lib/query-client'
import { GalleryDetailClient } from './gallery-detail-client'
import { transformGalleryData } from '@/app/queries/galleries'
import { notFound } from 'next/navigation'

/**
 * Props for the GalleryDetailPage component.
 */
interface GalleryDetailPageProps {
  /** Dynamic route parameters containing the gallery ID */
  params: Promise<{
    /** The gallery UUID from the URL path */
    id: string
  }>
}

/**
 * Server Component: Gallery Detail Page
 *
 * This is the main server component for the `/gallery/[id]` route. It implements
 * server-side data prefetching to improve initial page load performance.
 *
 * **Architecture Pattern:**
 * - Server Component (RSC) - Handles data prefetching
 * - Uses TanStack Query for cache hydration
 * - Delegates interactivity to GalleryDetailClient (client component)
 *
 * **Data Flow:**
 * 1. Server prefetches gallery data via Supabase RPC
 * 2. Data is dehydrated into HydrationBoundary state
 * 3. Client component rehydrates the cache immediately
 * 4. No loading state flicker on initial render
 *
 * **Error Handling:**
 * - Returns 404 if gallery doesn&apos;t exist
 * - Returns 404 if user lacks access permissions
 *
 * @param params - Route parameters containing gallery ID
 * @returns Server-rendered gallery detail page with prefetched data
 */
export default async function GalleryDetailPage({
  params,
}: GalleryDetailPageProps) {
  const { id } = await params
  const queryClient = createQueryClient()
  const supabase = await createServerClient()

  // Prefetch gallery data
  try {
    await queryClient.prefetchQuery({
      queryKey: ['gallery', id],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_gallery_detail', {
          p_gallery_id: id,
        })

        if (error || !data || data.length === 0) {
          throw new Error('Gallery not found')
        }

        // ✅ Transform data to match client cache expectations
        try {
          const transformed = transformGalleryData(data as any)
          return transformed
        } catch (transformError) {
          throw transformError
        }
      },
    })
  } catch (error) {
    // If prefetch fails, the gallery doesn&apos;t exist or user doesn&apos;t have access
    notFound()
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GalleryDetailClient galleryId={id} />
    </HydrationBoundary>
  )
}
