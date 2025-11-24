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
 * - Returns 404 if gallery doesn't exist
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
    console.log('[ServerPage] 🚀 Starting server prefetch for gallery:', id)

    await queryClient.prefetchQuery({
      queryKey: ['gallery', id],
      queryFn: async () => {
        console.log('[ServerPage] 🔄 Fetching from RPC:', id)

        const { data, error } = await supabase.rpc('get_gallery_detail', {
          p_gallery_id: id,
        })

        console.log('[ServerPage] 📦 Server RPC returned:', {
          galleryId: id,
          rowCount: data?.length || 0,
          hasError: !!error,
        })

        if (error || !data || data.length === 0) {
          console.error('[ServerPage] ❌ Server prefetch failed:', error)
          throw new Error('Gallery not found')
        }

        // ✅ Transform data to match client cache expectations
        try {
          console.log('[ServerPage] 🔧 About to transform data...')
          const transformed = transformGalleryData(data as any)
          console.log('[ServerPage] ✅ Server transformed gallery:', {
            galleryId: transformed.gallery_id,
            galleryName: transformed.gallery_name,
            areasCount: transformed.areas.length,
          })
          return transformed
        } catch (transformError) {
          console.error('[ServerPage] ❌ Transform failed!', {
            error: transformError,
            errorMessage: transformError instanceof Error ? transformError.message : String(transformError),
            errorStack: transformError instanceof Error ? transformError.stack : undefined,
            dataLength: data?.length,
            firstRow: data?.[0]
          })
          throw transformError
        }
      },
    })

    console.log('[ServerPage] ✅ Server prefetch completed')
  } catch (error) {
    console.error('[ServerPage] ❌ Prefetch error, returning 404:', error)
    // If prefetch fails, the gallery doesn't exist or user doesn't have access
    notFound()
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GalleryDetailClient galleryId={id} />
    </HydrationBoundary>
  )
}
