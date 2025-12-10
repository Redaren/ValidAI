import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createServerClient } from '@playze/shared-auth/server'
import { createQueryClient } from '@/lib/query-client'
import { GalleryUserViewClient } from './gallery-user-view-client'
import { notFound } from 'next/navigation'
import { transformGalleryData } from '@/app/queries/galleries'

/**
 * Props for the GalleryUserViewPage component.
 */
interface GalleryUserViewPageProps {
  /** Dynamic route parameters containing the gallery ID */
  params: Promise<{
    /** The gallery UUID from the URL path */
    id: string
  }>
}

/**
 * Server Component: Gallery User View Page
 *
 * This is the public-facing gallery page where end users can browse
 * processors organized by areas and initiate runs. This page is read-only
 * and focused on making it easy to find and use processors.
 *
 * **Architecture Pattern:**
 * - Server Component (RSC) - Handles data prefetching
 * - Uses TanStack Query for cache hydration
 * - Delegates interactivity to GalleryUserViewClient (client component)
 *
 * **Access Control:**
 * - Shows galleries in all statuses (draft, published, archived) for preview
 * - Only shows published processors
 * - Respects organization visibility settings
 *
 * @param params - Route parameters containing gallery ID
 * @returns Server-rendered gallery user view page with prefetched data
 */
export default async function GalleryUserViewPage({
  params,
}: GalleryUserViewPageProps) {
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

        // Transform flat database rows into nested structure with areas and processors
        return transformGalleryData(data as any)
      },
    })
  } catch (error) {
    // If prefetch fails, the gallery doesn&apos;t exist or user doesn&apos;t have access
    notFound()
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GalleryUserViewClient galleryId={id} />
    </HydrationBoundary>
  )
}
