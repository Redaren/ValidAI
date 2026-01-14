import { Check, X } from 'lucide-react'
import { cn } from '@playze/shared-ui'

interface FeatureListProps {
  features: Record<string, boolean>
  limits?: Record<string, number>
  className?: string
}

/**
 * Display a list of features with checkmarks for enabled/disabled state
 * Also displays usage limits if provided
 */
export function FeatureList({ features, limits, className }: FeatureListProps) {
  const featureEntries = Object.entries(features)
  const limitEntries = limits ? Object.entries(limits) : []

  if (featureEntries.length === 0 && limitEntries.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No features configured
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Features */}
      {featureEntries.length > 0 && (
        <div className="space-y-1.5">
          {featureEntries.map(([key, enabled]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {enabled ? (
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
              )}
              <span className={cn(!enabled && 'text-muted-foreground')}>
                {formatFeatureName(key)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Limits */}
      {limitEntries.length > 0 && (
        <div className="pt-3 border-t space-y-1.5">
          {limitEntries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{formatLimitName(key)}</span>
              <span className="font-medium">{formatLimitValue(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Convert snake_case feature name to Title Case with proper spacing
 * Example: "advanced_mapping" -> "Advanced Mapping"
 */
function formatFeatureName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Convert snake_case limit name to readable format
 * Example: "storage_gb" -> "Storage (GB)"
 */
function formatLimitName(name: string): string {
  // Handle special cases
  const formatted = name
    .split('_')
    .map((word, index) => {
      // Uppercase units
      if (word === 'gb' || word === 'tb' || word === 'mb') {
        return `(${word.toUpperCase()})`
      }
      // Capitalize first word
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word
    })
    .join(' ')

  return formatted
}

/**
 * Format limit value to be human-readable
 * -1 becomes "Unlimited", large numbers get commas
 */
function formatLimitValue(value: number): string {
  if (value === -1) {
    return 'Unlimited'
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return value.toLocaleString()
  }
  return value.toString()
}
