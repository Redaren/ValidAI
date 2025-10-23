'use client'

import * as React from 'react'
import { useAuthorization } from '@playze/shared-auth'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Lock, Shield, Crown } from 'lucide-react'

interface AuthGateProps {
  appId: string

  // Tier-based feature check
  feature?: string

  // Role-based permission check
  permission?: string

  // Role requirement
  role?: Array<'owner' | 'admin' | 'member' | 'viewer'>

  // Combine with AND logic (all must pass) vs OR logic (any must pass)
  requireAll?: boolean

  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Unified authorization gate supporting:
 * - Tier-based features (subscription tiers)
 * - Role-based permissions (user roles)
 * - Role requirements
 * - Combined checks
 *
 * Performance: Uses useAuthorization() - ONE database query for all checks on a page.
 *
 * @example
 * // Feature only (tier-based)
 * <AuthGate appId="testapp" feature="export_reports">
 *   <ExportButton />
 * </AuthGate>
 *
 * @example
 * // Permission only (role-based)
 * <AuthGate appId="testapp" permission="can_edit">
 *   <EditButton />
 * </AuthGate>
 *
 * @example
 * // Role only
 * <AuthGate appId="testapp" role={['owner', 'admin']}>
 *   <AdminPanel />
 * </AuthGate>
 *
 * @example
 * // Combined (must have feature AND permission)
 * <AuthGate appId="testapp" feature="export_reports" permission="can_edit" requireAll>
 *   <ExportButton />
 * </AuthGate>
 *
 * @example
 * // Custom fallback
 * <AuthGate appId="testapp" feature="export_reports" fallback={<CustomUpgradePrompt />}>
 *   <ExportButton />
 * </AuthGate>
 */
export function AuthGate({
  appId,
  feature,
  permission,
  role,
  requireAll = true,
  children,
  fallback,
}: AuthGateProps) {
  const { data: auth, isLoading } = useAuthorization(appId)

  if (isLoading) return null
  if (!auth) return fallback || null

  const checks = []

  if (feature) {
    checks.push(auth.tier_features?.[feature] || false)
  }

  if (permission) {
    checks.push(auth.role_permissions?.[permission] || false)
  }

  if (role) {
    checks.push(role.includes(auth.user_role))
  }

  // No checks specified - allow by default
  if (checks.length === 0) {
    return <>{children}</>
  }

  // Check logic
  const hasAccess = requireAll
    ? checks.every(Boolean) // AND logic
    : checks.some(Boolean) // OR logic

  if (hasAccess) {
    return <>{children}</>
  }

  // Use custom fallback if provided
  if (fallback) {
    return <>{fallback}</>
  }

  // Default unauthorized prompt based on what failed
  return (
    <DefaultUnauthorizedPrompt
      feature={feature}
      permission={permission}
      role={role}
      currentRole={auth.user_role}
      currentTier={auth.tier_display_name}
    />
  )
}

// Keep FeatureGate as alias for backward compatibility
export const FeatureGate = AuthGate

/**
 * Default unauthorized prompt shown when user doesn't have access
 */
function DefaultUnauthorizedPrompt({
  feature,
  permission,
  role,
  currentRole,
  currentTier,
}: {
  feature?: string
  permission?: string
  role?: Array<'owner' | 'admin' | 'member' | 'viewer'>
  currentRole: string
  currentTier: string
}) {
  // Determine what type of access is missing
  const missingFeature = !!feature
  const missingPermission = !!permission
  const missingRole = !!role

  // Choose icon and title based on missing access type
  let icon = <Lock className="h-4 w-4" />
  let title = 'Access Restricted'
  let description = ''

  if (missingFeature && !missingPermission && !missingRole) {
    // Tier-based feature restriction
    icon = <Crown className="h-4 w-4" />
    title = 'Pro Feature'
    description = `This feature is available in higher subscription tiers. Current tier: ${currentTier}.`
  } else if (missingPermission && !missingFeature && !missingRole) {
    // Permission restriction
    icon = <Shield className="h-4 w-4" />
    title = 'Permission Required'
    description = `You don't have permission to perform this action. Current role: ${currentRole}.`
  } else if (missingRole && !missingFeature && !missingPermission) {
    // Role restriction
    icon = <Shield className="h-4 w-4" />
    title = 'Admin Access Required'
    description = `This feature requires ${role?.join(' or ')} access. Current role: ${currentRole}.`
  } else {
    // Combined restrictions
    description = `This feature requires `
    const requirements = []
    if (missingFeature) requirements.push('a higher subscription tier')
    if (missingPermission) requirements.push('specific permissions')
    if (missingRole) requirements.push(`${role?.join(' or ')} role`)
    description += requirements.join(' and ') + '.'
  }

  return (
    <Alert>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}{' '}
        <Button
          variant="link"
          className="p-0 h-auto"
          onClick={() => window.open('mailto:support@playze.com?subject=Access Request')}
        >
          Contact us for access
        </Button>
      </AlertDescription>
    </Alert>
  )
}
