import { z } from 'zod'
import {
  organizationNameSchema,
  organizationDescriptionSchema,
  emailSchema,
  uuidSchema,
} from './common-schemas'

/**
 * Schema: Create Organization
 * Used by: CreateOrganizationForm component
 * Edge Function: create-organization
 *
 * Creates an organization with just a name and optional description.
 * No slug required - organizations are identified by UUID.
 */
export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  description: organizationDescriptionSchema,
  initialOwnerEmail: emailSchema.optional(),
  appSubscriptions: z
    .array(
      z.object({
        appId: z.string().min(1, 'App ID is required'),
        tierName: z.enum(['free', 'pro', 'enterprise'], {
          errorMap: () => ({ message: 'Tier must be free, pro, or enterprise' }),
        }),
      })
    )
    .optional(),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

/**
 * Schema: Update Organization
 * Used by: Organization overview tab update form
 */
export const updateOrganizationSchema = z.object({
  name: organizationNameSchema.optional(),
  description: organizationDescriptionSchema,
  is_active: z.boolean().optional(),
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/**
 * Schema: Assign Subscription
 * Used by: AssignSubscriptionDialog component
 */
export const assignSubscriptionSchema = z.object({
  organizationId: uuidSchema,
  appId: z.string().min(1, 'App ID is required'),
  tierId: uuidSchema,
  tierName: z.enum(['free', 'pro', 'enterprise'], {
    errorMap: () => ({ message: 'Tier must be free, pro, or enterprise' }),
  }),
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
})

export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>

/**
 * Schema: Assign Membership
 * Used by: AssignMembershipDialog component
 * Database function: admin_assign_member
 *
 * Validates input for assigning a user as a member to an organization.
 * Supports role selection with 'member' as the most common default.
 */
export const assignMembershipSchema = z.object({
  organizationId: uuidSchema,
  userId: uuidSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be owner, admin, member, or viewer' }),
  }).default('member'),
})

export type AssignMembershipInput = z.infer<typeof assignMembershipSchema>
