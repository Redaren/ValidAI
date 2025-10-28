"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@playze/shared-ui"
import { ProcessorsTable } from "@/components/processors/processors-table"
import { CreateProcessorSheet } from "@/components/processors/create-processor-sheet"
import { useUserProcessors } from "@/app/queries/processors/use-processors"

export default function ProcessorsPage() {
  const { data: processors, isLoading, error } = useUserProcessors(false)
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-600">Failed to load processors</p>
        <p className="text-sm text-muted-foreground mt-2">
          {error instanceof Error ? error.message : "Unknown error occurred"}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Processors</h1>
          <p className="text-muted-foreground">
            Create and manage AI-powered document analysis templates
          </p>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : processors && processors.length > 0 ? (
        <ProcessorsTable data={processors} />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No processors yet</h2>
          <p className="text-muted-foreground max-w-md">
            Get started by creating your first document processor to analyze contracts,
            invoices, or any other documents.
          </p>
          <Button className="mt-4" onClick={() => setIsCreateSheetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first processor
          </Button>
        </div>
      )}

      <CreateProcessorSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
      />
    </div>
  )
}