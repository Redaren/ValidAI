'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
  Textarea,
  Alert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { updateSubscriptionTierSchema, type UpdateSubscriptionTierInput } from '@/lib/validations'
import { useUpdateSubscriptionTier, useAppTiers } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface UpdateTierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: {
    id: string
    organization_name: string
    app_id: string
    app_name: string
    tier_id: string
    tier_name: string
    tier_display_name: string
  }
}

export function UpdateTierDialog({ open, onOpenChange, subscription }: UpdateTierDialogProps) {
  const updateTier = useUpdateSubscriptionTier()
  const { data: tiers, isLoading: loadingTiers } = useAppTiers(subscription.app_id)
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UpdateSubscriptionTierInput>({
    resolver: zodResolver(updateSubscriptionTierSchema),
    defaultValues: {
      subscriptionId: subscription.id,
      tierId: subscription.tier_id,
      tierName: subscription.tier_name as 'free' | 'pro' | 'enterprise',
    },
  })

  const selectedTierId = watch('tierId')

  // Update tier name when tier ID changes
  useEffect(() => {
    if (selectedTierId && tiers) {
      const tier = tiers.find((t: { id: string }) => t.id === selectedTierId)
      if (tier) {
        setValue('tierName', tier.tier_name as 'free' | 'pro' | 'enterprise')
      }
    }
  }, [selectedTierId, tiers, setValue])

  const onSubmit = async (data: UpdateSubscriptionTierInput) => {
    try {
      await updateTier.mutateAsync(data)

      addToast({
        title: 'Tier updated',
        description: 'The subscription tier has been updated successfully.',
        variant: 'success',
      })

      onOpenChange(false)
      reset()
    } catch (error) {
      console.error('Error updating tier:', error)
      addToast({
        title: 'Error updating tier',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Subscription Tier</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Organization: <span className="font-medium">{subscription.organization_name}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              App: <span className="font-medium">{subscription.app_name}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tierId">
              New Tier <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedTierId}
              onValueChange={(value) => setValue('tierId', value)}
              disabled={loadingTiers || isSubmitting}
            >
              <SelectTrigger id="tierId">
                <SelectValue
                  placeholder={loadingTiers ? 'Loading...' : 'Select a tier'}
                />
              </SelectTrigger>
              <SelectContent>
                {tiers?.map((tier: { id: string; display_name: string; tier_name: string }) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.display_name} ({tier.tier_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tierId && <p className="text-sm text-destructive">{errors.tierId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Reason for tier change..."
              rows={3}
              disabled={isSubmitting}
            />
            {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
          </div>

          {updateTier.error && (
            <Alert variant="destructive">
              <p className="text-sm">
                {updateTier.error instanceof Error
                  ? updateTier.error.message
                  : 'An unexpected error occurred'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Updating...' : 'Update Tier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
