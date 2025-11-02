"use client"

/**
 * Structured Output Visualizer Component
 *
 * Automatically infers and renders structured data (JSON/XML) using appropriate
 * shadcn UI components. Designed to simulate how operation results appear in
 * production reports processing hundreds of documents.
 *
 * Visualization Patterns:
 * - Array of objects → Table
 * - Status/result objects → Traffic light indicators
 * - Simple lists → Badge grid
 * - Key-value pairs → Card with definition list
 * - Nested objects → Accordion sections
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Card,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@playze/shared-ui'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface StructuredOutputVisualizerProps {
  data: unknown
  originalType: 'json' | 'xml'
  showRawToggle?: boolean
}

type VisualizationType = 'traffic-light' | 'table' | 'badges' | 'card' | 'accordion'

/**
 * Infer the best visualization type based on data structure
 */
function inferVisualizationType(data: unknown): VisualizationType {
  if (data === null || data === undefined) {
    return 'card'
  }

  // Check for status/result patterns (traffic light) - includes validation type
  if (typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data as Record<string, unknown>).map(k => k.toLowerCase())
    const statusKeys = ['status', 'result', 'compliant', 'answer', 'has_cap', 'valid', 'success', 'passed', 'failed', 'traffic_light']
    const hasStatus = statusKeys.some(sk => keys.includes(sk))

    if (hasStatus) {
      return 'traffic-light'
    }

    // Check for extraction pattern (items + comment)
    if (keys.includes('items') && keys.includes('comment')) {
      return 'badges'
    }

    // Check for rating pattern (value + comment)
    if (keys.includes('value') && keys.includes('comment')) {
      return 'card'
    }

    // Check for classification pattern (classification + comment)
    if (keys.includes('classification') && keys.includes('comment')) {
      return 'card'
    }

    // Check for analysis pattern (conclusion + comment)
    if (keys.includes('conclusion') && keys.includes('comment')) {
      return 'card'
    }
  }

  // Array of objects with consistent keys → Table
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0]
    if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
      // Check if all items have similar structure
      const firstKeys = Object.keys(firstItem)
      const allSimilar = data.every(item =>
        typeof item === 'object' &&
        item !== null &&
        Object.keys(item).some(k => firstKeys.includes(k))
      )
      if (allSimilar) {
        return 'table'
      }
    }
  }

  // Array of strings or simple values → Badges
  if (Array.isArray(data)) {
    return 'badges'
  }

  // Object with nested objects → Accordion
  if (typeof data === 'object' && !Array.isArray(data)) {
    const values = Object.values(data as Record<string, unknown>)
    const hasNestedObjects = values.some(v => typeof v === 'object' && v !== null && !Array.isArray(v))
    if (hasNestedObjects) {
      return 'accordion'
    }
  }

  // Default: simple card
  return 'card'
}

/**
 * Normalize status value to traffic light color
 */
function getTrafficLightColor(value: unknown): { color: string; emoji: string; label: string } {
  const str = String(value).toLowerCase()

  // Green (positive) - includes explicit 'green' for traffic_light operation type
  if (['pass', 'passed', 'yes', 'true', 'success', 'compliant', 'valid', 'ok', 'green'].includes(str)) {
    return { color: 'bg-green-500', emoji: '🟢', label: String(value) }
  }

  // Red (negative) - includes explicit 'red' for traffic_light operation type
  if (['fail', 'failed', 'no', 'false', 'error', 'non-compliant', 'invalid', 'not ok', 'red'].includes(str)) {
    return { color: 'bg-red-500', emoji: '🔴', label: String(value) }
  }

  // Yellow (warning/pending) - includes explicit 'yellow' for traffic_light operation type
  if (['warning', 'pending', 'partial', 'review', 'yellow'].includes(str)) {
    return { color: 'bg-yellow-500', emoji: '🟡', label: String(value) }
  }

  // Default gray
  return { color: 'bg-gray-500', emoji: '⚪', label: String(value) }
}

/**
 * Render traffic light visualization for status/result data
 */
