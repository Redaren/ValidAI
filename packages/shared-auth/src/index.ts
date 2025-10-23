// Export client creators (client-side only)
export { createBrowserClient } from './client'

// Export hooks (client-side only)
export * from './hooks'

// Export query keys for advanced usage
export { queryKeys } from './lib/query-keys'

// Export decision tree for reference
export { DECISION_TREE } from './lib/decision-tree'

// NOTE: Server-side exports are available via:
// - import { createServerClient } from '@playze/shared-auth/server'
// - import { updateSession } from '@playze/shared-auth/middleware'
