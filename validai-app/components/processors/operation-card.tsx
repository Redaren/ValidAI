"use client"

import { Operation } from "@/app/queries/processors/use-processor-detail"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

interface OperationCardProps {
  operation: Operation
}

export function OperationCard({ operation }: OperationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: operation.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

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
    <Card
      ref={setNodeRef}
      style={style}
      className="relative flex items-start gap-3 border-l-4 border-l-primary/40 p-3 hover:border-l-primary"
    >
      {/* Drag Handle */}
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Content */}
      <div className="flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className="font-medium">{operation.name}</h4>
            {operation.description && (
              <p className="text-sm text-muted-foreground">
                {operation.description}
              </p>
            )}
          </div>
          <Badge className={getOperationTypeColor(operation.operation_type)}>
            {operation.operation_type}
          </Badge>
        </div>

        {/* Optional badges */}
        <div className="flex gap-2">
          {operation.required && (
            <Badge variant="outline" className="text-xs">
              Required
            </Badge>
          )}
        </div>
      </div>
    </Card>
  )
}