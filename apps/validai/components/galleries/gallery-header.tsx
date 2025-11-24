"use client"

import { useState } from "react"
import { Link, useRouter } from "@/lib/i18n/navigation"
import { GalleryDetail } from "@/app/queries/galleries"
import * as LucideIcons from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import {
  Eye,
  LayoutGrid,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
} from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface GalleryHeaderProps {
  gallery: GalleryDetail
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
 * Gallery Header Component
 *
 * Displays the gallery's main information including:
 * - Icon, name, and description
 * - Status and visibility badges
 * - Creator and last updated information
 * - Tags
 * - Action buttons (Edit, View, Delete)
 *
 * @param gallery - The gallery detail data
 */
export function GalleryHeader({ gallery }: GalleryHeaderProps) {
  const t = useTranslations('galleries.header')
  const router = useRouter()
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  const IconComponent = gallery.gallery_icon ? getIconComponent(gallery.gallery_icon) : null
  const VisibilityIcon = gallery.gallery_visibility === "personal" ? Lock : Users

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      {/* Title, Icon, and Action Buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Icon */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
            {IconComponent ? (
              <IconComponent className="h-8 w-8" />
            ) : (
              <LayoutGrid className="h-8 w-8" />
            )}
          </div>

          {/* Name and Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{gallery.gallery_name}</h1>
              <Badge
                variant={gallery.gallery_status === 'published' ? 'default' : gallery.gallery_status === 'archived' ? 'secondary' : 'outline'}
                className={cn(
                  'text-xs',
                  gallery.gallery_status === 'draft' && 'border-yellow-600/50 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50',
                  gallery.gallery_status === 'archived' && 'text-muted-foreground'
                )}
              >
                {gallery.gallery_status === 'draft' && 'Draft'}
                {gallery.gallery_status === 'published' && 'Published'}
                {gallery.gallery_status === 'archived' && 'Archived'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <VisibilityIcon className="mr-1 h-3 w-3" />
                {gallery.gallery_visibility === 'personal' ? 'Personal' : 'Organization'}
              </Badge>
            </div>

            {gallery.gallery_description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {gallery.gallery_description}
              </p>
            )}

            {/* Metadata */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <div>
                Created by {gallery.gallery_creator_name || 'Unknown'}
              </div>
              {gallery.gallery_updated_at && (
                <>
                  <div>•</div>
                  <div>
                    Updated {formatDistanceToNow(new Date(gallery.gallery_updated_at), { addSuffix: true })}
                  </div>
                </>
              )}
              <div>•</div>
              <div>
                {gallery.areas?.length ?? 0} {(gallery.areas?.length ?? 0) === 1 ? 'area' : 'areas'}
              </div>
              <div>•</div>
              <div>
                {gallery.areas?.reduce((sum, area) => sum + area.processors.length, 0) ?? 0} processors
              </div>
            </div>

            {/* Tags */}
            {gallery.gallery_tags && gallery.gallery_tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {gallery.gallery_tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {gallery.gallery_status === 'published' && (
            <Button variant="default" asChild>
              <Link href={`/sv/${gallery.gallery_id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Gallery
              </Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/gallery/${gallery.gallery_id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Settings
                </Link>
              </DropdownMenuItem>
              {gallery.gallery_status === 'published' && (
                <DropdownMenuItem asChild>
                  <Link href={`/sv/${gallery.gallery_id}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    View as User
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Gallery
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
