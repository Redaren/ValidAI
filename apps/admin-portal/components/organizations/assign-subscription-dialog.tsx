'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Alert,
} from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { assignSubscriptionSchema, type AssignSubscriptionInput } from '@/lib/validations'
import { useAssignSubscription } from '@/lib/queries'
import { useApps } from '@/lib/queries/tiers'
import { useAppTiers } from '@/lib/queries/subscriptions'
import { useToastStore } from '@/stores'

interface AssignSubscriptionDialogProps {
  organizationId: string
  existingAppIds: string[]
  isOpen: boolean
  onClose: () => void
}

interface AppTier {
  id: string
  tier_name: string
  display_name: string
}

export function AssignSubscriptionDialog({
  organizationId,
  existingAppIds,
  isOpen,
  onClose,
}: AssignSubscriptionDialogProps) {
  const [selectedAppId, setSelectedAppId] = useState('')

  const assignSub = useAssignSubscription()
  const addToast = useToastStore((state) => state.addToast)

  // Use TanStack Query hooks instead of manual useEffect + useState
  const { data: apps = [], isLoading: loadingApps } = useApps()
  const { data: tiersData = [], isLoading: loadingTiers } = useAppTiers(selectedAppId)
  const tiers = tiersData as AppTier[]

  // Filter out apps that already have subscriptions (regardless of status)
  const availableApps = apps.filter((app) => !existingAppIds.includes(app.id))
  const allAppsSubscribed = !loadingApps && availableApps.length === 0

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<Omit<AssignSubscriptionInput, 'organizationId'>>({
    resolver: zodResolver(assignSubscriptionSchema.omit({ organizationId: true })),
  })

  const onSubmit = async (data: Omit<AssignSubscriptionInput, 'organizationId'>) => {
    try {
      await assignSub.mutateAsync({
        ...data,
        organizationId,
      })

      addToast({
        title: 'Subscription assigned',
        description: 'The subscription has been assigned successfully.',
        variant: 'success',
      })

      reset()
      setSelectedAppId('')
      onClose()
    } catch (error) {
      console.error('Error assigning subscription:', error)
      addToast({
        title: 'Error assigning subscription',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleClose = () => {
    reset()
    setSelectedAppId('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Subscription</DialogTitle>
          <DialogDescription>
            Assign an app subscription to this organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* App Selection */}
          <div className="space-y-2">
            <Label htmlFor="appId">
              App <span className="text-destructive">*</span>
            </Label>
            {allAppsSubscribed ? (
              <Alert>
                <p className="text-sm">
                  This organization already has subscriptions for all available apps. Use
                  &quot;Update Tier&quot; or &quot;Activate&quot; to manage existing subscriptions.
                </p>
              </Alert>
            ) : (
              <Select
                value={selectedAppId}
                onValueChange={(value) => {
                  setSelectedAppId(value)
                  setValue('appId', value)
                  setValue('tierId', '')
                  setValue('tierName', '' as 'free' | 'pro' | 'enterprise')
                }}
                disabled={loadingApps || isSubmitting}
              >
                <SelectTrigger id="appId">
                  <SelectValue placeholder={loadingApps ? 'Loading...' : 'Select an app'} />
                </SelectTrigger>
                <SelectContent>
                  {availableApps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.appId && (
              <p className="text-sm text-destructive">{errors.appId.message}</p>
            )}
          </div>

          {/* Tier Selection */}
          {selectedAppId && (
            <div className="space-y-2">
              <Label htmlFor="tierId">
                Tier <span className="text-destructive">*</span>
              </Label>
              <Select
                onValueChange={(value) => {
                  const tier = tiers.find((t) => t.id === value)
                  if (tier) {
                    setValue('tierId', value)
                    setValue('tierName', tier.tier_name as 'free' | 'pro' | 'enterprise')
                  }
                }}
                disabled={loadingTiers || isSubmitting || tiers.length === 0}
              >
                <SelectTrigger id="tierId">
                  <SelectValue
                    placeholder={
                      loadingTiers
                        ? 'Loading...'
                        : tiers.length === 0
                          ? 'No tiers available'
                          : 'Select a tier'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tierId && (
                <p className="text-sm text-destructive">{errors.tierId.message}</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={3}
              placeholder="Add any notes about this subscription..."
              disabled={isSubmitting}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          {/* Error Alert */}
          {assignSub.error && (
            <Alert variant="destructive">
              <p className="text-sm">
                {assignSub.error instanceof Error
                  ? assignSub.error.message
                  : 'An unexpected error occurred'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedAppId || allAppsSubscribed}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Assigning...' : 'Assign Subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
