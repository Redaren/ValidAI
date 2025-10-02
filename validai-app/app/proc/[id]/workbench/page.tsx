import { Suspense } from "react"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WorkbenchClient } from "./workbench-client"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Workbench Page - Server Component
 *
 * Provides a testbench environment for testing processor operations with LLMs.
 * Fetches processor data server-side and passes to client component.
 */
export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch processor with operations
  const { data: processor, error } = await supabase
    .rpc('get_processor_with_operations', {
      p_processor_id: id
    })
    .single()

  if (error || !processor) {
    notFound()
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Suspense fallback={<WorkbenchSkeleton />}>
        <WorkbenchClient
          processorId={id}
          initialProcessor={processor}
        />
      </Suspense>
    </div>
  )
}

function WorkbenchSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}