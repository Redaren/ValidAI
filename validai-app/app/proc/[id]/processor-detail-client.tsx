"use client"

import { useProcessorDetail } from "@/app/queries/processors/use-processor-detail"
import { ProcessorHeader } from "@/components/processors/processor-header"
import { OperationsByArea } from "@/components/processors/operations-by-area"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface ProcessorDetailClientProps {
  processorId: string
}

export function ProcessorDetailClient({
  processorId,
}: ProcessorDetailClientProps) {
  const { data: processor, isLoading, error } = useProcessorDetail(processorId)

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

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Back Navigation */}
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/proc">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Processors
          </Link>
        </Button>
      </div>

      {/* Processor Header */}
      <ProcessorHeader processor={processor} />

      {/* Operations by Area */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Operations</h2>
        <OperationsByArea processor={processor} />
      </div>
    </div>
  )
}