/**
 * Comparison Export Utilities
 *
 * @module lib/export/compare-export
 * @description
 * Utility functions to export run comparison data to various formats.
 * Supports PDF export and clipboard (Excel/TSV) export.
 *
 * **Features:**
 * - PDF export with jsPDF and autoTable
 * - TSV (Tab-Separated Values) for Excel/Sheets
 * - Includes metadata (document name, date)
 * - Preserves area grouping
 * - Compact formatting for readability
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Database } from '@playze/shared-types'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface OperationSnapshot {
  id: string
  name: string
  area: string
  operation_type: string
  [key: string]: unknown
}

interface ProcessorSnapshot {
  processor: {
    id: string
    name: string
  }
  document: {
    name: string
    size_bytes: number
  }
  operations: OperationSnapshot[]
}

/**
 * Gets compact result text for export
 */
function getResultText(result: OperationResult | undefined, operationType: string): string {
  if (!result) return '-'

  const structured = result.structured_output as any

  if (result.status === 'failed') return 'Error'
  if (result.status === 'pending' || result.status === 'processing') return '...'

  switch (operationType) {
    case 'validation':
      return structured?.result === true ? 'True' : structured?.result === false ? 'False' : '-'

    case 'traffic_light':
      return structured?.traffic_light || '-'

    case 'rating':
      return structured?.value !== undefined ? String(structured.value) : '-'

    case 'extraction': {
      const items = structured?.items
      if (Array.isArray(items)) {
        return items.length === 1 ? String(items[0]) : `${items.length} values`
      }
      return '-'
    }

    case 'classification':
      return structured?.classification || '-'

    case 'analysis':
      return structured?.conclusion || structured?.comment || '-'

    case 'generic':
      return structured?.response || result.response_text || '-'

    default:
      return result.response_text || '-'
  }
}

/**
 * Formats date for export
 */
function formatDateForExport(isoString: string): string {
  return new Date(isoString).toLocaleString()
}

/**
 * Groups operations by area
 */
function groupOperationsByArea(operations: OperationSnapshot[] | undefined): Array<{
  area: string
  operations: OperationSnapshot[]
}> {
  if (!operations || operations.length === 0) {
    return []
  }

  const groups = new Map<string, OperationSnapshot[]>()

  operations.forEach((op) => {
    const area = op.area || 'Uncategorized'
    if (!groups.has(area)) {
      groups.set(area, [])
    }
    groups.get(area)!.push(op)
  })

  return Array.from(groups.entries()).map(([area, ops]) => ({
    area,
    operations: ops,
  }))
}

/**
 * Exports comparison to clipboard as TSV (Tab-Separated Values)
 * Compatible with Excel, Google Sheets, and other spreadsheet applications.
 *
 * @param runs - Array of runs to export
 * @param resultsMap - Map of run_id to operation results
 * @returns Promise that resolves when copied to clipboard
 *
 * @example
 * ```tsx
 * await exportToClipboard(runs, resultsMap)
 * toast.success('Copied to clipboard!')
 * ```
 */
export async function exportToClipboard(
  runs: Run[],
  resultsMap: Record<string, OperationResult[]>
): Promise<void> {
  if (runs.length === 0) return

  const firstRun = runs[0]
  const snapshot = firstRun?.snapshot as unknown as ProcessorSnapshot
  const allOperations = snapshot?.operations
  const groupedOperations = groupOperationsByArea(allOperations)

  const lines: string[] = []

  // Header row with metadata
  const headers = ['Operation', ...runs.map((run) => {
    const runSnapshot = run.snapshot as unknown as ProcessorSnapshot
    return `${runSnapshot.document.name} (${formatDateForExport(run.started_at)})`
  })]
  lines.push(headers.join('\t'))

  // Data rows (grouped by area)
  groupedOperations.forEach((group) => {
    // Area header row
    lines.push(`\n${group.area}`)

    // Operation rows
    group.operations.forEach((operation) => {
      const row = [operation.name]

      runs.forEach((run) => {
        const runResults = resultsMap[run.id] || []
        const result = runResults.find((r) => {
          const opSnapshot = r.operation_snapshot as OperationSnapshot
          return opSnapshot.id === operation.id
        })

        row.push(getResultText(result, operation.operation_type))
      })

      lines.push(row.join('\t'))
    })
  })

  // Copy to clipboard
  const tsvContent = lines.join('\n')
  await navigator.clipboard.writeText(tsvContent)
}

/**
 * Exports comparison to PDF
 *
 * Uses jsPDF and autoTable to generate a formatted PDF with:
 * - Processor name and export date in header
 * - Metadata for each run (document name, date)
 * - Operations grouped by area
 * - Compact result display
 *
 * @param runs - Array of runs to export
 * @param resultsMap - Map of run_id to operation results
 * @param processorName - Name of processor (for header)
 *
 * @example
 * ```tsx
 * exportToPDF(runs, resultsMap, processor.name)
 * ```
 */
export function exportToPDF(
  runs: Run[],
  resultsMap: Record<string, OperationResult[]>,
  processorName: string
): void {
  if (runs.length === 0) return

  const firstRun = runs[0]
  const snapshot = firstRun?.snapshot as unknown as ProcessorSnapshot
  const allOperations = snapshot?.operations
  const groupedOperations = groupOperationsByArea(allOperations)

  // Determine orientation based on number of runs
  const orientation = runs.length <= 3 ? 'portrait' : 'landscape'

  // Create PDF
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })

  // Header
  doc.setFontSize(16)
  doc.text(`Run Comparison: ${processorName}`, 14, 15)

  doc.setFontSize(10)
  doc.text(`Exported: ${new Date().toLocaleString()}`, 14, 22)

  // Table headers
  const headers = ['Operation', ...runs.map((run) => {
    const runSnapshot = run.snapshot as unknown as ProcessorSnapshot
    return runSnapshot.document.name
  })]

  // Table body (grouped by area)
  const body: string[][] = []

  groupedOperations.forEach((group) => {
    // Area header row
    body.push([{ content: group.area, colSpan: runs.length + 1, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }] as any)

    // Operation rows
    group.operations.forEach((operation) => {
      const row = [operation.name]

      runs.forEach((run) => {
        const runResults = resultsMap[run.id] || []
        const result = runResults.find((r) => {
          const opSnapshot = r.operation_snapshot as OperationSnapshot
          return opSnapshot.id === operation.id
        })

        row.push(getResultText(result, operation.operation_type))
      })

      body.push(row)
    })
  })

  // Generate table
  autoTable(doc, {
    head: [headers],
    body: body,
    startY: 28,
    theme: 'striped',
    headStyles: { fillColor: [66, 139, 202] },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
    },
  })

  // Save PDF
  doc.save(`comparison-${processorName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`)
}
