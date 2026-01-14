import { z } from 'zod'
import {
  organizationNameSchema,
  organizationDescriptionSchema,
  emailSchema,
  uuidSchema,
  optionalTextSchema,
  phoneSchema,
  countryCodeSchema,
} from './common-schemas'

/**
 * Schema: Create Organization
 * Used by: CreateOrganizationForm component
 * Edge Function: create-organization
 *
 * Creates an organization with a name, required default app, and subscription tier.
 * The default app determines where invited users are redirected.
 * A subscription is automatically created for the selected app/tier.
 */
export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  description: organizationDescriptionSchema,
  default_app_id: z.string().min(1, 'Default app is required'),
  tier_name: z.enum(['free', 'pro', 'enterprise'], {
    message: 'Tier must be free, pro, or enterprise',
  }),
  appSubscriptions: z
    .array(
      z.object({
        appId: z.string().min(1, 'App ID is required'),
        tierName: z.enum(['free', 'pro', 'enterprise'], {
          message: 'Tier must be free, pro, or enterprise',
        }),
      })
    )
    .optional(),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

/**
 * Schema: Update Organization
 * Used by: Organization overview tab update form
 * Includes all extended fields for invoicing and CRM
 */
export const updateOrganizationSchema = z.object({
  // Core fields
  name: organizationNameSchema.optional(),
  description: organizationDescriptionSchema,
  is_active: z.boolean().optional(),
  default_app_id: z.string().nullable().optional(),
  // Legal/Invoicing fields
  org_number: optionalTextSchema,
  vat_number: optionalTextSchema,
  street_address: optionalTextSchema,
  postal_code: optionalTextSchema,
  city: optionalTextSchema,
  country: countryCodeSchema,
  // Contact details
  contact_person: optionalTextSchema,
  contact_role: optionalTextSchema,
  contact_email: emailSchema.optional().nullable(),
  contact_phone: phoneSchema,
  // Internal/Misc fields
  referral: optionalTextSchema,
  lead_source: optionalTextSchema,
  kam: optionalTextSchema,
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
    message: 'Tier must be free, pro, or enterprise',
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
    message: 'Role must be owner, admin, member, or viewer',
  }),
})

export type AssignMembershipInput = z.infer<typeof assignMembershipSchema>

/**
 * Schema: Invite Member
 * Used by: InviteMemberDialog component
 * Edge Function: organizations/invite-member
 *
 * Validates input for inviting a user to an organization via email.
 * The user may or may not exist in the system already.
 */
export const inviteMemberSchema = z.object({
  organizationId: uuidSchema,
  email: emailSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    message: 'Role must be owner, admin, member, or viewer',
  }),
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

/**
 * Schema: Update Invitation Role
 * Used by: OrgMembersTab edit role action
 * Database function: admin_update_invitation_role
 *
 * Validates input for changing the role of a pending invitation.
 */
export const updateInvitationRoleSchema = z.object({
  invitationId: uuidSchema,
  organizationId: uuidSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    message: 'Role must be owner, admin, member, or viewer',
  }),
})

export type UpdateInvitationRoleInput = z.infer<typeof updateInvitationRoleSchema>

/**
 * Schema: Organization Search/Pagination
 * Used by: useOrganizationsPaginated hook
 * Database function: admin_list_organizations_paginated
 *
 * Validates input for server-side search and pagination of organizations.
 */
export const organizationSearchSchema = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
})

export type OrganizationSearchInput = z.infer<typeof organizationSearchSchema>
