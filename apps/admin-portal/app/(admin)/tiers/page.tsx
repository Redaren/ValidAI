import { TierComparison } from '@/components/tiers/tier-comparison'

export const metadata = {
  title: 'Tier Configurations | Admin Portal',
  description: 'View and compare app tier configurations and features',
}

export default function TiersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tier Configurations</h1>
        <p className="text-muted-foreground">
          View and compare app subscription tiers, features, and limits
        </p>
      </div>

      <TierComparison />
    </div>
  )
}
