/**
 * Compliance Metrics Charts Component
 *
 * @module components/runs/compliance-metrics-charts
 * @description
 * Displays three radial charts showing key compliance metrics:
 * - Progress: Overall completion percentage
 * - Validations: Pass rate for True/False operations
 * - Traffic Lights: Distribution of Red/Yellow/Green results
 *
 * Charts update in real-time as operations complete.
 *
 * @since Phase 4 - Compliance View
 */

'use client'

import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@playze/shared-ui'
import { ChartConfig, ChartContainer } from '@/components/ui/chart'
import type { Database } from '@playze/shared-types'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface ComplianceMetricsChartsProps {
  /** Array of operation results to calculate metrics from */
  operationResults: OperationResult[]
  /** Total number of operations in the run */
  totalOperations: number
  /** Number of completed operations */
  completedOperations: number
  /** Number of failed operations */
  failedOperations: number
}

/**
 * Calculate validation pass rate from True/False operations
 */
function calculateValidationMetrics(results: OperationResult[]) {
  const validationResults = results.filter((r) => {
    const snapshot = r.operation_snapshot as { operation_type: string }
    return snapshot.operation_type === 'validation' && r.status === 'completed'
  })

  if (validationResults.length === 0) {
    return { trueCount: 0, falseCount: 0, passRate: 0, total: 0 }
  }

  let trueCount = 0
  let falseCount = 0

  validationResults.forEach((result) => {
    const structured = result.structured_output as { result?: boolean } | null
    if (structured?.result === true) {
      trueCount++
    } else if (structured?.result === false) {
      falseCount++
    }
  })

  const total = trueCount + falseCount
  const passRate = total > 0 ? Math.round((trueCount / total) * 100) : 0

  return { trueCount, falseCount, passRate, total }
}

/**
 * Calculate traffic light distribution from traffic_light operations
 */
function calculateTrafficLightMetrics(results: OperationResult[]) {
  const trafficLightResults = results.filter((r) => {
    const snapshot = r.operation_snapshot as { operation_type: string }
    return snapshot.operation_type === 'traffic_light' && r.status === 'completed'
  })

  if (trafficLightResults.length === 0) {
    return { red: 0, yellow: 0, green: 0, total: 0 }
  }

  let red = 0
  let yellow = 0
  let green = 0

  trafficLightResults.forEach((result) => {
    const structured = result.structured_output as { traffic_light?: string } | null
    if (structured?.traffic_light === 'red') {
      red++
    } else if (structured?.traffic_light === 'yellow') {
      yellow++
    } else if (structured?.traffic_light === 'green') {
      green++
    }
  })

  return { red, yellow, green, total: red + yellow + green }
}

/**
 * Progress Chart Component
 * Shows overall completion percentage during processing
 */
interface ProgressChartProps {
  totalOperations: number
  completedOperations: number
  failedOperations: number
}

export function ProgressChart({
  totalOperations,
  completedOperations,
  failedOperations,
}: ProgressChartProps) {
  const progressPercent = Math.round(
    ((completedOperations + failedOperations) / totalOperations) * 100
  )

  const progressChartConfig = {
    progress: {
      label: 'Progress',
      color: 'hsl(var(--chart-1))',
    },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-2">
        <CardTitle className="text-sm font-medium">Progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-4">
        <ChartContainer
          config={progressChartConfig}
          className="mx-auto aspect-square w-full max-w-[180px]"
        >
          <RadialBarChart
            data={[{ progress: progressPercent }]}
            startAngle={180}
            endAngle={0}
            innerRadius={80}
            outerRadius={130}
          >
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 8}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {progressPercent}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 12}
                          className="fill-muted-foreground text-xs"
                        >
                          {completedOperations + failedOperations} of {totalOperations}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="progress"
              fill="var(--color-progress)"
              cornerRadius={10}
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

/**
 * Validation Chart Component
 * Shows pass rate for True/False validation operations
 */
interface ValidationChartProps {
  operationResults: OperationResult[]
}

export function ValidationChart({ operationResults }: ValidationChartProps) {
  const validationMetrics = calculateValidationMetrics(operationResults)

  const validationChartConfig = {
    validations: {
      label: 'Validations',
      color: validationMetrics.passRate >= 70 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)',
    },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-2">
        <CardTitle className="text-sm font-medium">Validations</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-4">
        <ChartContainer
          config={validationChartConfig}
          className="mx-auto aspect-square w-full max-w-[180px]"
        >
          <RadialBarChart
            data={[{ validations: validationMetrics.passRate }]}
            startAngle={180}
            endAngle={0}
            innerRadius={80}
            outerRadius={130}
          >
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 8}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {validationMetrics.passRate}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 12}
                          className="fill-muted-foreground text-xs"
                        >
                          {validationMetrics.trueCount} passed of {validationMetrics.total}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="validations"
              fill="var(--color-validations)"
              cornerRadius={10}
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

/**
 * Traffic Light Chart Component
 * Shows distribution of Red/Yellow/Green traffic light results
 */
interface TrafficLightChartProps {
  operationResults: OperationResult[]
}

export function TrafficLightChart({ operationResults }: TrafficLightChartProps) {
  const trafficLightMetrics = calculateTrafficLightMetrics(operationResults)

  const trafficLightChartConfig = {
    green: {
      label: 'Green',
      color: 'hsl(142, 76%, 36%)',
    },
    yellow: {
      label: 'Yellow',
      color: 'hsl(48, 96%, 53%)',
    },
    red: {
      label: 'Red',
      color: 'hsl(0, 84%, 60%)',
    },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-2">
        <CardTitle className="text-sm font-medium">Traffic Lights</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-4">
        <ChartContainer
          config={trafficLightChartConfig}
          className="mx-auto aspect-square w-full max-w-[180px]"
        >
          <RadialBarChart
            data={[
              {
                green: trafficLightMetrics.green,
                yellow: trafficLightMetrics.yellow,
                red: trafficLightMetrics.red,
              },
            ]}
            startAngle={180}
            endAngle={0}
            innerRadius={80}
            outerRadius={130}
          >
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 8}
                          className="fill-foreground text-xs"
                        >
                          🟢 {trafficLightMetrics.green}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 6}
                          className="fill-foreground text-xs"
                        >
                          🟡 {trafficLightMetrics.yellow}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 20}
                          className="fill-foreground text-xs"
                        >
                          🔴 {trafficLightMetrics.red}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="green"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-green)"
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="yellow"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-yellow)"
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="red"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-red)"
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

/**
 * Compliance Metrics Charts
 *
 * Wrapper component that displays all three radial charts side-by-side.
 * Used during processing to show Progress, Validations, and Traffic Lights.
 * Updates in real-time as operations complete via parent subscription.
 */
export function ComplianceMetricsCharts({
  operationResults,
  totalOperations,
  completedOperations,
  failedOperations,
}: ComplianceMetricsChartsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ProgressChart
        totalOperations={totalOperations}
        completedOperations={completedOperations}
        failedOperations={failedOperations}
      />
      <ValidationChart operationResults={operationResults} />
      <TrafficLightChart operationResults={operationResults} />
    </div>
  )
}
