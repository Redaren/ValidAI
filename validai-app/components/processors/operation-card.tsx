"use client"

import { Operation } from "@/app/queries/processors/use-processor-detail"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Pencil } from "lucide-react"

/**
 * Props for the OperationCard component.
 */
interface OperationCardProps {
  /** The operation to display */
  operation: Operation
}

/**
 * Operation Card Component - Sortable Operation Item
 *
 * Displays a single operation with drag-and-drop functionality.
 * Operations can be dragged within their area or moved to other areas.
 *
 * ## Drag-and-Drop Behavior
 *
 * - Uses `useSortable` with the operation's UUID as the ID
 * - Can be dragged via the GripVertical handle
 * - Visual feedback: opacity reduces to 0.5 while dragging
 * - Smooth animations using CSS transforms
 *
 * ## Visual Design
 *
 * - **Type Badge**: Color-coded by operation type (extraction, validation, etc.)
 * - **Name**: Operation name (truncated if too long)
 * - **Description**: Optional description text (truncated)
 * - **Edit Button**: Appears on hover (currently disabled)
 *
 * ## Operation Types & Colors
 *
 * - **extraction**: Blue
 * - **validation**: Green
 * - **rating**: Purple
 * - **classification**: Orange
 * - **analysis**: Pink
 * - **default**: Gray
 *
 * @param operation - The operation data to display
 * @returns A draggable operation card
 */
export function OperationCard({ operation }: OperationCardProps) {
  /**
   * Makes the operation sortable within its area.
   * Uses operation UUID as the unique drag identifier.
   */
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: operation.id })

  /**
   * Visual style with drag transform and opacity feedback.
   */
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  /**
   * Returns Tailwind color classes based on operation type.
   *
   * @param type - The operation type
   * @returns CSS classes for background and text color
   */
  const getOperationTypeColor = (type: string) => {
    switch (type) {
      case "extraction":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      case "validation":
        return "bg-green-500/10 text-green-700 dark:text-green-400"
      case "rating":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400"
      case "classification":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400"
      case "analysis":
        return "bg-pink-500/10 text-pink-700 dark:text-pink-400"
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400"
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent/50 transition-colors"
    >
      {/* Drag Handle */}
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Type Badge */}
      <Badge className={`${getOperationTypeColor(operation.operation_type)} text-xs flex-shrink-0`}>
        {operation.operation_type}
      </Badge>

      {/* Name */}
      <span className="font-medium text-sm truncate flex-shrink-0 min-w-0">
        {operation.name}
      </span>

      {/* Description */}
      {operation.description && (
        <span className="text-sm text-muted-foreground truncate flex-1 min-w-0">
          {operation.description}
        </span>
      )}

      {/* Edit Icon */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        disabled
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  )
}