"use client"

import { Operation } from "@/app/queries/processors/use-processor-detail"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useDroppable } from "@dnd-kit/core"
import { OperationCard } from "./operation-card"
import { Plus, GripVertical, ChevronDown, ChevronRight } from "lucide-react"

interface AreaColumnProps {
  areaName: string
  operations: Operation[]
  isOpen: boolean
  onToggle: () => void
}

export function AreaColumn({ areaName, operations, isOpen, onToggle }: AreaColumnProps) {
  // Make the area itself sortable
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

  // Keep droppable for operations
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: areaName,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isAreaDragging ? 0.5 : 1,
  }

  // Combine refs
  const setRefs = (node: HTMLDivElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
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
            <div className="flex items-center gap-2">
              {/* Drag handle for area */}
              <button
                className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                {...sortableAttributes}
                {...sortableListeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>

              {/* Collapsible trigger */}
              <CollapsibleTrigger className="flex items-center gap-1 hover:text-foreground">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-semibold">{areaName}</span>
              </CollapsibleTrigger>
            </div>
            <span className="text-sm font-normal text-muted-foreground">
              {operations.length} {operations.length === 1 ? "operation" : "operations"}
            </span>
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
                  <OperationCard key={operation.id} operation={operation} />
                ))
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
                  No operations in this area
                </div>
              )}
            </SortableContext>

            {/* Add Operation Button */}
            <Button variant="outline" className="w-full" size="sm" disabled>
              <Plus className="h-4 w-4" />
              <span className="ml-1">Add Operation</span>
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}