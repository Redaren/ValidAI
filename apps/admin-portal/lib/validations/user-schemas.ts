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
