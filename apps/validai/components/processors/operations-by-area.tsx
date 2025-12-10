"use client"

import { useMemo, useState, useEffect } from "react"
import {
  ProcessorDetail,
  useUpdateOperationPosition,
  useUpdateAreaConfiguration,
  useRenameArea,
  useDeleteArea,
} from "@/app/queries/processors/use-processor-detail"
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { AreaColumn } from "./area-column"
import { OperationCard } from "./operation-card"

/**
 * Props for the OperationsByArea component.
 */
interface OperationsByAreaProps {
  /** The processor containing operations to display and organize */
  processor: ProcessorDetail
}

/**
 * Operations By Area Component - Drag-and-Drop Orchestrator
 *
 * This is the core component that manages the drag-and-drop interface for organizing
 * operations within areas and reordering areas themselves. It uses @dnd-kit for a
 * flexible, accessible drag-and-drop experience.
 *
 * ## Drag-and-Drop Architecture
 *
 * ### Two-Level Drag System
 * The component supports TWO types of draggable items:
 * 1. **Areas** - Containers that can be reordered
 * 2. **Operations** - Items that can be moved within/between areas
 *
 * ### ID Format Convention (Critical for understanding the code)
 * - **Area IDs**: `"area-{areaName}"` (e.g., "area-Extraction")
 *   - Used by SortableContext to identify area drag operations
 *   - Prefix distinguishes area drags from operation drags
 * - **Operation IDs**: `operation.id` (UUID)
 *   - Direct operation UUID without prefix
 *   - Used by SortableContext within each area
 * - **Droppable IDs**: `areaName` (e.g., "Extraction")
 *   - Used by useDroppable to identify drop targets
 *
 * ### Library Integration
 * - **@dnd-kit/core** - Provides DndContext, sensors, and event handling
 * - **@dnd-kit/sortable** - Provides SortableContext and useSortable hook
 * - **PointerSensor** - Requires 8px movement before drag starts (prevents accidental drags)
 *
 * ## Drag Event Flow
 *
 * ### 1. handleDragStart
 * - Captures the ID of the item being dragged
 * - Stores in `activeId` state for overlay rendering
 *
 * ### 2. handleDragOver (during drag)
 * - Auto-expands collapsed areas when dragging over them
 * - Only applies to operation drags (not area reordering)
 * - Detects target area from multiple ID formats
 *
 * ### 3. handleDragEnd (on drop)
 * - **Area Reordering**: If activeId starts with "area-"
 *   - Swaps display_order of areas
 *   - Updates area_configuration in database
 * - **Operation Movement**: Otherwise
 *   - Calculates new position using fractional positioning
 *   - Updates operation's area and position
 *   - Handles both area drops and operation-to-operation drops
 *
 * ## Position Calculation Algorithm
 *
 * Operations use **fractional positioning** for efficient reordering:
 * - Position is a numeric value, not strictly sequential
 * - Inserting between positions 5 and 6 → position 5.5
 * - No need to update all subsequent items
 * - Database stores as NUMERIC type for precision
 *
 * **Example:**
 * ```
 * Before: [Op1: 1, Op2: 2, Op3: 3]
 * Drag Op3 between Op1 and Op2
 * After: [Op1: 1, Op3: 1.5, Op2: 2]
 * ```
 *
 * ## SSR/Hydration Handling
 *
 * The component renders a static version during SSR and only enables
 * drag-and-drop after client-side hydration to prevent mismatches.
 *
 * @param processor - The processor containing operations and area configuration
 * @returns The interactive operations-by-area interface with drag-and-drop
 */
