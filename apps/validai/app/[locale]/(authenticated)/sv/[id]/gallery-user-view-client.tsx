"use client"

import { useGalleryDetail } from "@/app/queries/galleries"
import { Button } from "@playze/shared-ui"
import { ArrowLeft, Play } from "lucide-react"
import { Link } from "@/lib/i18n/navigation"
import { useTranslations } from 'next-intl'
import * as LucideIcons from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

/**
 * Props for the GalleryUserViewClient component.
 */
interface GalleryUserViewClientProps {
  /** The UUID of the gallery to display */
  galleryId: string
}

// Get icon component by name
function getIconComponent(iconName: string) {
  if (!iconName) return null
  const pascalName = iconName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return (LucideIcons as any)[pascalName] || null
}

/**
 * Client Component: Gallery User View
 *
 * This is the public-facing gallery view for end users. It provides a
 * clean, read-only interface to browse processors organized by areas
 * and initiate runs.
 *
 * **Features:**
 * - Clean, read-only interface
 * - Processors organized by areas
 * - Click processor to view details and run
 * - No management controls (edit, delete, etc.)
 * - Shows only published processors
 *
 * @param galleryId - UUID of the gallery to display
 * @returns The gallery user view interface
 */
export function GalleryUserViewClient({
  galleryId,
}: GalleryUserViewClientProps) {
  const t = useTranslations('galleries')
  const tCommon = useTranslations('common')
  const { data: gallery, isLoading, error } = useGalleryDetail(galleryId)

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading gallery...</div>
      </div>
    )
  }

  if (error || !gallery) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <div className="text-destructive">Gallery not available</div>
        <Button asChild variant="outline">
          <Link href="/gallery">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Galleries
          </Link>
        </Button>
      </div>
    )
  }

  const IconComponent = gallery.gallery_icon ? getIconComponent(gallery.gallery_icon) : null

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Gallery Header */}
      <div className="space-y-4 rounded-lg border bg-card p-6">
        {/* Back button */}
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/gallery">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Galleries
            </Link>
          </Button>
        </div>

        {/* Title and Icon */}
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
            {IconComponent ? (
              <IconComponent className="h-8 w-8" />
            ) : (
              <LucideIcons.LayoutGrid className="h-8 w-8" />
            )}
          </div>

          {/* Name and Description */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{gallery.gallery_name}</h1>

            {gallery.gallery_description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {gallery.gallery_description}
              </p>
            )}

            {/* Metadata */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <div>
                {gallery.areas?.length ?? 0} {(gallery.areas?.length ?? 0) === 1 ? 'area' : 'areas'}
              </div>
              <div>•</div>
              <div>
                {gallery.areas?.reduce((sum, area) => sum + area.processors.length, 0) ?? 0} processors
              </div>
              {gallery.gallery_updated_at && (
                <>
                  <div>•</div>
                  <div>
                    Updated {formatDistanceToNow(new Date(gallery.gallery_updated_at), { addSuffix: true })}
                  </div>
                </>
              )}
            </div>

            {/* Tags */}
            {gallery.gallery_tags && gallery.gallery_tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {gallery.gallery_tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Areas & Processors */}
      {(gallery.areas?.length ?? 0) === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
          <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
            <LucideIcons.FolderOpen className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No processors available</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This gallery doesn't have any processors yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {gallery.areas?.map((area) => {
            const AreaIconComponent = area.area_icon ? getIconComponent(area.area_icon) : null
            // Only show published processors
            const publishedProcessors = area.processors.filter(
              p => p.processor_status === 'published'
            )

            // Skip areas with no published processors
            if (publishedProcessors.length === 0) return null

            return (
              <div
                key={area.area_id}
                className="rounded-lg border bg-card p-6 space-y-4"
              >
                {/* Area Header */}
                <div className="flex items-start gap-3">
                  {/* Area Icon */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                    {AreaIconComponent ? (
                      <AreaIconComponent className="h-6 w-6" />
                    ) : (
                      <LucideIcons.Folder className="h-6 w-6" />
                    )}
                  </div>

                  {/* Area Name and Description */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold">{area.area_name}</h2>
                    {area.area_description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {area.area_description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Processors Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {publishedProcessors.map((processor) => (
                    <Link
                      key={processor.processor_id}
                      href={`/proc/${processor.processor_id}`}
                      className="group relative flex flex-col rounded-lg border bg-card p-4 hover:bg-accent/50 hover:border-accent-foreground/20 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        {/* Run Icon Button */}
                        <Button
                          variant="default"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          asChild
                        >
                          <span>
                            <Play className="h-4 w-4" />
                            <span className="sr-only">Run {processor.processor_name}</span>
                          </span>
                        </Button>

                        {/* Processor Name and Description */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <h3 className="font-medium group-hover:text-accent-foreground transition-colors">
                            {processor.processor_name}
                          </h3>
                          {processor.processor_usage_description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {processor.processor_usage_description}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
