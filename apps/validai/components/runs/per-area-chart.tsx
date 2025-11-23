/**
 * Per Area Chart Component
 *
 * @module components/runs/per-area-chart
 * @description
 * Displays traffic light and validation results grouped by area in a table format.
 * Shows color-coded counts (green/yellow/red) for each area with a total row.
 *
 * **Features:**
 * - Groups results by user-defined area names
 * - Shows traffic light (green/yellow/red) and validation (true/false) counts
 * - "Happy loading": Shows areas from snapshot immediately, counts appear as results arrive
 * - Only displays non-zero counts for individual areas
 * - Always shows total row (even if all zeros at start)
 * - Multi-language support via i18n
 *
 * @since Phase 4 - Per Area View
 */

'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@playze/shared-ui'
import type { Database } from '@playze/shared-types'
import { useTranslations } from 'next-intl'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface PerAreaChartProps {
  /** The run object containing snapshot data */
  run: Run
  /** Array of operation results to calculate metrics from */
  operationResults: OperationResult[]
}

/**
 * Calculate area metrics from operation results
 */
interface AreaMetrics {
  area: string
  green: number
  yellow: number
  red: number
  total: number
}

function calculateAreaMetrics(operationResults: OperationResult[]): AreaMetrics[] {
  // Group results by area
  const groupedByArea = new Map<string, OperationResult[]>()

  operationResults.forEach((result) => {
    const snapshot = result.operation_snapshot as { area?: string | null; operation_type: string }
    const area = snapshot.area || 'Default'

    if (!groupedByArea.has(area)) {
      groupedByArea.set(area, [])
    }
    groupedByArea.get(area)!.push(result)
  })

  // Calculate metrics for each area
  const metrics: AreaMetrics[] = []

  groupedByArea.forEach((results, area) => {
    let green = 0
    let yellow = 0
    let red = 0

    results.forEach((result) => {
      // Only count completed results
      if (result.status !== 'completed') return

      const snapshot = result.operation_snapshot as { operation_type: string }
      const structured = result.structured_output as any

      if (snapshot.operation_type === 'traffic_light') {
        // Traffic light operations
        if (structured?.traffic_light === 'green') green++
        else if (structured?.traffic_light === 'yellow') yellow++
        else if (structured?.traffic_light === 'red') red++
      } else if (snapshot.operation_type === 'validation') {
        // Validation operations: true = green, false = red
        if (structured?.result === true) green++
        else if (structured?.result === false) red++
      }
    })

    metrics.push({
      area,
      green,
      yellow,
      red,
      total: green + yellow + red,
    })
  })

  // Sort alphabetically by area name
  metrics.sort((a, b) => a.area.localeCompare(b.area))

  return metrics
}

/**
 * Extract area names from run snapshot
 * Used for "happy loading" - showing areas before results arrive
 */
function getAreasFromSnapshot(run: Run): string[] {
  const snapshot = run.snapshot as {
    operations?: Array<{ area?: string | null }>
  } | null

  if (!snapshot?.operations) return []

  // Get unique area names
  const areas = new Set<string>()
  snapshot.operations.forEach((op) => {
    const area = op.area || 'Default'
    areas.add(area)
  })

  // Sort alphabetically
  return Array.from(areas).sort()
}

/**
 * Per Area Chart Component
 *
 * Displays traffic light and validation results grouped by area.
 * Shows areas immediately from snapshot, counts appear as results arrive.
 */
export function PerAreaChart({ run, operationResults }: PerAreaChartProps) {
  const t = useTranslations('runs.compliance.perArea')

  // Get areas from snapshot (for happy loading)
  const snapshotAreas = useMemo(() => getAreasFromSnapshot(run), [run])

  // Calculate metrics from actual results
  const areaMetrics = useMemo(
    () => calculateAreaMetrics(operationResults),
    [operationResults]
  )

  // Merge snapshot areas with metrics
  // This ensures we show all areas from start, even if no results yet
  const displayMetrics = useMemo(() => {
    // If we have metrics, use them
    if (areaMetrics.length > 0) {
      return areaMetrics
    }

    // Otherwise, create empty metrics for snapshot areas
    return snapshotAreas.map((area) => ({
      area,
      green: 0,
      yellow: 0,
      red: 0,
      total: 0,
    }))
  }, [snapshotAreas, areaMetrics])

  // Calculate totals
  const totals = useMemo(() => {
    return displayMetrics.reduce(
      (acc, metrics) => ({
        green: acc.green + metrics.green,
        yellow: acc.yellow + metrics.yellow,
        red: acc.red + metrics.red,
        total: acc.total + metrics.total,
      }),
      { green: 0, yellow: 0, red: 0, total: 0 }
    )
  }, [displayMetrics])

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-3">
        <CardTitle className="text-sm font-medium">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <div className="space-y-0.5">
          {/* Header Row */}
          <div className="grid grid-cols-[1fr,auto,auto,auto] gap-2 border-b pb-1 text-xs text-muted-foreground">
            <div>{t('area')}</div>
            <div className="w-10 flex justify-center">
              <div className="h-3 w-3 rounded-full bg-[hsl(142,76%,36%)]" />
            </div>
            <div className="w-10 flex justify-center">
              <div className="h-3 w-3 rounded-full bg-[hsl(48,96%,53%)]" />
            </div>
            <div className="w-10 flex justify-center">
              <div className="h-3 w-3 rounded-full bg-[hsl(0,84%,60%)]" />
            </div>
          </div>

          {/* Area Rows */}
          {displayMetrics.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('noAreas')}
            </div>
          ) : (
            <>
              {displayMetrics.map((metrics) => (
                <div
                  key={metrics.area}
                  className="grid grid-cols-[1fr,auto,auto,auto] gap-2 items-center"
                >
                  <div className="text-xs text-muted-foreground truncate">{metrics.area}</div>
                  <div className="w-10 flex justify-center">
                    {metrics.green > 0 && (
                      <span className="text-xs text-muted-foreground">{metrics.green}</span>
                    )}
                  </div>
                  <div className="w-10 flex justify-center">
                    {metrics.yellow > 0 && (
                      <span className="text-xs text-muted-foreground">{metrics.yellow}</span>
                    )}
                  </div>
                  <div className="w-10 flex justify-center">
                    {metrics.red > 0 && (
                      <span className="text-xs text-muted-foreground">{metrics.red}</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Total Row */}
              <div className="grid grid-cols-[1fr,auto,auto,auto] gap-2 items-center pt-1">
                <div className="text-xs text-muted-foreground text-right pr-2">{t('total')}</div>
                <div className="w-10 flex justify-center border-t pt-1">
                  <span className="text-xs text-muted-foreground">{totals.green}</span>
                </div>
                <div className="w-10 flex justify-center border-t pt-1">
                  <span className="text-xs text-muted-foreground">{totals.yellow}</span>
                </div>
                <div className="w-10 flex justify-center border-t pt-1">
                  <span className="text-xs text-muted-foreground">{totals.red}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
