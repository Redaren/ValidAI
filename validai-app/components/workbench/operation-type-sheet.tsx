/**
 * Operation Type Selector Sheet Component
 *
 * Modal sheet for selecting operation type in workbench.
 * Displays all available operation types with descriptions and icons.
 * Follows same pattern as model selector sheet for consistency.
 *
 * @module components/workbench/operation-type-sheet
 */

"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getAllOperationTypes, type OperationType } from "@/lib/operation-types"
import { useWorkbenchStore } from "@/stores/workbench-store"

/**
 * Props for OperationTypeSheet component
 *
 * @interface OperationTypeSheetProps
 * @property {React.ReactNode} children - Trigger button element
 */
interface OperationTypeSheetProps {
  children: React.ReactNode
}

/**
 * Operation Type Selector Sheet
 *
 * @component
 * @description
 * Provides a modal interface for selecting operation type in workbench tests.
 * Each operation type determines how the LLM response is generated and structured.
 *
 * ## Operation Types
 * - **Generic**: Free-form text generation (no structured output)
 * - **True/False**: Binary validation with reasoning (structured output)
 * - **Future**: Extraction, Rating, Classification, Analysis
 *
 * ## Behavior
 * - Opens as a slide-in sheet from right side
 * - Shows all operation types with icons and descriptions
 * - Highlights currently selected type
 * - Auto-closes on selection
 * - Persists selection in workbench store
 *
 * @param {OperationTypeSheetProps} props - Component props
 * @returns {JSX.Element} Operation type selector sheet
 */
export function OperationTypeSheet({ children }: OperationTypeSheetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { selectedOperationType, setOperationType } = useWorkbenchStore()

  const operationTypes = getAllOperationTypes()

  /**
   * Handle operation type selection
   *
   * @param operationType - Selected operation type enum value
   */
  const handleSelect = (operationType: OperationType) => {
    setOperationType(operationType)
    setIsOpen(false)
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Select Operation Type</SheetTitle>
          <SheetDescription>
            Choose how the LLM should process and structure its response
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {operationTypes.map((opType) => {
            const isSelected = selectedOperationType === opType.id
            const isImplemented = opType.useStructuredOutput || opType.id === 'generic'

            return (
              <button
                key={opType.id}
                onClick={() => handleSelect(opType.id)}
                disabled={!isImplemented}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                  isSelected && isImplemented
                    ? "border-primary bg-primary/5"
                    : isImplemented
                    ? "border-border hover:bg-accent"
                    : "border-border bg-muted/30 cursor-not-allowed opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">{opType.icon}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{opType.displayName}</span>
                      {isSelected && isImplemented && (
                        <Badge variant="outline" className="text-xs bg-primary/10">
                          Selected
                        </Badge>
                      )}
                      {!isImplemented && (
                        <Badge variant="outline" className="text-xs">
                          Coming Soon
                        </Badge>
                      )}
                      {opType.useStructuredOutput && (
                        <Badge variant="secondary" className="text-xs">
                          Structured
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {opType.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Additional info section */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Structured operation types enforce specific output formats
            using Zod schemas, making it easier to parse and visualize results.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
