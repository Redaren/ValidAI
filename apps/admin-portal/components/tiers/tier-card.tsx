import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '@playze/shared-ui'
import { FeatureList } from './feature-list'
import type { AppTierWithApp } from '@/lib/queries'

interface TierCardProps {
  tier: AppTierWithApp
  highlight?: boolean
}

/**
 * Display a single tier in card format with features, limits, and pricing
 * Used in tier comparison view to show tiers side-by-side
 */
export function TierCard({ tier, highlight = false }: TierCardProps) {
  return (
    <Card className={highlight ? 'border-primary shadow-md' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{tier.display_name}</CardTitle>
          <TierBadge tierName={tier.tier_name} />
        </div>
        {tier.description && (
          <CardDescription className="text-sm mt-2">{tier.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Pricing */}
        <div className="pb-6 border-b">
          <PricingDisplay
            priceMonthly={tier.price_monthly}
            priceYearly={tier.price_yearly}
            tierName={tier.tier_name}
          />
        </div>

        {/* Features & Limits */}
        <div>
          <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
            Features & Limits
          </h4>
          <FeatureList
            features={tier.features as Record<string, boolean>}
            limits={tier.limits as Record<string, number>}
          />
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
          <div>
            <span className="font-medium">Tier ID:</span> {tier.id}
          </div>
          <div>
            <span className="font-medium">Status:</span>{' '}
            {tier.is_active ? (
              <Badge variant="default" className="text-xs">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Badge component for tier name with color coding
 */
function TierBadge({ tierName }: { tierName: string }) {
  const variants = {
    free: 'secondary',
    pro: 'default',
    enterprise: 'outline',
  } as const

  return (
    <Badge variant={variants[tierName as keyof typeof variants] || 'secondary'} className="text-xs">
      {tierName.toUpperCase()}
    </Badge>
  )
}

/**
 * Display pricing information with monthly/yearly options
 */
function PricingDisplay({
  priceMonthly,
  priceYearly,
  tierName,
}: {
  priceMonthly: number | null
  priceYearly: number | null
  tierName: string
}) {
  // Free tier
  if (tierName === 'free' || (priceMonthly === 0 && priceYearly === 0)) {
    return <div className="text-3xl font-bold">Free</div>
  }

  // Contact sales (null pricing)
  if (priceMonthly === null && priceYearly === null) {
    return (
      <div>
        <div className="text-2xl font-bold text-muted-foreground">Contact Sales</div>
        <div className="text-sm text-muted-foreground mt-1">Custom pricing</div>
      </div>
    )
  }

  // Show monthly pricing
  if (priceMonthly !== null && priceMonthly > 0) {
    return (
      <div>
        <div className="text-3xl font-bold">
          ${priceMonthly}
          <span className="text-base font-normal text-muted-foreground">/month</span>
        </div>
        {priceYearly !== null && priceYearly > 0 && (
          <div className="text-sm text-muted-foreground mt-1">
            or ${priceYearly}/year{' '}
            <span className="text-green-600 font-medium">
              (Save ${(priceMonthly * 12 - priceYearly).toFixed(0)})
            </span>
          </div>
        )}
      </div>
    )
  }

  // Show yearly pricing only
  if (priceYearly !== null && priceYearly > 0) {
    return (
      <div>
        <div className="text-3xl font-bold">
          ${priceYearly}
          <span className="text-base font-normal text-muted-foreground">/year</span>
        </div>
      </div>
    )
  }

  return (
    <div className="text-sm text-muted-foreground">Pricing not configured</div>
  )
}
