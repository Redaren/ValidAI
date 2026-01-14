import { z } from 'zod'
import { uuidSchema } from './common-schemas'

/**
 * Schema: User Search/Filter
 * Used by: UsersTable component for client-side filtering
 */
export const userSearchSchema = z.object({
  search: z.string().optional(),
  organizationId: uuidSchema.optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
})

export type UserSearchInput = z.infer<typeof userSearchSchema>

/**
 * Schema: User Details Lookup
 * Used by: User details page for validating user ID parameter
 */
export const userIdSchema = z.object({
  id: uuidSchema,
})

export type UserIdInput = z.infer<typeof userIdSchema>

/**
 * Schema: Update User Profile
 * Used by: User detail page profile tab for editing user profile
 */
export const updateUserProfileSchema = z.object({
  userId: uuidSchema,
  fullName: z.string().min(1, 'Name is required').max(255).trim().optional(),
  avatarUrl: z.string().url('Invalid URL format').optional().nullable(),
})

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>

/**
 * Schema: Update User Preferences
 * Used by: User detail page profile tab for editing preferences
 */
export const updateUserPreferencesSchema = z.object({
  userId: uuidSchema,
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().min(2).max(10).optional(),
  emailNotifications: z.boolean().optional(),
})

export type UpdateUserPreferencesInput = z.infer<typeof updateUserPreferencesSchema>

/**
 * Schema: Update User Membership Role
 * Used by: User detail page organizations tab for changing user role in an org
 */
export const updateUserMembershipRoleSchema = z.object({
  userId: uuidSchema,
  organizationId: uuidSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
})

export type UpdateUserMembershipRoleInput = z.infer<typeof updateUserMembershipRoleSchema>

/**
 * Schema: Remove User Membership
 * Used by: User detail page organizations tab for removing user from org
 */
export const removeUserMembershipSchema = z.object({
  userId: uuidSchema,
  organizationId: uuidSchema,
})

export type RemoveUserMembershipInput = z.infer<typeof removeUserMembershipSchema>

/**
 * Schema: Assign User to Organization
 * Used by: Assign to organization dialog
 */
export const assignUserToOrganizationSchema = z.object({
  userId: uuidSchema,
  organizationId: uuidSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
})

export type AssignUserToOrganizationInput = z.infer<typeof assignUserToOrganizationSchema>

/**
 * Schema: Toggle User Membership Active Status
 * Used by: User detail page organizations tab for activating/deactivating membership
 */
export const toggleUserMembershipActiveSchema = z.object({
  userId: uuidSchema,
  organizationId: uuidSchema,
  isActive: z.boolean(),
})

export type ToggleUserMembershipActiveInput = z.infer<typeof toggleUserMembershipActiveSchema>

/**
 * Schema: Create User
 * Used by: CreateUserDialog for admin user creation via Edge Function
 */
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  full_name: z.string().max(255).trim().optional(),
  send_email: z.boolean(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
