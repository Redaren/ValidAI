"use client"

import { useState, useMemo } from "react"
import { useProcessorDetail, useCreateArea } from "@/app/queries/processors/use-processor-detail"
import { ProcessorHeader } from "@/components/processors/processor-header"
import { OperationsByArea } from "@/components/processors/operations-by-area"
import { CreateAreaDialog } from "@/components/processors/create-area-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowLeft, MoreHorizontal, FolderPlus, Settings, FlaskConical, Play, History } from "lucide-react"
import Link from "next/link"
import { ProcessorSettingsSheet } from "@/components/processors/processor-settings-sheet"
import { RunProcessorDialog } from "@/components/processors/run-processor-dialog"

/**
 * Props for the ProcessorDetailClient component.
 */
interface ProcessorDetailClientProps {
  /** The UUID of the processor to display */
  processorId: string
}

/**
 * Client Component: Processor Detail View
 *
 * This is the main interactive component for viewing and managing a processor.
 * It displays the processor header, operations organized by areas, and provides
 * area management functionality.
 *
 * **Features:**
 * - Displays processor metadata (name, description, status, etc.)
 * - Shows operations grouped and organized by areas
 * - Allows creating new areas via dropdown menu
 * - Supports drag-and-drop for operations and areas (delegated to OperationsByArea)
 *
 * **Component Architecture:**
 * ```
 * ProcessorDetailClient
 * ├── ProcessorHeader (metadata display)
 * ├── Operations Section
 * │   ├── Dropdown Menu (area management)
 * │   └── OperationsByArea (drag-and-drop interface)
 * └── CreateAreaDialog (modal)
 * ```
 *
 * **State Management:**
 * - Uses TanStack Query for server state (processor data)
 * - Uses React state for UI state (dialog visibility)
 * - Rehydrates from server-prefetched data (see page.tsx)
 *
 * **Data Flow:**
 * 1. Component receives processorId from parent
 * 2. useProcessorDetail hook fetches/rehydrates processor data
 * 3. existingAreaNames computed for validation
 * 4. Changes propagate through mutation hooks to server
 * 5. Cache automatically invalidates and refetches
 *
 * @param processorId - UUID of the processor to display
 * @returns The interactive processor detail view
 */
export function ProcessorDetailClient({
  processorId,
}: ProcessorDetailClientProps) {
  const { data: processor, isLoading, error } = useProcessorDetail(processorId)
  const createArea = useCreateArea()
  const [isCreateAreaDialogOpen, setIsCreateAreaDialogOpen] = useState(false)
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState(false)

  /**
   * Computed list of existing area names for uniqueness validation.
   * Used by CreateAreaDialog to prevent duplicate area names.
   */
  const existingAreaNames = useMemo(() => {
    return processor?.area_configuration?.areas?.map(a => a.name) || []
  }, [processor?.area_configuration])

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading processor...</div>
      </div>
    )
  }

  if (error || !processor) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <div className="text-destructive">Failed to load processor</div>
        <Button asChild variant="outline">
          <Link href="/proc">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Processors
          </Link>
        </Button>
      </div>
    )
  }

  /**
   * Handles creating a new area.
   * Mutations are handled by TanStack Query with automatic cache invalidation.
   *
   * @param areaName - The name of the new area to create
   */
  const handleCreateArea = (areaName: string) => {
    createArea.mutate(
      {
        processorId: processor.processor_id,
        areaName,
      },
      {
        onSuccess: () => {
          setIsCreateAreaDialogOpen(false)
        },
      }
    )
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Processor Header */}
      <ProcessorHeader processor={processor} />

      {/* Operations by Area */}
      <div className="space-y-4 rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Operations</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More options">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <RunProcessorDialog
                  processorId={processor.processor_id}
                  trigger={
                    <div className="flex w-full cursor-pointer items-center">
                      <Play className="mr-2 h-4 w-4" />
                      Run Processor
                    </div>
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/proc/${processor.processor_id}/runs`}>
                  <History className="mr-2 h-4 w-4" />
                  View Runs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsSettingsSheetOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/proc/${processor.processor_id}/workbench`}>
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Workbench
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsCreateAreaDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New Area
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <OperationsByArea processor={processor} />
      </div>

      <CreateAreaDialog
        open={isCreateAreaDialogOpen}
        onOpenChange={setIsCreateAreaDialogOpen}
        existingNames={existingAreaNames}
        onCreate={handleCreateArea}
        isLoading={createArea.isPending}
      />

      <ProcessorSettingsSheet
        open={isSettingsSheetOpen}
        onOpenChange={setIsSettingsSheetOpen}
        processor={processor}
      />
    </div>
  )
}