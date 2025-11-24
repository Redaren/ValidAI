/**
 * Run Comparison Page
 *
 * @module app/[locale]/(authenticated)/proc/[id]/runs/compare/page
 * @description
 * Displays side-by-side comparison of multiple processor runs (2-5 runs).
 * Shows operation results in a compact, scannable format grouped by area.
 *
 * **Features:**
 * - Parse run IDs from query parameters
 * - Fetch all runs and operation results in parallel
 * - Display metadata (document name, date)
 * - Group operations by area
 * - Compact result display by operation type
 * - Click cell to view expanded details
 * - Export to PDF and Excel
 *
 * **URL Format:**
 * `/proc/[id]/runs/compare?runs=id1,id2,id3`
 *
 * **Validation:**
 * - 2-5 runs required
 * - All runs must belong to same processor
 * - All runs must be completed status
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

import { notFound } from 'next/navigation'
import { CompareView } from '@/components/runs/compare-view'

interface ComparePageProps {
  params: Promise<{
    locale: string
    id: string // processor_id
  }>
  searchParams: Promise<{
    runs?: string
  }>
}

export default async function ComparePage({ params, searchParams }: ComparePageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  const processorId = resolvedParams.id
  const runsParam = resolvedSearchParams.runs

  // Validate runs parameter exists
  if (!runsParam) {
    notFound()
  }

  // Parse run IDs
  const runIds = runsParam.split(',').filter(Boolean)

  // Validate 2-5 runs
  if (runIds.length < 2 || runIds.length > 5) {
    notFound()
  }

  return <CompareView processorId={processorId} runIds={runIds} />
}
