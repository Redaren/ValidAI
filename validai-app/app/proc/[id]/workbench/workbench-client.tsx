"use client"

import { useEffect, useState } from "react"
import { FlaskConical, MoreHorizontal, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WorkbenchInput } from "@/components/workbench/workbench-input"
import { WorkbenchOutput } from "@/components/workbench/workbench-output"
import { WorkbenchAdvancedSettings } from "@/components/workbench/workbench-advanced-settings"
import { useWorkbenchStore } from "@/stores/workbench-store"
import type { Database } from "@/lib/database.types"

/**
 * Type alias for processor data with operations
 * Retrieved from get_processor_with_operations() database function
 */
type ProcessorWithOperations = Database["public"]["Functions"]["get_processor_with_operations"]["Returns"][0]

/**
 * Props for WorkbenchClient component
 *
 * @property processorId - UUID of the current processor
 * @property initialProcessor - Processor data with operations from server-side fetch
 */
interface WorkbenchClientProps {
  processorId: string
  initialProcessor: ProcessorWithOperations
}

/**
 * Workbench Client Component
 *
 * Main orchestrator for the testbench interface.
 * Manages layout and coordination between settings, input, and output sections.
 */
export function WorkbenchClient({
  processorId,
  initialProcessor
}: WorkbenchClientProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const {
    advancedMode,
    setSystemPrompt,
    toggleAdvancedMode,
    reset
  } = useWorkbenchStore()

  // Initialize store with processor data
  useEffect(() => {
    setSystemPrompt(initialProcessor.system_prompt || "")

    // Cleanup on unmount
    return () => {
      reset()
    }
  }, [initialProcessor, setSystemPrompt, reset])

  // Collapse Advanced Settings when Advanced Mode is turned off
  useEffect(() => {
    if (!advancedMode && isExpanded) {
      setIsExpanded(false)
    }
  }, [advancedMode, isExpanded])

  return (
    <div className="space-y-6">
      {/* Expandable Header */}
      <Collapsible
        open={isExpanded}
        onOpenChange={setIsExpanded}
        className="space-y-4 rounded-lg border bg-card p-6"
      >
        {/* Main Header Row */}
        <div className="flex items-center justify-between gap-4">
          {advancedMode ? (
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
                <div className="flex items-center gap-2 shrink-0">
                  <FlaskConical className="h-6 w-6" />
                  <h1 className="text-2xl font-bold tracking-tight">
                    Workbench
                  </h1>
                </div>
                <p className="text-muted-foreground text-sm truncate">
                  Test generic operations with different prompts and settings
                </p>
              </div>
            </CollapsibleTrigger>
          ) : (
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <FlaskConical className="h-6 w-6" />
                <h1 className="text-2xl font-bold tracking-tight">
                  Workbench
                </h1>
              </div>
              <p className="text-muted-foreground text-sm truncate">
                Test generic operations with different prompts and settings
              </p>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More options">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={toggleAdvancedMode}>
                {advancedMode && <Check className="mr-2 h-4 w-4" />}
                {!advancedMode && <span className="mr-2 w-4" />}
                Advanced Mode
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Expandable Content */}
        <CollapsibleContent className="space-y-4">
          <div className="pt-4 border-t">
            <WorkbenchAdvancedSettings />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* Workbench Input */}
      <WorkbenchInput
        processor={initialProcessor}
        operations={[]}
      />

      <Separator />

      {/* Output Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Output</h2>
        <WorkbenchOutput />
      </div>
    </div>
  )
}