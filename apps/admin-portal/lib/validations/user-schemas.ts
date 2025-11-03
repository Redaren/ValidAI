import { z } from 'zod'
import { uuidSchema, emailSchema } from './common-schemas'

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
 * Schema: Create User
 * Used by: CreateUserDialog for creating new users
 *
 * Two flows supported:
 * 1. Direct creation: Provide password - user can login immediately
 * 2. Invitation: No password - user receives invite email and sets password
 */
export const createUserSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .optional(),
  full_name: z
    .string()
    .min(1, 'Name must be at least 1 character')
    .max(100, 'Name must be at most 100 characters')
    .trim()
    .optional(),
  send_email: z.boolean().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
