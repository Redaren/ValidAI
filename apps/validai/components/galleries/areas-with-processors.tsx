"use client"

import { useMemo, useState, useEffect } from "react"
import {
  type GalleryDetail,
  useReorderGalleryAreas,
  useReorderGalleryProcessors,
  useRemoveProcessorFromArea,
  useMoveProcessorToArea,
} from "@/app/queries/galleries"
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { AreaCard } from "./area-card"
import { ProcessorCard } from "./processor-card"
import { Button } from "@playze/shared-ui"
import { Plus } from "lucide-react"

interface AreasWithProcessorsProps {
  gallery: GalleryDetail
  onAddProcessorsClick: (areaId: string) => void
  onEditAreaClick: (areaId: string) => void
  onDeleteAreaClick: (areaId: string) => void
}

/**
 * Areas with Processors - Drag-and-Drop Component
 *
 * Manages drag-and-drop for gallery areas and processors within those areas.
 * Supports two types of drag operations:
 * 1. Reordering areas within the gallery
 * 2. Reordering processors within an area
 *
 * Uses fractional positioning for efficient reordering without updating all items.
 */
export function AreasWithProcessors({
  gallery,
  onAddProcessorsClick,
  onEditAreaClick,
  onDeleteAreaClick,
}: AreasWithProcessorsProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const reorderAreas = useReorderGalleryAreas()
  const reorderProcessors = useReorderGalleryProcessors()
  const removeProcessor = useRemoveProcessorFromArea()
  const moveProcessor = useMoveProcessorToArea()

  // Prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Configure drag sensors with 8px activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Create sortable area IDs with "area-" prefix
  const areaIds = useMemo(() => {
    return gallery.areas.map((area) => `area-${area.area_id}`)
  }, [gallery.areas])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  /**
   * Drag Over Handler - Provides real-time feedback during drag operations
   *
   * This handler is called continuously as the user drags an item over potential
   * drop targets. It provides visual feedback and prepares the UI for drops.
   *
   * Note: Gallery areas are always expanded (not collapsible), so we don&apos;t need
   * auto-expand logic like the processor reference implementation has.
   */
  const handleDragOver = (event: DragOverEvent) => {
    // Currently just provides visual feedback via the isOver state in AreaCard
    // Future: Could add visual highlights, position indicators, etc.
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    // ========== Mode 1: Area Reordering ==========
    if (activeIdStr.startsWith('area-') && overIdStr.startsWith('area-')) {
      const activeAreaId = activeIdStr.replace('area-', '')
      const overAreaId = overIdStr.replace('area-', '')

      const activeIndex = gallery.areas.findIndex(a => a.area_id === activeAreaId)
      const overIndex = gallery.areas.findIndex(a => a.area_id === overAreaId)

      if (activeIndex === -1 || overIndex === -1) return

      // Calculate new display orders
      const reorderedAreas = [...gallery.areas]
      const [movedArea] = reorderedAreas.splice(activeIndex, 1)
      reorderedAreas.splice(overIndex, 0, movedArea)

      // Assign new display orders based on position in array
      const areaOrders = reorderedAreas.map((area, index) => ({
        area_id: area.area_id,
        display_order: (index + 1) * 1000, // Use 1000 increments
      }))

      reorderAreas.mutate({
        galleryId: gallery.gallery_id,
        areaOrders,
      })
      return
    }

    // ========== Mode 2: Processor Movement ==========
    // Skip if dragging area
    if (activeIdStr.startsWith('area-')) return

    // Find the active processor
    const activeProcessor = gallery.areas
      .flatMap(area => area.processors.map(p => ({ ...p, areaId: area.area_id })))
      .find(p => p.processor_id === activeIdStr)

    if (!activeProcessor) return

    const sourceAreaId = activeProcessor.areaId

    // Determine target area and position
    let targetAreaId = sourceAreaId
    let targetPosition = activeProcessor.position

    // Check if dropped on an area container
    // Handle both droppable ID (area_id) and sortable ID (area-{area_id})
    let droppedOnAreaId: string | null = null

    const directAreaMatch = gallery.areas.find(a => a.area_id === overIdStr)
    if (directAreaMatch) {
      // Dropped on area droppable
      droppedOnAreaId = directAreaMatch.area_id
    } else if (overIdStr.startsWith('area-')) {
      // Dropped on area sortable (when dragging over another area being dragged)
      const areaId = overIdStr.replace('area-', '')
      const sortableAreaMatch = gallery.areas.find(a => a.area_id === areaId)
      if (sortableAreaMatch) {
        droppedOnAreaId = sortableAreaMatch.area_id
      }
    }

    if (droppedOnAreaId) {
      // Dropped on area container - place at end
      targetAreaId = droppedOnAreaId
      const areaProcessors = gallery.areas.find(a => a.area_id === droppedOnAreaId)?.processors || []
      targetPosition = areaProcessors.length > 0
        ? areaProcessors[areaProcessors.length - 1].position + 1
        : 1
    } else {
      // Dropped on another processor - calculate position
      const overProcessor = gallery.areas
        .flatMap(area => area.processors.map(p => ({ ...p, areaId: area.area_id })))
        .find(p => p.processor_id === overIdStr)

      if (!overProcessor) return

      targetAreaId = overProcessor.areaId
      const targetAreaProcessors = gallery.areas.find(a => a.area_id === targetAreaId)?.processors || []
      const sortedProcessors = [...targetAreaProcessors].sort((a, b) => a.position - b.position)
      const overIndex = sortedProcessors.findIndex(p => p.processor_id === overIdStr)

      if (overIndex === -1) {
        targetPosition = overProcessor.position
      } else {
        // Check if moving within the same area
        const activeIndex = sortedProcessors.findIndex(p => p.processor_id === activeIdStr)

        if (activeIndex !== -1 && activeIndex < overIndex) {
          // Moving down in the same area
          const nextProcessor = sortedProcessors[overIndex + 1]
          targetPosition = nextProcessor
            ? (overProcessor.position + nextProcessor.position) / 2
            : overProcessor.position + 1
        } else {
          // Moving up or from different area
          const prevProcessor = sortedProcessors[overIndex - 1]
          targetPosition = prevProcessor
            ? (prevProcessor.position + overProcessor.position) / 2
            : overProcessor.position / 2
        }
      }
    }

    // Only update if position or area changed
    if (targetAreaId !== sourceAreaId || Math.abs(targetPosition - activeProcessor.position) > 0.01) {
      if (targetAreaId !== sourceAreaId) {
        // Cross-area movement
        moveProcessor.mutate({
          processorId: activeIdStr,
          fromAreaId: sourceAreaId,
          toAreaId: targetAreaId,
          galleryId: gallery.gallery_id,
          position: targetPosition,
        })
      } else {
        // Same-area reordering
        const areaProcessors = gallery.areas.find(a => a.area_id === sourceAreaId)?.processors || []
        const reorderedProcessors = [...areaProcessors].sort((a, b) => a.position - b.position)
        const activeIndex = reorderedProcessors.findIndex(p => p.processor_id === activeIdStr)
        const overIndex = reorderedProcessors.findIndex(p => p.position === targetPosition)

        if (activeIndex !== -1) {
          const [movedProcessor] = reorderedProcessors.splice(activeIndex, 1)
          const insertIndex = overIndex !== -1 ? overIndex : reorderedProcessors.length
          reorderedProcessors.splice(insertIndex, 0, movedProcessor)

          const processorPositions = reorderedProcessors.map((processor, index) => ({
            processor_id: processor.processor_id,
            gallery_area_id: sourceAreaId,
            position: (index + 1) * 1000,
          }))

          reorderProcessors.mutate({
            galleryId: gallery.gallery_id,
            processorPositions,
          })
        }
      }
    }
  }

  const handleRemoveProcessor = (areaId: string, processorId: string) => {
    removeProcessor.mutate({
      input: {
        gallery_area_id: areaId,
        processor_id: processorId,
      },
      galleryId: gallery.gallery_id,
    })
  }

  if (!isMounted) {
    // Render static version during SSR
    return (
      <div className="space-y-4">
        {gallery.areas.map((area) => (
          <AreaCard
            key={area.area_id}
            area={area}
            onAddProcessors={() => onAddProcessorsClick(area.area_id)}
            onEdit={() => onEditAreaClick(area.area_id)}
            onDelete={() => onDeleteAreaClick(area.area_id)}
            onRemoveProcessor={handleRemoveProcessor}
            isDragging={false}
          />
        ))}
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
      <SortableContext items={areaIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {gallery.areas.map((area) => (
            <AreaCard
              key={area.area_id}
              area={area}
              onAddProcessors={() => onAddProcessorsClick(area.area_id)}
              onEdit={() => onEditAreaClick(area.area_id)}
              onDelete={() => onDeleteAreaClick(area.area_id)}
              onRemoveProcessor={handleRemoveProcessor}
              isDragging={activeId === `area-${area.area_id}`}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId && !activeId.startsWith('area-') ? (
          <div className="rotate-2 scale-105 cursor-grabbing">
            {(() => {
              const processor = gallery.areas
                .flatMap(area => area.processors)
                .find(p => p.processor_id === activeId)
              return processor ? (
                <ProcessorCard
                  processor={processor}
                  areaId=""
                  onRemove={() => {}}
                />
              ) : null
            })()}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
