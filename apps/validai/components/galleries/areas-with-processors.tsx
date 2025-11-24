"use client"

import { useMemo, useState, useEffect } from "react"
import {
  type GalleryDetail,
  useReorderGalleryAreas,
  useReorderGalleryProcessors,
  useRemoveProcessorFromArea,
} from "@/app/queries/galleries"
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { AreaCard } from "./area-card"
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    // Check if we're reordering areas
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
    }
    // Otherwise, we're reordering processors within an area
    else if (!activeIdStr.startsWith('area-') && !overIdStr.startsWith('area-')) {
      // Find which area contains the active processor
      let sourceArea = gallery.areas.find(area =>
        area.processors.some(p => p.processor_id === activeIdStr)
      )

      if (!sourceArea) return

      const processors = [...sourceArea.processors]
      const activeIndex = processors.findIndex(p => p.processor_id === activeIdStr)
      const overIndex = processors.findIndex(p => p.processor_id === overIdStr)

      if (activeIndex === -1 || overIndex === -1) return

      // Calculate new position (fractional positioning)
      let newPosition: number

      if (overIndex === 0) {
        // Moving to first position
        newPosition = processors[0].position / 2
      } else if (overIndex === processors.length - 1 && activeIndex < overIndex) {
        // Moving to last position (from before)
        newPosition = processors[processors.length - 1].position + 1000
      } else {
        // Moving between two processors
        const prevPosition = processors[Math.min(activeIndex, overIndex)].position
        const nextPosition = processors[Math.max(activeIndex, overIndex)].position
        newPosition = (prevPosition + nextPosition) / 2
      }

      // Reorder all processors in the area with new positions
      const reorderedProcessors = [...processors]
      const [movedProcessor] = reorderedProcessors.splice(activeIndex, 1)
      reorderedProcessors.splice(overIndex, 0, movedProcessor)

      const processorPositions = reorderedProcessors.map((processor, index) => ({
        processor_id: processor.processor_id,
        gallery_area_id: sourceArea.area_id,
        position: (index + 1) * 1000,
      }))

      reorderProcessors.mutate({
        galleryId: gallery.gallery_id,
        processorPositions,
      })
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
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
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
    </DndContext>
  )
}
