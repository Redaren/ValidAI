import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '@playze/shared-ui'
import { Check, X } from 'lucide-react'
import type { AppTierWithApp } from '@/lib/queries'

interface TierComparisonTableProps {
  tiers: AppTierWithApp[]
  appName: string
}

/**
 * Database-focused tier comparison table
 * Shows configuration data in a comparison format for easy analysis
 */
export function TierComparisonTable({ tiers, appName }: TierComparisonTableProps) {
  if (tiers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Tiers Configured</CardTitle>
          <CardDescription>No tier configurations found for {appName}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Sort tiers: free, pro, enterprise
  const sortedTiers = [...tiers].sort((a, b) => {
    const tierOrder = { free: 0, pro: 1, enterprise: 2 }
    const orderA = tierOrder[a.tier_name as keyof typeof tierOrder] ?? 999
    const orderB = tierOrder[b.tier_name as keyof typeof tierOrder] ?? 999
    return orderA - orderB
  })

  // Get all unique feature keys across all tiers
  const allFeatures = Array.from(
    new Set(
      sortedTiers.flatMap((tier) =>
        tier.features ? Object.keys(tier.features as Record<string, boolean>) : []
      )
    )
  )

  // Get all unique limit keys across all tiers
  const allLimits = Array.from(
    new Set(
      sortedTiers.flatMap((tier) =>
        tier.limits ? Object.keys(tier.limits as Record<string, number>) : []
      )
    )
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tier Configuration for {appName}</CardTitle>
        <CardDescription>Database configuration comparison across subscription tiers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2">
                <th className="text-left p-3 font-semibold text-sm w-1/4">Configuration</th>
                {sortedTiers.map((tier) => (
                  <th key={tier.id} className="text-center p-3 font-semibold text-sm">
                    <div className="flex flex-col items-center gap-1">
                      <span>{tier.display_name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {tier.tier_name}
                      </Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* FEATURES SECTION */}
              {allFeatures.length > 0 && (
                <>
                  <tr className="bg-muted/50">
                    <td colSpan={sortedTiers.length + 1} className="p-2 font-semibold text-xs uppercase tracking-wide">
                      Features
                    </td>
                  </tr>
                  {allFeatures.map((featureName) => (
                    <tr key={featureName} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-sm">{formatFeatureName(featureName)}</td>
                      {sortedTiers.map((tier) => {
                        const features = tier.features as Record<string, boolean> | null
                        const hasFeature = features?.[featureName]
                        return (
                          <td key={tier.id} className="p-3 text-center">
                            {hasFeature ? (
                              <Check className="h-5 w-5 text-green-600 mx-auto" />
                            ) : (
                              <X className="h-5 w-5 text-gray-300 mx-auto" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              )}

              {/* LIMITS SECTION */}
              {allLimits.length > 0 && (
                <>
                  <tr className="bg-muted/50">
                    <td colSpan={sortedTiers.length + 1} className="p-2 font-semibold text-xs uppercase tracking-wide">
                      Limits
                    </td>
                  </tr>
                  {allLimits.map((limitName) => (
                    <tr key={limitName} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-sm">{formatLimitName(limitName)}</td>
                      {sortedTiers.map((tier) => {
                        const limits = tier.limits as Record<string, number> | null
                        const limitValue = limits?.[limitName]
                        return (
                          <td key={tier.id} className="p-3 text-center font-medium">
                            {limitValue !== undefined ? formatLimitValue(limitValue) : '-'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              )}

              {/* PRICING SECTION */}
              <tr className="bg-muted/50">
                <td colSpan={sortedTiers.length + 1} className="p-2 font-semibold text-xs uppercase tracking-wide">
                  Pricing
                </td>
              </tr>
              <tr className="border-b hover:bg-muted/30">
                <td className="p-3 text-sm">Monthly</td>
                {sortedTiers.map((tier) => (
                  <td key={tier.id} className="p-3 text-center font-medium">
                    {formatPrice(tier.price_monthly)}
                  </td>
                ))}
              </tr>
              <tr className="border-b hover:bg-muted/30">
                <td className="p-3 text-sm">Yearly</td>
                {sortedTiers.map((tier) => (
                  <td key={tier.id} className="p-3 text-center font-medium">
                    {formatPrice(tier.price_yearly)}
                  </td>
                ))}
              </tr>

              {/* METADATA SECTION */}
              <tr className="bg-muted/50">
                <td colSpan={sortedTiers.length + 1} className="p-2 font-semibold text-xs uppercase tracking-wide">
                  Metadata
                </td>
              </tr>
              <tr className="border-b hover:bg-muted/30">
                <td className="p-3 text-sm">Tier ID</td>
                {sortedTiers.map((tier) => (
                  <td key={tier.id} className="p-3 text-center">
                    <code className="text-xs bg-muted px-2 py-1 rounded">{tier.id}</code>
                  </td>
                ))}
              </tr>
              <tr className="border-b hover:bg-muted/30">
                <td className="p-3 text-sm">Status</td>
                {sortedTiers.map((tier) => (
                  <td key={tier.id} className="p-3 text-center">
                    {tier.is_active ? (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b hover:bg-muted/30">
                <td className="p-3 text-sm">Description</td>
                {sortedTiers.map((tier) => (
                  <td key={tier.id} className="p-3 text-center text-xs text-muted-foreground">
                    {tier.description || '-'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          <p>
            Configuration data from <code>app_tiers</code> table. Tier IDs and features are stored
            in the database and can be modified via migrations.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Format feature name from snake_case to Title Case
 */
function formatFeatureName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Format limit name from snake_case to readable format
 */
function formatLimitName(name: string): string {
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
 * Format limit value (-1 = Unlimited, large numbers get commas)
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

/**
 * Format price (null = Contact Sales, 0 = Free)
 */
function formatPrice(price: number | null): string {
  if (price === null) {
    return 'Contact Sales'
  }
  if (price === 0) {
    return 'Free'
  }
  return `$${price}`
}
