// Export client creators (client-side only)
export { createBrowserClient } from './client'

// Export hooks (client-side only)
export * from './hooks'

// Export query keys for advanced usage
export { queryKeys } from './lib/query-keys'

// Export decision tree for reference
export { DECISION_TREE } from './lib/decision-tree'

// Export email parsing and role utilities
export { parseEmails, getAssignableRoles, canAssignRole, getRoleDisplayName } from './lib/parse-emails'
export type { OrganizationRole, ParsedEmails } from './lib/parse-emails'

// NOTE: Server-side exports are available via:
// - import { createServerClient } from '@playze/shared-auth/server'
// - import { updateSession } from '@playze/shared-auth/middleware'