export function OperationsByArea({ processor }: OperationsByAreaProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [openAreas, setOpenAreas] = useState<Map<string, boolean>>(new Map())
  const updatePosition = useUpdateOperationPosition()
  const updateAreaConfig = useUpdateAreaConfiguration()
  const renameArea = useRenameArea()
  const deleteArea = useDeleteArea()

  /**
   * Prevent hydration mismatch by only enabling DnD after mount.
   * This ensures drag-and-drop features are only active on the client.
   */
  useEffect(() => {
    setIsMounted(true)
  }, [])

  /**
   * Configure drag sensors with an 8px activation distance.
   * This prevents accidental drags when clicking buttons or text.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before dragging starts
      },
    })
  )

  /**
   * Groups operations by their area, sorted by position within each area.
   * Initializes all areas from configuration even if they're empty.
   *
   * @returns Map of area names to their operations, sorted by position
   */
  const groupedOperations = useMemo(() => {
    const groups = new Map<string, typeof processor.operations>()

    // Initialize with areas from configuration
    const areas =
      processor.area_configuration?.areas?.map((a) => a.name) || ["default"]

    areas.forEach((areaName) => {
      groups.set(areaName, [])
    })

    // Group operations (with defensive check)
    processor.operations?.forEach((op) => {
      const areaName = op.area || "default"
      if (!groups.has(areaName)) {
        groups.set(areaName, [])
      }
      groups.get(areaName)!.push(op)
    })

    // Sort each group by position
    groups.forEach((ops) => {
      ops.sort((a, b) => a.position - b.position)
    })

    return groups
  }, [processor.operations, processor.area_configuration])

  /**
   * Get area names sorted by their display_order.
   * This determines the visual order of areas in the UI.
   *
   * @returns Array of area names in display order
   */
  const sortedAreaNames = useMemo(() => {
    if (processor.area_configuration?.areas) {
      return [...processor.area_configuration.areas]
        .sort((a, b) => a.display_order - b.display_order)
        .map((a) => a.name)
    }
    return Array.from(groupedOperations.keys())
  }, [processor.area_configuration, groupedOperations])

  /**
   * Initialize collapse/expand state for areas.
   * Preserves existing state when areas change, defaults new areas to collapsed.
   */
  useEffect(() => {
    setOpenAreas((prevOpenAreas) => {
      const newOpenAreas = new Map<string, boolean>()
      let hasChanges = false

      sortedAreaNames.forEach((areaName) => {
        // Keep existing state if it exists, otherwise default to collapsed
        const isOpen = prevOpenAreas.get(areaName) ?? false
        newOpenAreas.set(areaName, isOpen)

        // Check if this is a new area
        if (!prevOpenAreas.has(areaName)) {
          hasChanges = true
        }
      })

      // Only update state if areas actually changed
      if (hasChanges || prevOpenAreas.size !== newOpenAreas.size) {
        return newOpenAreas
      }

      return prevOpenAreas
    })
  }, [sortedAreaNames])

  const toggleArea = (areaName: string) => {
    setOpenAreas((prev) => {
      const next = new Map(prev)
      next.set(areaName, !prev.get(areaName))
      return next
    })
  }

  const handleRenameArea = (oldName: string, newName: string) => {
    renameArea.mutate({
      processorId: processor.processor_id,
      oldName,
      newName,
    })
  }

  const handleDeleteArea = (areaName: string, targetArea?: string) => {
    deleteArea.mutate({
      processorId: processor.processor_id,
      areaName,
      targetArea,
    })
  }

  /**
   * Drag Start Handler
   *
   * Captures the ID of the item being dragged (area or operation).
   * This ID is used to render the drag overlay and determine drag type.
   *
   * @param event - DragStartEvent containing the active draggable item
   */
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  /**
   * Drag Over Handler
   *
   * Handles auto-expansion of collapsed areas when dragging operations over them.
   * This improves UX by allowing users to see the drop target contents.
   *
   * **Logic:**
   * 1. Skip if dragging an area (area reordering doesn&apos;t need auto-expand)
   * 2. Detect which area is being hovered over (supports multiple ID formats)
   * 3. Auto-expand the target area if it's currently collapsed
   *
   * **ID Format Detection:**
   * - Direct match: `overId === areaName`
   * - Sortable format: `overId === "area-{areaName}"`
   * - Operation format: Find operation's area via lookup
   *
   * @param event - DragOverEvent containing active and over items
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Only auto-expand when dragging operations, not when dragging areas
    if (activeId.startsWith('area-')) {
      return // Skip auto-expand when reordering areas
    }

    // Check if we're dragging over an area container
    // Handle both formats: "areaName" (droppable) and "area-areaName" (sortable)
    let targetAreaName: string | null = null

    if (sortedAreaNames.includes(overId)) {
      // Direct area name match (droppable id)
      targetAreaName = overId
    } else if (overId.startsWith('area-')) {
      // Sortable area format: "area-{areaName}"
      const areaName = overId.replace('area-', '')
      if (sortedAreaNames.includes(areaName)) {
        targetAreaName = areaName
      }
    } else {
      // We're over an operation, check which area it belongs to
      const overOperation = processor.operations?.find((op) => op.id === overId)
      if (overOperation && overOperation.area) {
        targetAreaName = overOperation.area
      }
    }

    // Auto-expand the target area if it's collapsed
    if (targetAreaName && !openAreas.get(targetAreaName)) {
      setOpenAreas((prev) => {
        const next = new Map(prev)
        next.set(targetAreaName, true)
        return next
      })
    }
  }

  /**
   * Drag End Handler - The Main Drag-and-Drop Logic
   *
   * This is where the magic happens. Determines if we're reordering areas
   * or moving operations, then updates the database accordingly.
   *
   * ## Two Drag Modes
   *
   * ### Mode 1: Area Reordering (activeId starts with "area-")
   * - Swaps the display_order of two areas
   * - Updates area_configuration.areas array
   * - Maintains all operations within their areas
   *
   * ### Mode 2: Operation Movement (default)
   * - Moves an operation to a new area and/or position
   * - Uses fractional positioning for precise placement
   * - Handles two drop scenarios:
   *   a) Dropped on an area → appends to end
   *   b) Dropped on another operation → inserts at that position
   *
   * ## Position Calculation Details
   *
   * When dropping between operations:
   * ```
   * Moving DOWN (within same area):
   *   targetPos = (overOp.position + nextOp.position) / 2
   *   If no nextOp: targetPos = overOp.position + 1
   *
   * Moving UP (or from different area):
   *   targetPos = (prevOp.position + overOp.position) / 2
   *   If no prevOp: targetPos = overOp.position / 2
   * ```
   *
   * @param event - DragEndEvent containing active and over items
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Check if we're dragging an area (reordering areas)
    if (activeId.startsWith('area-')) {
      const activeAreaName = activeId.replace('area-', '')
      const overAreaName = overId.startsWith('area-') ? overId.replace('area-', '') : overId

      if (activeAreaName === overAreaName) return

      // Get current areas configuration
      const currentAreas = processor.area_configuration?.areas || []
      if (currentAreas.length === 0) return

      // Find indices
      const oldIndex = currentAreas.findIndex(a => a.name === activeAreaName)
      const newIndex = currentAreas.findIndex(a => a.name === overAreaName)

      if (oldIndex === -1 || newIndex === -1) return

      // Reorder areas
      const reorderedAreas = [...currentAreas]
      const [movedArea] = reorderedAreas.splice(oldIndex, 1)
      reorderedAreas.splice(newIndex, 0, movedArea)

      // Reassign display_order sequentially
      const updatedAreas = reorderedAreas.map((area, index) => ({
        ...area,
        display_order: index + 1,
      }))

      // Update area configuration
      updateAreaConfig.mutate({
        processorId: processor.processor_id,
        areaConfiguration: {
          areas: updatedAreas,
        },
      })

      return
    }

    // Otherwise, we're dragging an operation (existing logic)
    const activeOperation = processor.operations?.find((op) => op.id === activeId)
    if (!activeOperation) return

    // Determine target area and position
    let targetArea = activeOperation.area
    let targetPosition = activeOperation.position

    // Check if dropped over an area (container)
    // Handle both formats: "areaName" (droppable) and "area-areaName" (sortable)
    let droppedOnAreaName: string | null = null

    if (sortedAreaNames.includes(overId)) {
      // Direct area name match (droppable id)
      droppedOnAreaName = overId
    } else if (overId.startsWith('area-')) {
      // Sortable area format: "area-{areaName}"
      const areaName = overId.replace('area-', '')
      if (sortedAreaNames.includes(areaName)) {
        droppedOnAreaName = areaName
      }
    }

    if (droppedOnAreaName) {
      targetArea = droppedOnAreaName
      const areaOps = groupedOperations.get(droppedOnAreaName) || []
      // Place at end of area
      targetPosition = areaOps.length > 0 ? areaOps[areaOps.length - 1].position + 1 : 1
    } else {
      // Dropped over another operation
      const overOperation = processor.operations?.find((op) => op.id === overId)
      if (!overOperation) return

      targetArea = overOperation.area

      // Calculate position between operations
      const areaOps = groupedOperations.get(targetArea) || []
      const overIndex = areaOps.findIndex((op) => op.id === overId)

      if (overIndex === -1) {
        targetPosition = overOperation.position
      } else {
        // Check if we're moving within the same area
        const activeIndex = areaOps.findIndex((op) => op.id === activeId)

        if (activeIndex !== -1 && activeIndex < overIndex) {
          // Moving down in the same area
          const nextOp = areaOps[overIndex + 1]
          targetPosition = nextOp
            ? (overOperation.position + nextOp.position) / 2
            : overOperation.position + 1
        } else {
          // Moving up or from different area
          const prevOp = areaOps[overIndex - 1]
          targetPosition = prevOp
            ? (prevOp.position + overOperation.position) / 2
            : overOperation.position / 2
        }
      }
    }

    // Only update if position or area changed
    if (
      targetArea !== activeOperation.area ||
      targetPosition !== activeOperation.position
    ) {
      updatePosition.mutate({
        operationId: activeId,
        processorId: processor.processor_id,
        newArea: targetArea,
        newPosition: targetPosition,
      })
    }
  }

  const activeOperation = activeId
    ? processor.operations?.find((op) => op.id === activeId)
    : null

  // Render static version during SSR, DnD version after hydration
  if (!isMounted) {
    return (
      <div className="flex flex-col gap-4">
        {sortedAreaNames.map((areaName) => {
          const operations = groupedOperations.get(areaName) || []
          // Exclude current area name from validation list for rename
          const otherAreaNames = sortedAreaNames.filter(name => name !== areaName)
          return (
            <AreaColumn
              key={areaName}
              areaName={areaName}
              operations={operations}
              processorId={processor.processor_id}
              isOpen={openAreas.get(areaName) ?? false}
              onToggle={() => toggleArea(areaName)}
              existingAreaNames={otherAreaNames}
              onRename={handleRenameArea}
              onDelete={handleDeleteArea}
              isRenaming={renameArea.isPending}
              isDeleting={deleteArea.isPending}
              isLastArea={sortedAreaNames.length === 1}
            />
          )
        })}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedAreaNames.map((name) => `area-${name}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4">
          {sortedAreaNames.map((areaName) => {
            const operations = groupedOperations.get(areaName) || []
            // Exclude current area name from validation list for rename
            const otherAreaNames = sortedAreaNames.filter(name => name !== areaName)
            return (
              <AreaColumn
                key={areaName}
                areaName={areaName}
                operations={operations}
                processorId={processor.processor_id}
                isOpen={openAreas.get(areaName) ?? false}
                onToggle={() => toggleArea(areaName)}
                existingAreaNames={otherAreaNames}
                onRename={handleRenameArea}
                onDelete={handleDeleteArea}
                isRenaming={renameArea.isPending}
                isDeleting={deleteArea.isPending}
                isLastArea={sortedAreaNames.length === 1}
              />
            )
          })}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeOperation ? (
          <div className="rotate-2 scale-105 cursor-grabbing">
            <OperationCard operation={activeOperation} processorId={processor.processor_id} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}