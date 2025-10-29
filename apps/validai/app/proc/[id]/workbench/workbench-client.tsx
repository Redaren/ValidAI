"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { FlaskConical, MoreHorizontal, Check } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { WorkbenchInput } from "@/components/workbench/workbench-input"
import { WorkbenchOutput } from "@/components/workbench/workbench-output"
import { WorkbenchAdvancedSettings } from "@/components/workbench/workbench-advanced-settings"
import { WorkbenchOCRMode } from "@/components/workbench/workbench-ocr-mode"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { useAvailableLLMModels } from "@/hooks/use-llm-config"
import type { Database } from "@playze/shared-types"
import type { Operation } from "@/app/queries/processors/use-processor-detail"

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
 * Supports two modes:
 * - Standalone mode: Generic testing environment (no query params)
 * - Edit mode: Load and edit specific operation (?op=<operation-id>)
 *
 * Manages layout and coordination between settings, input, and output sections.
 */
export function WorkbenchClient({
  processorId,
  initialProcessor
}: WorkbenchClientProps) {
  const searchParams = useSearchParams()
  const operationId = searchParams.get('op')

  const [isExpanded, setIsExpanded] = useState(false)
  const {
    advancedMode,
    editOperationName,
    selectedModel,
    setSystemPrompt,
    setOperationType,
    updateOperationPrompt,
    setEditOperation,
    clearEditOperation,
    toggleAdvancedMode,
    setModel,
    reset
  } = useWorkbenchStore()

  // Fetch available models from database
  const { data: availableModels } = useAvailableLLMModels()

  // Initialize store with processor data
  useEffect(() => {
    setSystemPrompt(initialProcessor.system_prompt || "")

    // Check if we're in edit mode (operation ID in query param)
    if (operationId && initialProcessor.operations) {
      const operations = (Array.isArray(initialProcessor.operations)
        ? initialProcessor.operations
        : []) as unknown as Operation[]

      const operation = operations.find((op) => op.id === operationId)
      if (operation) {
        // Enter edit mode
        setEditOperation(operation.id, operation.name)
        setOperationType(operation.operation_type)
        updateOperationPrompt(operation.prompt)
      }
    } else {
      // Ensure we're in standalone mode
      clearEditOperation()
    }

    // Cleanup on unmount
    return () => {
      reset()
    }
  }, [initialProcessor, operationId, setSystemPrompt, setOperationType, updateOperationPrompt, setEditOperation, clearEditOperation, reset])

  // Initialize default model from database
  useEffect(() => {
    if (availableModels && !selectedModel) {
      // Find the default model using default_model_id from response
      const defaultModel = availableModels.default_model_id
        ? availableModels.models.find(m => m.id === availableModels.default_model_id)
        : null

      if (defaultModel) {
        setModel(defaultModel.model)
      } else if (availableModels.models.length > 0) {
        // Fallback: use first model if no default is marked
        setModel(availableModels.models[0].model)
      }
    }
  }, [availableModels, selectedModel, setModel])

  // Collapse Advanced Settings when Advanced Mode is turned off
  useEffect(() => {
    if (!advancedMode && isExpanded) {
      setIsExpanded(false)
    }
  }, [advancedMode, isExpanded])

  // Detect if current model is OCR model
  const isOCRModel = selectedModel === 'mistral-ocr-latest'

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
                  {editOperationName || "Test generic operations with different prompts and settings"}
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
                {editOperationName || "Test generic operations with different prompts and settings"}
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

      {/* OCR Mode Component - Only shown in Advanced Mode with OCR model */}
      {advancedMode && isOCRModel && (
        <>
          <WorkbenchOCRMode
            processor={initialProcessor}
            selectedModel={selectedModel}
          />
          <Separator />
        </>
      )}

      {/* Regular Workbench Input - Hidden when OCR is active */}
      {!(advancedMode && isOCRModel) && (
        <>
          <WorkbenchInput
            processor={initialProcessor}
            operations={[]}
          />
          <Separator />
        </>
      )}

      {/* Output Section - Shared between both modes */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Output</h2>
        <WorkbenchOutput />
      </div>
    </div>
  )
}