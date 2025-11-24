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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import { useTranslations } from 'next-intl'
import { EditGallerySheet } from './edit-gallery-sheet'

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

// Get status color using processor header pattern
function getStatusColor(status: string) {
  switch (status) {
    case "published":
      return "bg-green-500/10 text-green-700 dark:text-green-400"
    case "draft":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
    case "archived":
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400"
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400"
  }
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
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const IconComponent = gallery.gallery_icon ? getIconComponent(gallery.gallery_icon) : null
  const VisibilityIcon = gallery.gallery_visibility === "personal" ? Lock : Users

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="space-y-4 rounded-lg border bg-card p-6"
    >
      {/* Two-column layout: Icon on left, content on right */}
      <div className="flex gap-4 items-center">
        {/* Column 1: Icon */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
          {IconComponent ? (
            <IconComponent className="h-8 w-8" />
          ) : (
            <LayoutGrid className="h-8 w-8" />
          )}
        </div>

        {/* Column 2: All content */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Row 1: Title and Action Buttons */}
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight">{gallery.gallery_name}</h1>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="default" size="icon" asChild>
                <Link href={`/sv/${gallery.gallery_id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsEditSheetOpen(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Settings
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

          {/* Row 2: CollapsibleTrigger - Status Row */}
          <CollapsibleTrigger asChild>
            <div className="flex gap-8 items-start hover:bg-accent/50 cursor-pointer transition-colors rounded-md p-2 -mx-2">
              {/* Status Badge */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('status')}</span>
                <Badge className={getStatusColor(gallery.gallery_status)}>
                  {gallery.gallery_status}
                </Badge>
              </div>

              {/* Visibility - Labeled Field */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('visibility')}</span>
                <div className="flex items-center gap-1.5 text-sm">
                  <VisibilityIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="capitalize">{gallery.gallery_visibility}</span>
                </div>
              </div>

              {/* Description */}
              {gallery.gallery_description && (
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    {gallery.gallery_description}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleTrigger>
        </div>
      </div>

      {/* CollapsibleContent: Hidden details (metadata and tags) */}
      <CollapsibleContent className="space-y-4">
        <div className="space-y-4 pt-2 border-t">
          {/* First Row: Areas, Processors, Created By, Last Updated */}
          <div className="flex gap-8 items-start">
            {/* Areas Count */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('areas')}</span>
              <span className="text-sm">
                {gallery.areas?.length ?? 0} {(gallery.areas?.length ?? 0) === 1 ? 'area' : 'areas'}
              </span>
            </div>

            {/* Processors Count */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('processors')}</span>
              <span className="text-sm">
                {gallery.areas?.reduce((sum, area) => sum + area.processors.length, 0) ?? 0}
              </span>
            </div>

            {/* Created By */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('createdBy')}</span>
              <span className="text-sm">{gallery.gallery_creator_name || 'Unknown'}</span>
            </div>

            {/* Last Updated */}
            {gallery.gallery_updated_at && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('updated')}</span>
                <span className="text-sm">
                  {formatDistanceToNow(new Date(gallery.gallery_updated_at), { addSuffix: true })}
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {gallery.gallery_tags && gallery.gallery_tags.length > 0 && (
            <div className="flex gap-8 items-start pt-2 border-t">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('tags')}</span>
                <div className="flex flex-wrap gap-2">
                  {gallery.gallery_tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>

      {/* Edit Gallery Sheet */}
      <EditGallerySheet
        gallery={gallery}
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
      />
    </Collapsible>
  )
}
