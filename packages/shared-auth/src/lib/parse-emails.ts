/**
 * Email Parsing and Role Hierarchy Utilities
 *
 * Used by invitation functionality across all platform apps.
 * Provides utilities for parsing bulk email input and managing role permissions.
 */

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface ParsedEmails {
  /** Valid, deduplicated email addresses */
  valid: string[]
  /** Invalid email entries that failed validation */
  invalid: string[]
}

/**
 * Parse bulk email input into validated email array
 *
 * Supports multiple separators:
 * - Comma (,)
 * - Semicolon (;)
 * - Newline (\n)
 * - Space ( )
 *
 * @param input - Raw string containing email addresses
 * @returns Object with valid and invalid email arrays
 *
 * @example
 * ```typescript
 * const result = parseEmails('john@example.com, jane@test.com\ninvalid-email')
 * // result.valid = ['john@example.com', 'jane@test.com']
 * // result.invalid = ['invalid-email']
 * ```
 */
export function parseEmails(input: string): ParsedEmails {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  // Split by common separators and normalize
  const rawEmails = input
    .split(/[,;\s\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

  const valid: string[] = []
  const invalid: string[] = []

  for (const email of rawEmails) {
    if (emailRegex.test(email)) {
      // Deduplicate
      if (!valid.includes(email)) {
        valid.push(email)
      }
    } else {
      // Deduplicate invalid too
      if (!invalid.includes(email)) {
        invalid.push(email)
      }
    }
  }

  return { valid, invalid }
}

/**
 * Role hierarchy levels for permission checks
 * Higher number = higher privilege
 */
const ROLE_LEVELS: Record<OrganizationRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
}

/**
 * Get list of roles that a user can assign based on their own role
 *
 * Users can only assign roles at or below their own level:
 * - owner can assign: owner, admin, member, viewer
 * - admin can assign: admin, member, viewer
 * - member can assign: member, viewer
 * - viewer cannot assign any roles
 *
 * @param userRole - The user's current role in the organization
 * @returns Array of roles the user can assign to invitees
 *
 * @example
 * ```typescript
 * const roles = getAssignableRoles('admin')
 * // roles = ['admin', 'member', 'viewer']
 * ```
 */
export function getAssignableRoles(userRole: OrganizationRole): OrganizationRole[] {
  const userLevel = ROLE_LEVELS[userRole] || 0

  // If user is viewer or unknown role, they can't assign any roles
  if (userLevel <= 1) {
    return []
  }

  // Return all roles at or below user's level
  const assignable: OrganizationRole[] = []

  for (const [role, level] of Object.entries(ROLE_LEVELS)) {
    if (level <= userLevel) {
      assignable.push(role as OrganizationRole)
    }
  }

  // Sort by level descending (highest privilege first)
  return assignable.sort((a, b) => ROLE_LEVELS[b] - ROLE_LEVELS[a])
}

/**
 * Check if a user can assign a specific role
 *
 * @param userRole - The user's current role
 * @param targetRole - The role they want to assign
 * @returns True if user can assign the target role
 */
export function canAssignRole(userRole: OrganizationRole, targetRole: OrganizationRole): boolean {
  const userLevel = ROLE_LEVELS[userRole] || 0
  const targetLevel = ROLE_LEVELS[targetRole] || 0

  return userLevel >= targetLevel && userLevel > 1
}

/**
 * Get human-readable display name for a role
 *
 * @param role - Organization role
 * @returns Display name with proper capitalization
 */
export function getRoleDisplayName(role: OrganizationRole): string {
  const displayNames: Record<OrganizationRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
  }

  return displayNames[role] || role
}
