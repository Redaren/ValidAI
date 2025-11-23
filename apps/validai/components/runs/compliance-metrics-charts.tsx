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

import { useState, useEffect } from 'react'
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@playze/shared-ui'
import { ChartConfig, ChartContainer } from '@/components/ui/chart'
import type { Database } from '@playze/shared-types'
import { useTranslations } from 'next-intl'

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
 * Calculate validation pass rate from True/False operations and Traffic Light operations
 */
function calculateValidationMetrics(results: OperationResult[]) {
  // Filter for both validation and traffic_light operations
  const relevantResults = results.filter((r) => {
    const snapshot = r.operation_snapshot as { operation_type: string }
    return (
      (snapshot.operation_type === 'validation' || snapshot.operation_type === 'traffic_light') &&
      r.status === 'completed'
    )
  })

  if (relevantResults.length === 0) {
    return { passed: 0, yellow: 0, failed: 0, passRate: 0, total: 0 }
  }

  let passed = 0
  let yellow = 0
  let failed = 0

  relevantResults.forEach((result) => {
    const snapshot = result.operation_snapshot as { operation_type: string }

    if (snapshot.operation_type === 'validation') {
      // Validation operations: true = passed, false = failed
      const structured = result.structured_output as { result?: boolean } | null
      if (structured?.result === true) {
        passed++
      } else if (structured?.result === false) {
        failed++
      }
    } else if (snapshot.operation_type === 'traffic_light') {
      // Traffic light operations: green = passed, yellow = warning, red = failed
      const structured = result.structured_output as { traffic_light?: string } | null
      if (structured?.traffic_light === 'green') {
        passed++
      } else if (structured?.traffic_light === 'yellow') {
        yellow++
      } else if (structured?.traffic_light === 'red') {
        failed++
      }
    }
  })

  const total = passed + yellow + failed
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  return { passed, yellow, failed, passRate, total }
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
  const t = useTranslations('runs.compliance')

  // Countdown state: 1500 hundredths = 15 seconds
  const [countdown, setCountdown] = useState(1500)

  // Check if any results have arrived
  const hasResults = completedOperations + failedOperations > 0

  // Countdown logic
  useEffect(() => {
    if (hasResults) return // Stop countdown when results arrive

    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1))
    }, 10) // Update every 10ms (1 hundredth of second)

    return () => clearInterval(timer)
  }, [hasResults])

  // Format countdown as ss:mm (seconds:hundredths)
  const formatCountdown = (hundredths: number): string => {
    const seconds = Math.floor(hundredths / 100)
    const remaining = hundredths % 100
    return `${seconds.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`
  }

  const progressPercent = Math.round(
    ((completedOperations + failedOperations) / totalOperations) * 100
  )

  const progressChartConfig = {
    progress: {
      label: t('progress'),
      color: 'hsl(var(--chart-1))',
    },
  } satisfies ChartConfig

  // Determine text to display
  const countdownText = countdown > 0 ? t('aiCountdown') : t('aiThinkingExtra')
  const countdownTime = formatCountdown(countdown)

  // Card title changes based on mode
  const cardTitle = hasResults ? t('progress') : countdownText

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-1">
        <CardTitle className="text-sm font-medium">{cardTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-1">
        <ChartContainer
          config={progressChartConfig}
          className="mx-auto aspect-square w-full max-w-[140px]"
        >
          <RadialBarChart
            data={[{ progress: hasResults ? progressPercent : 0 }]}
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={100}
          >
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        {hasResults ? (
                          // Progress mode: Show percentage and count
                          <>
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
                              {completedOperations + failedOperations} {t('of')} {totalOperations}
                            </tspan>
                          </>
                        ) : (
                          // Countdown mode: Show only countdown time (large)
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold tabular-nums"
                          >
                            {countdownTime}
                          </tspan>
                        )}
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
  const t = useTranslations('runs.compliance')
  const validationMetrics = calculateValidationMetrics(operationResults)

  const validationChartConfig = {
    passed: {
      label: t('passed'),
      color: 'hsl(142, 76%, 36%)',
    },
    yellow: {
      label: t('yellow'),
      color: 'hsl(48, 96%, 53%)',
    },
    failed: {
      label: t('failed'),
      color: 'hsl(0, 84%, 60%)',
    },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-1">
        <CardTitle className="text-sm font-medium">{t('validations')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-1">
        <ChartContainer
          config={validationChartConfig}
          className="mx-auto aspect-square w-full max-w-[140px]"
        >
          <RadialBarChart
            data={[
              {
                passed: validationMetrics.passed,
                yellow: validationMetrics.yellow,
                failed: validationMetrics.failed,
              },
            ]}
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={100}
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
                          {validationMetrics.passed} {t('passedOf')} {validationMetrics.total}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="passed"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-passed)"
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
              dataKey="failed"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-failed)"
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
  const t = useTranslations('runs.compliance')
  const trafficLightMetrics = calculateTrafficLightMetrics(operationResults)

  const trafficLightChartConfig = {
    green: {
      label: t('green'),
      color: 'hsl(142, 76%, 36%)',
    },
    yellow: {
      label: t('yellow'),
      color: 'hsl(48, 96%, 53%)',
    },
    red: {
      label: t('red'),
      color: 'hsl(0, 84%, 60%)',
    },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-1">
        <CardTitle className="text-sm font-medium">{t('trafficLights')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-1">
        <ChartContainer
          config={trafficLightChartConfig}
          className="mx-auto aspect-square w-full max-w-[140px]"
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
            innerRadius={60}
            outerRadius={100}
          >
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 20}
                          className="fill-foreground text-xs"
                        >
                          🟢 {trafficLightMetrics.green}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 6}
                          className="fill-foreground text-xs"
                        >
                          🟡 {trafficLightMetrics.yellow}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 8}
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
