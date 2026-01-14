'use client'

import { useMemo } from 'react'
import { useAuthorization } from './use-authorization'
import type { OrganizationRole } from '../lib/parse-emails'

/**
 * Result from useCanInvite hook
 */
export interface CanInviteResult {
  /** Whether user can invite members (role permission + tier feature) */
  canInvite: boolean
  /** Whether authorization data is loading */
  isLoading: boolean
  /** User's role in the organization */
  userRole: OrganizationRole | undefined
  /** Reason why user cannot invite (for UI messaging) */
  reason?: 'no_permission' | 'tier_limit' | 'not_member'
}

/**
 * Hook: Check if current user can invite members
 *
 * Combines two checks:
 * 1. Role-based: User has `can_invite` permission (owner/admin only by default)
 * 2. Tier-based: Organization's subscription tier has `can_invite_members` feature
 *
 * @param appId - App ID to check permissions for
 * @returns Object with canInvite boolean, loading state, and user role
 *
 * @example
 * ```typescript
 * const { canInvite, isLoading, userRole, reason } = useCanInvite('infracloud')
 *
 * if (!canInvite) {
 *   if (reason === 'tier_limit') {
 *     return <UpgradeBanner message="Upgrade to Pro to invite members" />
 *   }
 *   return null // Hide invite button
 * }
 *
 * return <InviteMembersButton />
 * ```
 */
export function useCanInvite(appId: string): CanInviteResult {
  const { data: auth, isLoading } = useAuthorization(appId)

  const result = useMemo((): CanInviteResult => {
    if (isLoading) {
      return { canInvite: false, isLoading: true, userRole: undefined }
    }

    if (!auth) {
      return {
        canInvite: false,
        isLoading: false,
        userRole: undefined,
        reason: 'not_member',
      }
    }

    // Check role-based permission (can_invite)
    const roleCanInvite = auth.role_permissions?.can_invite === true

    if (!roleCanInvite) {
      return {
        canInvite: false,
        isLoading: false,
        userRole: auth.user_role,
        reason: 'no_permission',
      }
    }

    // Check tier-based feature (can_invite_members)
    const tierCanInvite = auth.tier_features?.can_invite_members === true

    if (!tierCanInvite) {
      return {
        canInvite: false,
        isLoading: false,
        userRole: auth.user_role,
        reason: 'tier_limit',
      }
    }

    return {
      canInvite: true,
      isLoading: false,
      userRole: auth.user_role,
    }
  }, [auth, isLoading])

  return result
}
