"use client"

import { useState, useMemo } from "react"
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Checkbox,
} from "@playze/shared-ui"
import { useUserProcessors, type Processor } from "@/app/queries/processors/use-processors"
import { type GalleryArea } from "@/app/queries/galleries"
import { Search } from 'lucide-react'

interface AddProcessorsToAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  area: GalleryArea | null
  onAdd: (processorIds: string[]) => void
  isLoading?: boolean
}

/**
 * Add Processors to Area Dialog Component
 *
 * A dialog for selecting and adding processors to a gallery area. Features:
 * - Search functionality to filter processors
 * - Checkbox selection for multiple processors
 * - Filters out processors already in the area
 * - Shows processor name and usage description
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param area - The area to add processors to
 * @param onAdd - Callback when processors are added (receives array of processor IDs)
 * @param isLoading - Whether the add operation is in progress
 */
export function AddProcessorsToAreaDialog({
  open,
  onOpenChange,
  area,
  onAdd,
  isLoading = false,
}: AddProcessorsToAreaDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Fetch all processors (using loadAll for client-side filtering)
  const { data: processorsData, isLoading: isLoadingProcessors } = useUserProcessors(false, {
    loadAll: true,
  })

  // Get processor IDs already in this area
  const existingProcessorIds = useMemo(() => {
    return new Set(area?.processors.map(p => p.processor_id) || [])
  }, [area])

  // Filter processors: exclude those already in area, and apply search
  const availableProcessors = useMemo(() => {
    if (!processorsData?.processors) return []

    return processorsData.processors
      .filter(processor => {
        // Exclude processors already in this area
        if (existingProcessorIds.has(processor.id)) return false

        // Only show published processors
        if (processor.status !== 'published') return false

        // Apply search filter
        if (search) {
          const searchLower = search.toLowerCase()
          return (
            processor.name.toLowerCase().includes(searchLower) ||
            processor.description?.toLowerCase().includes(searchLower) ||
            processor.usage_description?.toLowerCase().includes(searchLower)
          )
        }

        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [processorsData, existingProcessorIds, search])

  const handleToggleProcessor = (processorId: string) => {
    setSelectedIds(prev =>
      prev.includes(processorId)
        ? prev.filter(id => id !== processorId)
        : [...prev, processorId]
    )
  }

  const handleToggleAll = () => {
    if (selectedIds.length === availableProcessors.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(availableProcessors.map(p => p.id))
    }
  }

  const handleAdd = () => {
    if (selectedIds.length > 0) {
      onAdd(selectedIds)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedIds([])
      setSearch('')
    }
    onOpenChange(open)
  }

  if (!area) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Processors to &quot;{area.area_name}&quot;</DialogTitle>
          <DialogDescription>
            Select processors to add to this area. Only published processors are shown.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search processors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              disabled={isLoading || isLoadingProcessors}
            />
          </div>

          {/* Select All */}
          {availableProcessors.length > 0 && (
            <div className="flex items-center space-x-2 px-1">
              <Checkbox
                id="select-all"
                checked={selectedIds.length === availableProcessors.length}
                onCheckedChange={handleToggleAll}
                disabled={isLoading || isLoadingProcessors}
              />
              <Label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer"
              >
                Select all ({availableProcessors.length})
              </Label>
            </div>
          )}

          {/* Processor List */}
          <div className="flex-1 overflow-y-auto border rounded-md">
            {isLoadingProcessors ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Loading processors...</p>
              </div>
            ) : availableProcessors.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? 'No processors match your search'
                    : 'No available processors to add'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {availableProcessors.map((processor) => (
                  <div
                    key={processor.id}
                    className="flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      id={processor.id}
                      checked={selectedIds.includes(processor.id)}
                      onCheckedChange={() => handleToggleProcessor(processor.id)}
                      disabled={isLoading}
                      className="mt-1"
                    />
                    <Label
                      htmlFor={processor.id}
                      className="flex-1 cursor-pointer space-y-1"
                    >
                      <div className="font-medium">{processor.name}</div>
                      {processor.usage_description && (
                        <div className="text-sm text-muted-foreground">
                          {processor.usage_description}
                        </div>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selection Count */}
          {selectedIds.length > 0 && (
            <div className="text-sm text-muted-foreground px-1">
              {selectedIds.length} {selectedIds.length === 1 ? 'processor' : 'processors'} selected
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={isLoading || selectedIds.length === 0}
          >
            {isLoading
              ? 'Adding...'
              : `Add ${selectedIds.length > 0 ? `(${selectedIds.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
