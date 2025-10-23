'use client'

import { useState } from 'react'
import { Card, Badge, Button } from '@playze/shared-ui'
import { Loader2, Package, Plus } from 'lucide-react'
import { useOrganizationSubscriptions } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { AssignSubscriptionDialog } from '@/components/organizations/assign-subscription-dialog'

interface OrgSubscriptionsTabProps {
  organizationId: string
}

interface OrganizationSubscription {
  id: string
  app_id: string
  tier_name: string
  status: string
  assigned_at: string | null
  created_at: string
  notes: string | null
  app?: {
    name: string
    description: string | null
  }
  tier?: {
    tier_name: string
    display_name: string
  }
}

export function OrgSubscriptionsTab({ organizationId }: OrgSubscriptionsTabProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { data: subscriptions, isLoading } = useOrganizationSubscriptions(organizationId)

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (!subscriptions || subscriptions.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No subscriptions yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This organization doesn&apos;t have any app subscriptions yet.
          </p>
          <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Assign Subscription
          </Button>
        </div>

        <AssignSubscriptionDialog
          organizationId={organizationId}
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
        />
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">App Subscriptions</h3>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Assign Subscription
        </Button>
      </div>

      <div className="space-y-4">
        {subscriptions.map((subscription: OrganizationSubscription) => (
          <div
            key={subscription.id}
            className="flex items-center justify-between p-4 rounded-lg border bg-card"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <p className="font-medium">{subscription.app?.name || subscription.app_id}</p>
                <Badge
                  variant={
                    subscription.tier?.tier_name === 'enterprise'
                      ? 'default'
                      : subscription.tier?.tier_name === 'pro'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {subscription.tier?.display_name || subscription.tier_name}
                </Badge>
                <Badge
                  variant={
                    subscription.status === 'active'
                      ? 'default'
                      : subscription.status === 'canceled'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {subscription.status}
                </Badge>
              </div>
              {subscription.app?.description && (
                <p className="text-sm text-muted-foreground">{subscription.app.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Assigned {formatDate(subscription.assigned_at || subscription.created_at)}
              </p>
              {subscription.notes && (
                <p className="text-xs text-muted-foreground italic">Note: {subscription.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <AssignSubscriptionDialog
        organizationId={organizationId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </Card>
  )
}
