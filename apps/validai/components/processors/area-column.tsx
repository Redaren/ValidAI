"use client"

import { useState } from "react"
import { Operation } from "@/app/queries/processors/use-processor-detail"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useDroppable } from "@dnd-kit/core"
import { OperationCard } from "./operation-card"
import { RenameAreaDialog } from "./rename-area-dialog"
import { DeleteAreaDialog } from "./delete-area-dialog"
import { OperationSheet } from "./operation-sheet"
import { Plus, GripVertical, ChevronDown, ChevronRight, Pencil, Trash2, MoreHorizontal } from "lucide-react"

/**
 * Props for the AreaColumn component.
 */
interface AreaColumnProps {
  /** Name of the area (must be unique within processor) */
  areaName: string
  /** Operations within this area, pre-sorted by position */
  operations: Operation[]
  /** The processor ID for creating operations */
  processorId: string
  /** Whether the area is expanded or collapsed */
  isOpen: boolean
  /** Callback to toggle expand/collapse state */
  onToggle: () => void
  /** Names of OTHER areas (for rename validation) */
  existingAreaNames: string[]
  /** Callback to rename this area */
  onRename: (oldName: string, newName: string) => void
  /** Callback to delete this area */
  onDelete: (areaName: string, targetArea?: string) => void
  /** Whether a rename operation is in progress */
  isRenaming?: boolean
  /** Whether a delete operation is in progress */
  isDeleting?: boolean
  /** Whether this is the last remaining area (prevents deletion) */
  isLastArea?: boolean
}

/**
 * Area Column Component - Dual-Mode Draggable Container
 *
 * This component represents an organizational area that contains operations.
 * It implements a sophisticated dual-mode drag-and-drop pattern:
 *
 * ## Dual Drag-and-Drop Modes
 *
 * ### Mode 1: Sortable (Area Reordering)
 * - The ENTIRE area card can be dragged via the GripVertical handle
 * - Uses `useSortable` with ID format `"area-{areaName}"`
 * - Allows reordering areas within the processor
 *
 * ### Mode 2: Droppable (Operation Target)
 * - The area acts as a DROP TARGET for operations
 * - Uses `useDroppable` with ID format `areaName`
 * - Operations can be dropped into this area from other areas
 *
 * ## Combining Sortable + Droppable
 *
 * The component needs TWO refs (one for each behavior):
 * - `setSortableRef` - From useSortable
 * - `setDroppableRef` - From useDroppable
 *
 * These are combined using the `setRefs` function which calls both.
 * This allows the area to be BOTH draggable AND a drop target.
 *
 * ## Visual Feedback
 *
 * - **isOver**: Shows ring when operations are dragged over
 * - **isAreaDragging**: Reduces opacity when area is being dragged
 * - **transform/transition**: Smooth animations during drag
 *
 * ## Area Management
 *
 * The component provides a dropdown menu with:
 * - **Rename**: Opens RenameAreaDialog
 * - **Delete**: Opens DeleteAreaDialog (disabled if last area)
 *
 * ## Collapsible Content
 *
 * Areas can be collapsed to reduce visual clutter. Operations within
 * use SortableContext for their own drag-and-drop.
 *
 * @returns A draggable area card containing sortable operations
 */
export function AreaColumn({
  areaName,
  operations,
  processorId,
  isOpen,
  onToggle,
  existingAreaNames,
  onRename,
  onDelete,
  isRenaming = false,
  isDeleting = false,
  isLastArea = false,
}: AreaColumnProps) {
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isCreateOperationOpen, setIsCreateOperationOpen] = useState(false)

  /**
   * Make the area itself sortable for reordering.
   * ID format: "area-{areaName}" distinguishes from operation drags.
   */
  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isAreaDragging,
  } = useSortable({
    id: `area-${areaName}`,
    data: {
      type: 'area',
      areaName,
    }
  })

  /**
   * Make the area droppable for operations.
   * ID format: areaName (no prefix) for drop target identification.
   */
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: areaName,
  })

  /**
   * Visual style combining drag transform and opacity feedback.
   */
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isAreaDragging ? 0.5 : 1,
  }

  /**
   * Combines both refs (sortable + droppable) into a single ref callback.
   * This is the key technique that allows dual drag-and-drop behavior.
   */
  const setRefs = (node: HTMLDivElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
  }

  const handleRename = (newName: string) => {
    onRename(areaName, newName)
    setIsRenameDialogOpen(false)
  }

  const handleDelete = (targetArea?: string) => {
    onDelete(areaName, targetArea)
    setIsDeleteDialogOpen(false)
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card
        ref={setRefs}
        style={style}
        className={`flex flex-col transition-colors ${
          isOver ? "ring-2 ring-primary" : ""
        } ${isAreaDragging ? "z-50" : ""}`}
      >
        <CardHeader className="border-b py-3">
          <CardTitle className="flex items-center justify-between text-base">
            {/* Drag handle - outside of CollapsibleTrigger */}
            <button
              className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing shrink-0"
              onClick={(e) => e.stopPropagation()}
              {...sortableAttributes}
              {...sortableListeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>

            {/* Collapsible trigger - spans most of the header */}
            <CollapsibleTrigger className="flex items-center flex-1 gap-2 cursor-pointer px-2 py-1 -my-1">
              <div className="flex items-center gap-1">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-semibold">{areaName}</span>
              </div>
              {/* Empty space in the middle is also clickable */}
              <div className="flex-1" />
            </CollapsibleTrigger>

            {/* Area Options Menu - outside of CollapsibleTrigger */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={isRenaming || isDeleting}
                  title="Area options"
                >
                  <span className="sr-only">Open area menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setIsCreateOperationOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Operation
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsRenameDialogOpen(true)}
                  disabled={isRenaming}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={isDeleting || isLastArea}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardTitle>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex-1 space-y-2 p-4">
            <SortableContext
              items={operations.map((op) => op.id)}
              strategy={verticalListSortingStrategy}
            >
              {operations.length > 0 ? (
                operations.map((operation) => (
                  <OperationCard
                    key={operation.id}
                    operation={operation}
                    processorId={processorId}
                  />
                ))
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
                  No operations in this area
                </div>
              )}
            </SortableContext>
          </CardContent>
        </CollapsibleContent>
      </Card>

      <RenameAreaDialog
        open={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        currentName={areaName}
        existingNames={existingAreaNames}
        onRename={handleRename}
        isLoading={isRenaming}
      />

      <DeleteAreaDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        areaName={areaName}
        operationCount={operations.length}
        otherAreaNames={existingAreaNames}
        onDelete={handleDelete}
        isLoading={isDeleting}
      />

      <OperationSheet
        open={isCreateOperationOpen}
        onOpenChange={setIsCreateOperationOpen}
        processorId={processorId}
        areaName={areaName}
        mode="create"
      />
    </Collapsible>
  )
}