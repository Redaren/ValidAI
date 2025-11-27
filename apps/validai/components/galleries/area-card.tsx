"use client"

import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useDroppable } from "@dnd-kit/core"
import { type GalleryArea } from "@/app/queries/galleries"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@playze/shared-ui"
import { GripVertical, MoreHorizontal, Plus, Pencil, Trash2, X } from "lucide-react"
import * as LucideIcons from 'lucide-react'
import { Link } from "@/lib/i18n/navigation"
import { ProcessorCard } from "./processor-card"

interface AreaCardProps {
  area: GalleryArea
  onAddProcessors: () => void
  onEdit: () => void
  onDelete: () => void
  onRemoveProcessor: (areaId: string, processorId: string) => void
  isDragging: boolean
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
 * Area Card - Sortable Area Container with Sortable Processors
 *
 * A draggable card representing a gallery area. The card itself can be
 * dragged to reorder areas, and processors within it can be dragged to reorder.
 */
export function AreaCard({
  area,
  onAddProcessors,
  onEdit,
  onDelete,
  onRemoveProcessor,
  isDragging,
}: AreaCardProps) {
  // Make the area sortable (for reordering areas)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isAreaDragging,
  } = useSortable({
    id: `area-${area.area_id}`,
    data: {
      type: 'area',
      areaId: area.area_id,
    }
  })

  // Make the area droppable (for receiving processors from other areas)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: area.area_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isAreaDragging ? 0.5 : 1,
  }

  /**
   * Combines both refs (sortable + droppable) into a single ref callback.
   * This allows the area to be BOTH draggable AND a drop target.
   */
  const setRefs = (node: HTMLDivElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
  }

  const IconComponent = area.area_icon ? getIconComponent(area.area_icon) : null

  // Processor IDs for sortable context
  const processorIds = area.processors.map(p => p.processor_id)

  return (
    <div
      ref={setRefs}
      style={style}
      className={`rounded-lg border bg-card/50 p-4 space-y-3 transition-colors ${
        isOver ? "ring-2 ring-primary" : ""
      } ${isAreaDragging ? "z-50" : ""}`}
    >
      {/* Area Header */}
      <div className="flex items-start justify-between bg-area-header border-b -mx-4 -mt-4 px-4 py-3 rounded-t-lg">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Drag Handle */}
          <button
            className="mt-1 cursor-grab active:cursor-grabbing touch-none"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
          </button>

          {/* Area Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            {IconComponent ? (
              <IconComponent className="h-5 w-5" />
            ) : (
              <LucideIcons.Folder className="h-5 w-5" />
            )}
          </div>

          {/* Area Name and Description */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{area.area_name}</h3>
            {area.area_description && (
              <p className="text-sm text-muted-foreground mt-1">
                {area.area_description}
              </p>
            )}
          </div>
        </div>

        {/* Area Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onAddProcessors}
            title="Add processors to this area"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Area
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Area
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Processors List */}
      {area.processors.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No processors yet. Click "Add Processors" to add some.
        </div>
      ) : (
        <SortableContext items={processorIds} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2">
            {area.processors.map((processor) => (
              <ProcessorCard
                key={processor.processor_id}
                processor={processor}
                areaId={area.area_id}
                onRemove={() => onRemoveProcessor(area.area_id, processor.processor_id)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  )
}
