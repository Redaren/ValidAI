/**
 * TanStack Query key factory for consistent query key management.
 *
 * Benefits:
 * - Type-safe query keys
 * - Hierarchical invalidation
 * - Prevents key collisions
 */

export const queryKeys = {
  // Auth-related queries
  auth: {
    all: () => ['auth'] as const,
    user: () => [...queryKeys.auth.all(), 'user'] as const,
    session: () => [...queryKeys.auth.all(), 'session'] as const,
  },

  // User queries
  user: {
    all: () => ['user'] as const,
    appsWithAdmin: () => [...queryKeys.user.all(), 'appsWithAdmin'] as const,
  },

  // Organization queries
  organizations: {
    all: () => ['organizations'] as const,
    current: () => [...queryKeys.organizations.all(), 'current'] as const,
    list: () => [...queryKeys.organizations.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.organizations.all(), 'detail', id] as const,
    apps: (orgId: string) => [...queryKeys.organizations.all(), 'apps', orgId] as const,
    members: (orgId: string) => [...queryKeys.organizations.all(), 'members', orgId] as const,
    membersPaginated: (orgId: string, params?: { search?: string; limit?: number; offset?: number }) =>
      [...queryKeys.organizations.all(), 'members', orgId, 'paginated', params] as const,
    invitations: (orgId: string) => [...queryKeys.organizations.all(), 'invitations', orgId] as const,
  },

  // Feature access queries
  features: {
    all: () => ['features'] as const,
    access: (appId: string, featureName: string) =>
      [...queryKeys.features.all(), 'access', appId, featureName] as const,
  },

  // Authorization queries (unified: features + permissions + roles)
  authorization: {
    all: () => ['authorization'] as const,
    context: (appId: string) =>
      [...queryKeys.authorization.all(), 'context', appId] as const,
  },
} as const
