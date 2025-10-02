"use client"

import { useEffect, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { WorkbenchInput } from "@/components/workbench/workbench-input"
import { WorkbenchOutput } from "@/components/workbench/workbench-output"
import { useWorkbenchStore } from "@/stores/workbench-store"
import type { Database } from "@/lib/database.types"

type ProcessorWithOperations = Database["public"]["Functions"]["get_processor_with_operations"]["Returns"][0]

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
    setSystemPrompt,
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
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
              <h1 className="text-2xl font-bold tracking-tight shrink-0">
                Testbench
              </h1>
              <p className="text-muted-foreground text-sm truncate">
                Test generic operations with different prompts and settings
              </p>
            </div>
          </CollapsibleTrigger>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Expandable Content */}
        <CollapsibleContent className="space-y-4">
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground text-center">
              Advanced settings will be available here in a future update.
            </p>
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