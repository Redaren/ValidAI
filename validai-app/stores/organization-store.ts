import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface Organization {
  id: string
  name: string
  slug: string
  plan_type: 'free' | 'pro' | 'enterprise'
  created_at: string
  updated_at: string
  created_by: string
}

export interface OrganizationMember {
  organization_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joined_at: string
}

interface OrganizationState {
  // Current organization context
  currentOrganization: Organization | null
  userOrganizations: Organization[]
  currentUserRole: string | null

  // Loading states
  isLoading: boolean
  isSwitching: boolean

  // Actions
  setCurrentOrganization: (org: Organization | null) => void
  setUserOrganizations: (orgs: Organization[]) => void
  setCurrentUserRole: (role: string | null) => void
  setIsLoading: (loading: boolean) => void
  setIsSwitching: (switching: boolean) => void

  // Helper methods
  canManageOrganization: () => boolean
  reset: () => void
}

const initialState = {
  currentOrganization: null,
  userOrganizations: [],
  currentUserRole: null,
  isLoading: false,
  isSwitching: false,
}

export const useOrganizationStore = create<OrganizationState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setCurrentOrganization: (org) => set({ currentOrganization: org }),
      setUserOrganizations: (orgs) => set({ userOrganizations: orgs }),
      setCurrentUserRole: (role) => set({ currentUserRole: role }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setIsSwitching: (switching) => set({ isSwitching: switching }),

      canManageOrganization: () => {
        const { currentUserRole } = get()
        return currentUserRole === 'owner' || currentUserRole === 'admin'
      },

      reset: () => set(initialState),
    }),
    { name: 'organization-store' }
  )
)