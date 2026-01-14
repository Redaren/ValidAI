import { z } from 'zod'

/**
 * Schema: Invitation Search/Filter
 * Used by: InvitationsTable component for server-side filtering
 */
export const invitationSearchSchema = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
})

export type InvitationSearchInput = z.infer<typeof invitationSearchSchema>
