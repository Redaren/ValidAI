'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Label,
  Textarea,
  Alert,
} from '@playze/shared-ui'
import { Loader2, AlertTriangle } from 'lucide-react'
import { cancelSubscriptionSchema, type CancelSubscriptionInput } from '@/lib/validations'
import { useCancelSubscription } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface CancelSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: {
    id: string
    organization_name: string
    app_name: string
  }
}

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
}: CancelSubscriptionDialogProps) {
  const cancelSubscription = useCancelSubscription()
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CancelSubscriptionInput>({
    resolver: zodResolver(cancelSubscriptionSchema),
    defaultValues: {
      subscriptionId: subscription.id,
    },
  })

  const onSubmit = async (data: CancelSubscriptionInput) => {
    try {
      await cancelSubscription.mutateAsync(data)

      addToast({
        title: 'Subscription canceled',
        description: 'The subscription has been canceled successfully.',
        variant: 'success',
      })

      onOpenChange(false)
      reset()
    } catch (error) {
      console.error('Error canceling subscription:', error)
      addToast({
        title: 'Error canceling subscription',
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
          <DialogTitle>Cancel Subscription</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this subscription? This action will set the status to
            &quot;canceled&quot; but will not delete the record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <div className="ml-2">
              <p className="text-sm font-medium">You are about to cancel:</p>
              <p className="text-sm text-muted-foreground mt-1">
                Organization: <span className="font-medium">{subscription.organization_name}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                App: <span className="font-medium">{subscription.app_name}</span>
              </p>
            </div>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason">Cancellation Reason (Optional)</Label>
            <Textarea
              id="reason"
              {...register('reason')}
              placeholder="Why is this subscription being canceled?"
              rows={3}
              disabled={isSubmitting}
            />
            {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
          </div>

          {cancelSubscription.error && (
            <Alert variant="destructive">
              <p className="text-sm">
                {cancelSubscription.error instanceof Error
                  ? cancelSubscription.error.message
                  : 'An unexpected error occurred'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Canceling...' : 'Cancel Subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