function TrafficLightView({ data }: { data: unknown }) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return <CardView data={data} />
  }

  const dataObj = data as Record<string, unknown>
  const keys = Object.keys(dataObj)
  const statusKey = keys.find(k => {
    const lower = k.toLowerCase()
    return ['status', 'result', 'compliant', 'answer', 'has_cap', 'valid', 'success', 'passed', 'failed', 'traffic_light'].includes(lower)
  })

  if (!statusKey) {
    return <CardView data={data} />
  }

  const statusValue = dataObj[statusKey]
  const { emoji, label } = getTrafficLightColor(statusValue)

  // Get additional fields
  const otherFields = keys.filter(k => k !== statusKey)

  // Check for severity
  const severityKey = keys.find(k => k.toLowerCase().includes('severity'))
  const severityValue = severityKey ? dataObj[severityKey] : null
  const severity = severityValue ? String(severityValue) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{emoji}</span>
        <div>
          <div className="font-semibold text-lg capitalize">{label}</div>
          {severity && (
            <div className="text-sm text-muted-foreground">
              Severity: <Badge variant={severity.toLowerCase() === 'high' ? 'destructive' : 'secondary'}>{severity}</Badge>
            </div>
          )}
        </div>
      </div>

      {otherFields.length > 0 && (
        <dl className="space-y-2 text-sm">
          {otherFields.map(key => {
            const value = dataObj[key]
            if (Array.isArray(value)) {
              return (
                <div key={key}>
                  <dt className="font-medium text-muted-foreground capitalize mb-1">{key.replace(/_/g, ' ')}:</dt>
                  <dd className="space-y-1">
                    {value.map((item, idx) => (
                      <div key={idx} className="ml-4">• {String(item)}</div>
                    ))}
                  </dd>
                </div>
              )
            }
            return (
              <div key={key} className="flex gap-2">
                <dt className="font-medium text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</dt>
                <dd>{String(value)}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}

/**
 * Render table visualization for array of objects
 */
function TableView({ data }: { data: unknown[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-sm text-muted-foreground">Empty data</div>
  }

  // Get all unique keys from all objects
  const allKeys = Array.from(
    new Set(
      data.flatMap(item =>
        typeof item === 'object' && item !== null ? Object.keys(item) : []
      )
    )
  )

  if (allKeys.length === 0) {
    return <div className="text-sm text-muted-foreground">No fields to display</div>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {allKeys.map(key => (
              <TableHead key={key} className="capitalize">
                {key.replace(/_/g, ' ')}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={idx}>
              {allKeys.map(key => {
                const rowObj = row as Record<string, unknown>
                const value = rowObj[key]
                return (
                  <TableCell key={key}>
                    {typeof value === 'object' && value !== null
                      ? JSON.stringify(value)
                      : String(value ?? '')}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Render badge grid for simple arrays
 * Enhanced for extraction operation type with items + comment
 */
function BadgeListView({ data }: { data: unknown[] | unknown }) {
  // Check for extraction pattern (object with items array and comment)
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const dataObj = data as Record<string, unknown>
    if ('items' in dataObj && Array.isArray(dataObj.items) && 'comment' in dataObj) {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl mt-0.5">🔍</span>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-2">Extracted Items ({dataObj.items.length})</div>
              <div className="flex flex-wrap gap-2">
                {dataObj.items.map((item: unknown, idx: number) => (
                  <Badge key={idx} variant="secondary">
                    {String(item)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="text-sm whitespace-pre-wrap">{String(dataObj.comment)}</div>
        </div>
      )
    }
  }

  // Default badge list for plain arrays
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-sm text-muted-foreground">Empty list</div>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {data.map((item, idx) => (
        <Badge key={idx} variant="secondary">
          {typeof item === 'object' ? JSON.stringify(item) : String(item)}
        </Badge>
      ))}
    </div>
  )
}

/**
 * Render card with key-value pairs
 * Enhanced for rating, classification, and analysis operation types
 */
function CardView({ data }: { data: unknown }) {
  const t = useTranslations('workbench.structured')

  if (typeof data !== 'object' || data === null) {
    return <div className="text-sm">{String(data)}</div>
  }

  const dataObj = data as Record<string, unknown>
  const entries = Object.entries(dataObj)

  // Special handling for new operation types with prominent display
  const hasRatingPattern = 'value' in dataObj && 'comment' in dataObj
  const hasClassificationPattern = 'classification' in dataObj && 'comment' in dataObj
  const hasAnalysisPattern = 'conclusion' in dataObj && 'comment' in dataObj

  if (hasRatingPattern) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⭐</span>
          <div>
            <div className="font-semibold text-2xl">{String(dataObj.value)}</div>
            <div className="text-xs text-muted-foreground">{t('rating')}</div>
          </div>
        </div>
        <div className="text-sm whitespace-pre-wrap">{String(dataObj.comment)}</div>
      </div>
    )
  }

  if (hasClassificationPattern) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏷️</span>
          <div>
            <div className="font-semibold text-lg">{String(dataObj.classification)}</div>
            <div className="text-xs text-muted-foreground">{t('classification')}</div>
          </div>
        </div>
        <div className="text-sm whitespace-pre-wrap">{String(dataObj.comment)}</div>
      </div>
    )
  }

  if (hasAnalysisPattern) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📊</span>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">{t('conclusion')}</div>
            <div className="font-semibold text-base">{String(dataObj.conclusion)}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">{t('analysis')}</div>
          <div className="text-sm whitespace-pre-wrap">{String(dataObj.comment)}</div>
        </div>
      </div>
    )
  }

  // Default card layout for generic key-value pairs
  return (
    <dl className="space-y-2 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="font-medium text-muted-foreground capitalize min-w-[120px]">
            {key.replace(/_/g, ' ')}:
          </dt>
          <dd className="flex-1 whitespace-pre-wrap">
            {typeof value === 'object' && value !== null
              ? JSON.stringify(value, null, 2)
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Render accordion for nested objects
 */
function AccordionView({ data }: { data: unknown }) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return <CardView data={data} />
  }

  const entries = Object.entries(data as Record<string, unknown>)

  return (
    <Accordion type="single" collapsible className="w-full">
      {entries.map(([key, value]) => (
        <AccordionItem key={key} value={key}>
          <AccordionTrigger className="capitalize">
            {key.replace(/_/g, ' ')}
          </AccordionTrigger>
          <AccordionContent>
            {typeof value === 'object' && value !== null ? (
              Array.isArray(value) ? (
                value.every(item => typeof item === 'object' && item !== null) ? (
                  <TableView data={value} />
                ) : (
                  <BadgeListView data={value} />
                )
              ) : (
                <CardView data={value} />
              )
            ) : (
              <div className="text-sm">{String(value)}</div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/**
 * Main structured output visualizer component
 */
export function StructuredOutputVisualizer({
  data,
  originalType,
  showRawToggle = true
}: StructuredOutputVisualizerProps) {
  const [showRaw, setShowRaw] = useState(false)
  const visualizationType = inferVisualizationType(data)

  // Get a title from the data structure
  const getTitle = () => {
    if (Array.isArray(data)) {
      return 'List Data'
    }
    if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, unknown>
      const keys = Object.keys(dataObj)
      if (keys.length === 1) {
        return keys[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }
      // Check if there's a meaningful root key (for XML converted to JSON)
      const rootKey = keys.find(k => typeof dataObj[k] === 'object')
      if (rootKey) {
        return rootKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }
    }
    return 'Structured Output'
  }

  return (
    <Card className="p-4 bg-blue-50/30 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/30">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {originalType.toUpperCase()}
            </Badge>
            <span className="text-sm font-medium text-muted-foreground">
              {getTitle()}
            </span>
          </div>
          {showRawToggle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRaw(!showRaw)}
              className="h-7 text-xs"
            >
              {showRaw ? (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Hide Raw
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Show Raw
                </>
              )}
            </Button>
          )}
        </div>

        {/* Visualization */}
        {!showRaw && (
          <div className="pt-2">
            {visualizationType === 'traffic-light' && <TrafficLightView data={data} />}
            {visualizationType === 'table' && <TableView data={data as unknown[]} />}
            {visualizationType === 'badges' && <BadgeListView data={data} />}
            {visualizationType === 'card' && <CardView data={data} />}
            {visualizationType === 'accordion' && <AccordionView data={data} />}
          </div>
        )}

        {/* Raw JSON view */}
        {showRaw && (
          <div className="rounded-md bg-muted/50 p-3 border">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Card>
  )
}
