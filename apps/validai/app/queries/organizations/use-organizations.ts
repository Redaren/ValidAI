'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useOrganizationStore } from '@/stores'

export function useUserOrganizations() {
  const supabase = createClient()
  const { setUserOrganizations, setIsLoading } = useOrganizationStore()

  return useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      setIsLoading(true)
      try {
        // Call database function for complex query
        const { data, error } = await supabase.rpc('get_user_organizations')

        if (error) throw error

        const organizations = (data || []).map((org: {
          organization_id: string
          organization_name: string
          organization_slug: string
          plan_type: string
          created_at: string
          updated_at: string
          created_by: string
        }) => ({
          id: org.organization_id,
          name: org.organization_name,
          slug: org.organization_slug,
          plan_type: org.plan_type,
          created_at: org.created_at,
          updated_at: org.updated_at,
          created_by: org.created_by
        }))

        setUserOrganizations(organizations)

        // Return the structure expected by OrganizationSwitcher
        return { organizations }
      } finally {
        setIsLoading(false)
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCurrentOrganization() {
  const supabase = createClient()
  const { setCurrentOrganization, setCurrentUserRole, setIsLoading } = useOrganizationStore()

  return useQuery({
    queryKey: ['current-organization'],
    queryFn: async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_current_organization')

        if (error) throw error

        if (data && data.length > 0) {
          const org = data[0]
          const organizationData = {
            id: org.organization_id,
            name: org.organization_name,
            slug: org.organization_slug,
            plan_type: org.plan_type,
            created_at: org.created_at,
            updated_at: org.updated_at,
            created_by: org.created_by
          }

          setCurrentOrganization(organizationData)
          setCurrentUserRole(org.user_role)

          // Return the structure expected by OrganizationSwitcher
          return {
            organization: organizationData,
            role: org.user_role
          }
        } else {
          setCurrentOrganization(null)
          setCurrentUserRole(null)

          return {
            organization: null,
            role: null
          }
        }
      } finally {
        setIsLoading(false)
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useOrganizationMembers(organizationId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return []

      const { data, error } = await supabase.rpc(
        'get_organization_members',
        { org_id: organizationId }
      )

      if (error) throw error
      return data
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useSwitchOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { setIsSwitching } = useOrganizationStore()

  return useMutation({
    mutationFn: async (organizationId: string) => {
      setIsSwitching(true)

      // Call Edge Function for org switching
      const { data, error } = await supabase.functions.invoke('switch-organization', {
        body: { organizationId },
      })

      if (error) throw error

      // Refresh session to get new JWT
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError

      return data
    },
    onSuccess: () => {
      // Invalidate and refetch organization queries
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })

      setIsSwitching(false)

      // Reload page to ensure all components get new context
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    },
    onError: () => {
      setIsSwitching(false)
    },
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const { data: result, error } = await supabase.rpc(
        'create_organization',
        {
          org_name: data.name,
          org_slug: data.slug
        }
      )

      if (error) throw error
      return result
    },
    onSuccess: () => {
      // Refresh organization queries
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
    },
  })
}

export function useInviteUser() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: {
      email: string
      organizationId: string
      role: 'admin' | 'member' | 'viewer'
    }) => {
      const { data: result, error } = await supabase.functions.invoke('invite-user', {
        body: data,
      })

      if (error) throw error
      return result
    },
    onSuccess: (_, variables) => {
      // Refresh organization members query
      queryClient.invalidateQueries({
        queryKey: ['organization-members', variables.organizationId]
      })
    },
  })
}