// MARK: CMS PATTERN - Dynamic route for serving published CMS pages
import { notFound } from 'next/navigation'
import { BlockRenderer } from '../components/BlockRenderer'

interface PageProps {
  params: Promise<{
    slug: string[]
  }>
}

async function getPageBySlug(slug: string) {
  try {
    // Fetch page from Payload API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/api/pages?where[slug][equals]=${slug}&depth=2`,
      {
        cache: 'no-store', // Always fetch fresh data in development
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    // Check if page exists and is published
    if (!data.docs || data.docs.length === 0) {
      return null
    }

    const page = data.docs[0]

    // Only show published pages
    if (page._status !== 'published') {
      return null
    }

    return page
  } catch (error) {
    console.error('Error fetching page:', error)
    return null
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { slug: slugArray } = await params
  const slug = slugArray?.join('/') || 'home'
  const page = await getPageBySlug(slug)

  if (!page) {
    return {
      title: 'Page Not Found',
    }
  }

  return {
    title: page.meta?.title || page.title,
    description: page.meta?.description || '',
  }
}

export default async function DynamicPage({ params }: PageProps) {
  // Await params to get the slug array (Next.js 15 requirement)
  const { slug: slugArray } = await params
  // Join slug array to create the full slug
  // e.g., ['products', 'item-1'] becomes 'products/item-1'
  const slug = slugArray?.join('/') || 'home'

  const page = await getPageBySlug(slug)

  if (!page) {
    notFound()
  }

  return (
    <main className="min-h-screen">
      {/* Render page title if needed */}
      {page.title && slug !== 'home' && (
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold mb-8">{page.title}</h1>
        </div>
      )}

      {/* Render blocks if they exist */}
      {page.blocks && page.blocks.length > 0 && (
        <BlockRenderer blocks={page.blocks} />
      )}

      {/* Render legacy content field if no blocks */}
      {(!page.blocks || page.blocks.length === 0) && page.content && (
        <div className="container mx-auto px-4 py-8">
          <div className="prose max-w-none">
            {/* This is simplified - in production you'd want to properly render the rich text */}
            <div dangerouslySetInnerHTML={{ __html: JSON.stringify(page.content) }} />
          </div>
        </div>
      )}
    </main>
  )
}