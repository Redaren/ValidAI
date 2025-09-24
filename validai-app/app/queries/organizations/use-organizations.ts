'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useOrganizationStore } from '@/stores'

export function useUserOrganizations() {
  const { setUserOrganizations, setIsLoading } = useOrganizationStore()

  return useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/organizations')
        if (!response.ok) {
          throw new Error('Failed to fetch user organizations')
        }
        const result = await response.json()
        setUserOrganizations(result.organizations)
        return result
      } finally {
        setIsLoading(false)
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCurrentOrganization() {
  const { setCurrentOrganization, setCurrentUserRole, setIsLoading } = useOrganizationStore()

  return useQuery({
    queryKey: ['current-organization'],
    queryFn: async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/organizations/current')
        if (!response.ok) {
          throw new Error('Failed to fetch current organization')
        }
        const result = await response.json()
        if (result) {
          setCurrentOrganization(result.organization)
          setCurrentUserRole(result.role)
        } else {
          setCurrentOrganization(null)
          setCurrentUserRole(null)
        }
        return result
      } finally {
        setIsLoading(false)
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useOrganizationMembers(organizationId: string | null) {
  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return []

      const response = await fetch(`/api/organizations/${organizationId}/members`)
      if (!response.ok) {
        throw new Error('Failed to fetch organization members')
      }
      return response.json()
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useSwitchOrganization() {
  const queryClient = useQueryClient()
  const { setIsSwitching } = useOrganizationStore()

  return useMutation({
    mutationFn: async (organizationId: string) => {
      setIsSwitching(true)

      // Call the switch organization API
      const response = await fetch('/api/organizations/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizationId }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to switch organization')
      }

      // Refresh the user session to get new JWT with updated org_id
      const supabase = createClient()
      const { error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError) {
        throw refreshError
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate and refetch organization queries
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })

      setIsSwitching(false)

      // Optionally reload the page to ensure all components get the new context
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    },
    onError: (error) => {
      console.error('Error switching organization:', error)
      setIsSwitching(false)
    },
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const response = await fetch('/api/organizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to create organization')
      }

      return response.json()
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

  return useMutation({
    mutationFn: async (data: {
      email: string
      organizationId: string
      role: 'admin' | 'member' | 'viewer'
    }) => {
      const response = await fetch('/api/organizations/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to send invitation')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      // Refresh organization members query
      queryClient.invalidateQueries({
        queryKey: ['organization-members', variables.organizationId]
      })
    },
  })
}