"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { type GalleryProcessor } from "@/app/queries/galleries"
import { Button } from "@playze/shared-ui"
import { GripVertical, X } from "lucide-react"
import { Link } from "@/lib/i18n/navigation"

interface ProcessorCardProps {
  processor: GalleryProcessor
  areaId: string
  onRemove: () => void
}

/**
 * Processor Card - Sortable Processor Item
 *
 * A draggable card representing a processor within a gallery area.
 * Can be dragged to reorder processors within the area.
 */
export function ProcessorCard({
  processor,
  areaId,
  onRemove,
}: ProcessorCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: processor.processor_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-md border bg-card p-3 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Drag Handle */}
        <button
          className="cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
        </button>

        {/* Processor Info */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/proc/${processor.processor_id}`}
            className="font-medium hover:underline"
          >
            {processor.processor_name}
          </Link>
          {processor.processor_usage_description && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {processor.processor_usage_description}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proc/${processor.processor_id}`}>
            View
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
