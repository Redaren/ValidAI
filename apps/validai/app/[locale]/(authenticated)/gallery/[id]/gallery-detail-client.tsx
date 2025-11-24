"use client"

import { useState } from "react"
import {
  useGalleryDetail,
  useCreateGalleryArea,
  useUpdateGalleryArea,
  useDeleteGalleryArea,
  useAddProcessorsToArea,
  type GalleryArea,
} from "@/app/queries/galleries"
import { GalleryHeader } from "@/components/galleries/gallery-header"
import { CreateGalleryAreaDialog } from "@/components/galleries/create-gallery-area-dialog"
import { EditGalleryAreaDialog } from "@/components/galleries/edit-gallery-area-dialog"
import { DeleteGalleryAreaDialog } from "@/components/galleries/delete-gallery-area-dialog"
import { AddProcessorsToAreaDialog } from "@/components/galleries/add-processors-to-area-dialog"
import { AreasWithProcessors } from "@/components/galleries/areas-with-processors"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@playze/shared-ui"
import { ArrowLeft, MoreHorizontal, FolderPlus, Plus, Pencil, Trash2 } from "lucide-react"
import { Link } from "@/lib/i18n/navigation"
import { useTranslations } from 'next-intl'
import * as LucideIcons from 'lucide-react'

/**
 * Props for the GalleryDetailClient component.
 */
interface GalleryDetailClientProps {
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
 * Client Component: Gallery Detail View
 *
 * This is the main interactive component for viewing and managing a gallery.
 * It displays the gallery header, areas with their processors, and provides
 * area management functionality.
 *
 * **Features:**
 * - Displays gallery metadata (name, description, status, etc.)
 * - Shows processors grouped by areas
 * - Allows creating new areas
 * - Supports adding processors to areas
 * - Drag-and-drop for areas and processors (to be implemented)
 *
 * **Component Architecture:**
 * ```
 * GalleryDetailClient
 * ├── GalleryHeader (metadata display)
 * └── Areas & Processors Section
 *     ├── Dropdown Menu (area management)
 *     └── Areas list with processors
 * ```
 *
 * @param galleryId - UUID of the gallery to display
 * @returns The interactive gallery detail view
 */
export function GalleryDetailClient({
  galleryId,
}: GalleryDetailClientProps) {
  const t = useTranslations('galleries')
  const tCommon = useTranslations('common')
  const { data: gallery, isLoading, error } = useGalleryDetail(galleryId)
  console.log('[GalleryDetailClient] 🎨 Component render:', {
    galleryId,
    isLoading,
    hasError: !!error,
    hasGallery: !!gallery,
    galleryName: gallery?.gallery_name,
    areasCount: gallery?.areas?.length,
    areas: gallery?.areas?.map(a => ({
      areaId: a.area_id,
      areaName: a.area_name,
      processorsCount: a.processors.length
    })),
    timestamp: new Date().toISOString()
  })

  // Mutation hooks
  const createArea = useCreateGalleryArea()
  const updateArea = useUpdateGalleryArea()
  const deleteArea = useDeleteGalleryArea()
  const addProcessors = useAddProcessorsToArea()

  // Dialog state
  const [isCreateAreaDialogOpen, setIsCreateAreaDialogOpen] = useState(false)
  const [isAddProcessorsDialogOpen, setIsAddProcessorsDialogOpen] = useState(false)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [editingArea, setEditingArea] = useState<GalleryArea | null>(null)
  const [deletingArea, setDeletingArea] = useState<GalleryArea | null>(null)

  // Handlers
  const handleCreateArea = (data: any) => {
    createArea.mutate(data, {
      onSuccess: () => {
        setIsCreateAreaDialogOpen(false)
      },
    })
  }

  const handleUpdateArea = (data: any) => {
    if (!editingArea) return
    updateArea.mutate(
      { areaId: editingArea.area_id, galleryId, updates: data },
      {
        onSuccess: () => {
          setEditingArea(null)
        },
      }
    )
  }

  const handleDeleteArea = () => {
    if (!deletingArea) return
    deleteArea.mutate(
      { areaId: deletingArea.area_id, galleryId },
      {
        onSuccess: () => {
          setDeletingArea(null)
        },
      }
    )
  }

  const handleAddProcessors = (processorIds: string[]) => {
    if (!selectedAreaId) return
    addProcessors.mutate(
      {
        input: {
          gallery_area_id: selectedAreaId,
          processor_ids: processorIds,
        },
        galleryId,
      },
      {
        onSuccess: () => {
          setIsAddProcessorsDialogOpen(false)
          setSelectedAreaId(null)
        },
      }
    )
  }

  // Get the selected area for the add processors dialog
  const selectedArea = gallery?.areas?.find(a => a.area_id === selectedAreaId) || null

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
        <div className="text-destructive">Failed to load gallery</div>
        <Button asChild variant="outline">
          <Link href="/gallery">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Galleries
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6">
      {/* Gallery Header */}
      <GalleryHeader gallery={gallery} />

      {/* Areas & Processors */}
      <div className="space-y-4 rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Areas & Processors</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More options">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsCreateAreaDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Create Area
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Areas List */}
        {(gallery.areas?.length ?? 0) === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
            <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
              <LucideIcons.FolderOpen className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No areas yet</h3>
              <p className="mb-4 mt-2 text-sm text-muted-foreground">
                Create areas to organize processors by themes like Sales, HR, or Compliance.
              </p>
              <Button onClick={() => setIsCreateAreaDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Create Area
              </Button>
            </div>
          </div>
        ) : (
          <AreasWithProcessors
            gallery={gallery}
            onAddProcessorsClick={(areaId) => {
              setSelectedAreaId(areaId)
              setIsAddProcessorsDialogOpen(true)
            }}
            onEditAreaClick={(areaId) => {
              const area = gallery.areas?.find(a => a.area_id === areaId)
              setEditingArea(area || null)
            }}
            onDeleteAreaClick={(areaId) => {
              const area = gallery.areas?.find(a => a.area_id === areaId)
              setDeletingArea(area || null)
            }}
          />
        )}
      </div>

      {/* Dialogs */}
      <CreateGalleryAreaDialog
        open={isCreateAreaDialogOpen}
        onOpenChange={setIsCreateAreaDialogOpen}
        galleryId={galleryId}
        onCreate={handleCreateArea}
        isLoading={createArea.isPending}
      />

      <EditGalleryAreaDialog
        open={!!editingArea}
        onOpenChange={(open) => !open && setEditingArea(null)}
        area={editingArea}
        onUpdate={handleUpdateArea}
        isLoading={updateArea.isPending}
      />

      <DeleteGalleryAreaDialog
        open={!!deletingArea}
        onOpenChange={(open) => !open && setDeletingArea(null)}
        area={deletingArea}
        onDelete={handleDeleteArea}
        isLoading={deleteArea.isPending}
      />

      <AddProcessorsToAreaDialog
        open={isAddProcessorsDialogOpen}
        onOpenChange={(open) => {
          setIsAddProcessorsDialogOpen(open)
          if (!open) setSelectedAreaId(null)
        }}
        area={selectedArea}
        onAdd={handleAddProcessors}
        isLoading={addProcessors.isPending}
      />

      {/* TODO: Add drag-and-drop for areas and processors */}
    </div>
  )
}
