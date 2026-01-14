import { z } from 'zod'
import { uuidSchema } from './common-schemas'

/**
 * Schema: Update Subscription Tier
 * Used by: UpdateTierDialog component
 * Database Function: admin_update_subscription_tier()
 */
export const updateSubscriptionTierSchema = z.object({
  subscriptionId: uuidSchema,
  tierId: uuidSchema,
  tierName: z.enum(['free', 'pro', 'enterprise'], {
    message: 'Tier must be free, pro, or enterprise',
  }),
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
})

export type UpdateSubscriptionTierInput = z.infer<typeof updateSubscriptionTierSchema>

/**
 * Schema: Cancel Subscription
 * Used by: CancelSubscriptionDialog component
 * Database Function: admin_cancel_subscription()
 */
export const cancelSubscriptionSchema = z.object({
  subscriptionId: uuidSchema,
  reason: z.string().max(500, 'Reason must be at most 500 characters').optional(),
})

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>

/**
 * Schema: Activate Subscription
 * Used by: ActivateSubscriptionDialog component
 * Database Function: admin_activate_subscription()
 */
export const activateSubscriptionSchema = z.object({
  subscriptionId: uuidSchema,
  reason: z.string().max(500, 'Reason must be at most 500 characters').optional(),
})

export type ActivateSubscriptionInput = z.infer<typeof activateSubscriptionSchema>

/**
 * Schema: Subscription Filters
 * Used by: SubscriptionsTable component for client-side filtering
 */
export const subscriptionFiltersSchema = z.object({
  status: z.enum(['active', 'past_due', 'canceled', 'all']).default('active'),
  appId: z.string().optional(),
  search: z.string().optional(),
})

export type SubscriptionFiltersInput = z.infer<typeof subscriptionFiltersSchema>
