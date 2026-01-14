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
import { Loader2, CheckCircle } from 'lucide-react'
import { activateSubscriptionSchema, type ActivateSubscriptionInput } from '@/lib/validations'
import { useActivateSubscription } from '@/lib/queries'
import { useToastStore } from '@/stores'

interface ActivateSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: {
    id: string
    organization_name?: string
    app_name?: string
    app?: {
      name: string
    }
  }
}

export function ActivateSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
}: ActivateSubscriptionDialogProps) {
  const activateSubscription = useActivateSubscription()
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ActivateSubscriptionInput>({
    resolver: zodResolver(activateSubscriptionSchema),
    defaultValues: {
      subscriptionId: subscription.id,
    },
  })

  const onSubmit = async (data: ActivateSubscriptionInput) => {
    try {
      await activateSubscription.mutateAsync(data)

      addToast({
        title: 'Subscription activated',
        description: 'The subscription has been activated successfully.',
        variant: 'success',
      })

      onOpenChange(false)
      reset()
    } catch (error) {
      console.error('Error activating subscription:', error)
      addToast({
        title: 'Error activating subscription',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  // Get app name from either format
  const appName = subscription.app_name || subscription.app?.name || 'Unknown App'
  const orgName = subscription.organization_name || 'this organization'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate Subscription</DialogTitle>
          <DialogDescription>
            Reactivate this subscription to restore access to the app for the organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <div className="ml-2">
              <p className="text-sm font-medium">You are about to activate:</p>
              <p className="text-sm text-muted-foreground mt-1">
                Organization: <span className="font-medium">{orgName}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                App: <span className="font-medium">{appName}</span>
              </p>
            </div>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason">Activation Reason (Optional)</Label>
            <Textarea
              id="reason"
              {...register('reason')}
              placeholder="Why is this subscription being reactivated?"
              rows={3}
              disabled={isSubmitting}
            />
            {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
          </div>

          {activateSubscription.error && (
            <Alert variant="destructive">
              <p className="text-sm">
                {activateSubscription.error instanceof Error
                  ? activateSubscription.error.message
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
              {isSubmitting ? 'Activating...' : 'Activate Subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
