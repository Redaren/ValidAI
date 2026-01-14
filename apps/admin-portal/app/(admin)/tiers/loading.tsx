import { Card } from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'

export default function TiersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tier Configurations</h1>
        <p className="text-muted-foreground">
          View and compare app subscription tiers, features, and limits
        </p>
      </div>

      <Card className="p-12">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading tier configurations...</span>
        </div>
      </Card>
    </div>
  )
}
