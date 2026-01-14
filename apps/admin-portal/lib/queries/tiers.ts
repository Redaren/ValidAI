import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import type { Json } from '@playze/shared-types'

/**
 * Query keys factory for tiers and apps
 * Hierarchical structure for efficient cache invalidation
 */
export const tierKeys = {
  all: ['admin', 'tiers'] as const,
  apps: () => ['admin', 'apps'] as const,
  appsList: (filters?: unknown) => [...tierKeys.apps(), 'list', filters] as const,
  appTiers: (appId?: string) => [...tierKeys.all, appId ?? 'all'] as const,
}

/**
 * Hook: List all active apps
 * Returns apps with basic information (id, name, description, icon_url, app_url)
 * Uses direct PostgREST query (follows pattern in assign-subscription-dialog)
 */
export function useApps(filters?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: tierKeys.appsList(filters),
    queryFn: async () => {
      const supabase = createBrowserClient()

      let query = supabase
        .from('apps')
        .select('id, name, description, icon_url, app_url, is_active, created_at, updated_at')
        .order('name')

      // Default: only active apps
      if (!filters?.includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query

      if (error) throw error
      return data
    },
  })
}

/**
 * Hook: Get all tiers for all apps
 * Returns tiers with app information for comparison view
 * Uses direct PostgREST query with join to apps table
 */
export function useAllAppTiers(filters?: { appId?: string; includeInactive?: boolean }) {
  return useQuery({
    queryKey: tierKeys.appTiers(filters?.appId),
    queryFn: async () => {
      const supabase = createBrowserClient()

      let query = supabase
        .from('app_tiers')
        .select(
          `
          id,
          app_id,
          tier_name,
          display_name,
          description,
          features,
          limits,
          price_monthly,
          price_yearly,
          is_active,
          created_at,
          updated_at,
          apps!inner (
            id,
            name,
            description,
            icon_url,
            app_url,
            is_active
          )
        `
        )
        .order('app_id')
        .order('tier_name')

      // Filter by app if specified
      if (filters?.appId) {
        query = query.eq('app_id', filters.appId)
      }

      // Default: only active tiers
      if (!filters?.includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query

      if (error) throw error
      return data
    },
  })
}

/**
 * Type definitions for tier comparison
 * Note: tier_name is string (not union) as returned by database
 * features and limits are Json type from database
 */
export interface AppTierWithApp {
  id: string
  app_id: string
  tier_name: string
  display_name: string
  description: string | null
  features: Json // Json type from database, parsed as Record<string, boolean>
  limits: Json // Json type from database, parsed as Record<string, number>
  price_monthly: number | null
  price_yearly: number | null
  is_active: boolean | null
  created_at: string | null
  updated_at: string | null
  apps: {
    id: string
    name: string
    description: string | null
    icon_url: string | null
    app_url: string | null
    is_active: boolean | null
  }
}
