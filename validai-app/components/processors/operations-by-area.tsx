"use client"

import { useMemo, useState, useEffect } from "react"
import {
  ProcessorDetail,
  useUpdateOperationPosition,
  useUpdateAreaConfiguration,
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

interface OperationsByAreaProps {
  processor: ProcessorDetail
}

export function OperationsByArea({ processor }: OperationsByAreaProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [openAreas, setOpenAreas] = useState<Map<string, boolean>>(new Map())
  const updatePosition = useUpdateOperationPosition()
  const updateAreaConfig = useUpdateAreaConfiguration()

  // Prevent hydration mismatch by only enabling DnD after mount
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Configure sensors for better drag experience
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before dragging starts
      },
    })
  )

  // Group operations by area
  const groupedOperations = useMemo(() => {
    const groups = new Map<string, typeof processor.operations>()

    // Initialize with areas from configuration
    const areas =
      processor.area_configuration?.areas?.map((a) => a.name) || ["default"]

    areas.forEach((areaName) => {
      groups.set(areaName, [])
    })

    // Group operations
    processor.operations.forEach((op) => {
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

  // Get sorted area names based on display_order
  const sortedAreaNames = useMemo(() => {
    if (processor.area_configuration?.areas) {
      return [...processor.area_configuration.areas]
        .sort((a, b) => a.display_order - b.display_order)
        .map((a) => a.name)
    }
    return Array.from(groupedOperations.keys())
  }, [processor.area_configuration, groupedOperations])

  // Initialize all areas as open when areas change
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

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
      const overOperation = processor.operations.find((op) => op.id === overId)
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
    const activeOperation = processor.operations.find((op) => op.id === activeId)
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
      const overOperation = processor.operations.find((op) => op.id === overId)
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
    ? processor.operations.find((op) => op.id === activeId)
    : null

  // Render static version during SSR, DnD version after hydration
  if (!isMounted) {
    return (
      <div className="flex flex-col gap-4">
        {sortedAreaNames.map((areaName) => {
          const operations = groupedOperations.get(areaName) || []
          return (
            <AreaColumn
              key={areaName}
              areaName={areaName}
              operations={operations}
              isOpen={openAreas.get(areaName) ?? false}
              onToggle={() => toggleArea(areaName)}
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
            return (
              <AreaColumn
                key={areaName}
                areaName={areaName}
                operations={operations}
                isOpen={openAreas.get(areaName) ?? false}
                onToggle={() => toggleArea(areaName)}
              />
            )
          })}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeOperation ? (
          <div className="rotate-2 scale-105 cursor-grabbing">
            <OperationCard operation={activeOperation} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}