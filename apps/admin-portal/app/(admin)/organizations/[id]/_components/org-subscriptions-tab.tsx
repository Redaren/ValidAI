'use client'

import { useState } from 'react'
import {
  Card,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { Loader2, Package, Plus, MoreVertical } from 'lucide-react'
import { useOrganization, useOrganizationSubscriptions } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { AssignSubscriptionDialog } from '@/components/organizations/assign-subscription-dialog'
import { UpdateTierDialog } from '@/components/subscriptions/update-tier-dialog'
import { CancelSubscriptionDialog } from '@/components/subscriptions/cancel-subscription-dialog'
import { ActivateSubscriptionDialog } from '@/components/subscriptions/activate-subscription-dialog'

interface OrgSubscriptionsTabProps {
  organizationId: string
}

interface OrganizationSubscription {
  id: string
  app_id: string
  tier_id: string
  tier_name: string
  status: string
  assigned_at: string | null
  created_at: string
  notes: string | null
  app_name?: string
  app_description?: string
  tier_display_name?: string
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
  const [updateTierOpen, setUpdateTierOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [selectedSubscription, setSelectedSubscription] = useState<OrganizationSubscription | null>(
    null
  )

  const { data: organization } = useOrganization(organizationId)
  const { data: subscriptions, isLoading } = useOrganizationSubscriptions(organizationId)

  // Extract app IDs from existing subscriptions (any status) to filter in assign dialog
  const existingAppIds = subscriptions?.map((s: OrganizationSubscription) => s.app_id) || []

  const handleUpdateTier = (subscription: OrganizationSubscription) => {
    setSelectedSubscription(subscription)
    setUpdateTierOpen(true)
  }

  const handleCancel = (subscription: OrganizationSubscription) => {
    setSelectedSubscription(subscription)
    setCancelOpen(true)
  }

  const handleActivate = (subscription: OrganizationSubscription) => {
    setSelectedSubscription(subscription)
    setActivateOpen(true)
  }

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
          existingAppIds={[]}
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
        />
      </Card>
    )
  }

  // Helper to get app name from subscription
  const getAppName = (sub: OrganizationSubscription) => sub.app_name || sub.app?.name || sub.app_id
  const getAppDescription = (sub: OrganizationSubscription) =>
    sub.app_description || sub.app?.description
  const getTierDisplayName = (sub: OrganizationSubscription) =>
    sub.tier_display_name || sub.tier?.display_name || sub.tier_name
  const getTierName = (sub: OrganizationSubscription) => sub.tier?.tier_name || sub.tier_name

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
                <p className="font-medium">{getAppName(subscription)}</p>
                <Badge
                  variant={
                    getTierName(subscription) === 'enterprise'
                      ? 'default'
                      : getTierName(subscription) === 'pro'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {getTierDisplayName(subscription)}
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
              {getAppDescription(subscription) && (
                <p className="text-sm text-muted-foreground">{getAppDescription(subscription)}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Assigned {formatDate(subscription.assigned_at || subscription.created_at)}
              </p>
              {subscription.notes && (
                <p className="text-xs text-muted-foreground italic">Note: {subscription.notes}</p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleUpdateTier(subscription)}
                  disabled={subscription.status === 'canceled'}
                >
                  Update Tier
                </DropdownMenuItem>
                {subscription.status !== 'active' && (
                  <DropdownMenuItem onClick={() => handleActivate(subscription)}>
                    Activate
                  </DropdownMenuItem>
                )}
                {subscription.status === 'active' && (
                  <DropdownMenuItem
                    onClick={() => handleCancel(subscription)}
                    className="text-destructive"
                  >
                    Cancel Subscription
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <AssignSubscriptionDialog
        organizationId={organizationId}
        existingAppIds={existingAppIds}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />

      {selectedSubscription && (
        <>
          <UpdateTierDialog
            open={updateTierOpen}
            onOpenChange={setUpdateTierOpen}
            subscription={{
              id: selectedSubscription.id,
              organization_name: organization?.name || 'Unknown',
              app_id: selectedSubscription.app_id,
              app_name: getAppName(selectedSubscription),
              tier_id: selectedSubscription.tier_id,
              tier_name: getTierName(selectedSubscription),
              tier_display_name: getTierDisplayName(selectedSubscription),
            }}
          />

          <CancelSubscriptionDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            subscription={{
              id: selectedSubscription.id,
              organization_name: organization?.name || 'Unknown',
              app_name: getAppName(selectedSubscription),
            }}
          />

          <ActivateSubscriptionDialog
            open={activateOpen}
            onOpenChange={setActivateOpen}
            subscription={{
              id: selectedSubscription.id,
              organization_name: organization?.name,
              app_name: getAppName(selectedSubscription),
            }}
          />
        </>
      )}
    </Card>
  )
}
