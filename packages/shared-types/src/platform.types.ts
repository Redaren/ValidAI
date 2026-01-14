/**
 * Platform-specific types that aren't directly from the database
 */

// Import OrganizationRole from shortcuts (already defined there)
import type { OrganizationRole } from './shortcuts'

// Auth types
export interface UserSession {
  userId: string
  email: string
  organizationId: string
  role: string
}

// Feature gating
export interface FeatureAccess {
  hasAccess: boolean
  requiredTier?: string
  currentTier?: string
}

// Organization switching
export interface SwitchOrganizationInput {
  organizationId: string
}

export interface SwitchOrganizationResult {
  success: boolean
  message?: string
}

// Self-service invitation types
export interface InviteMembersInput {
  organizationId: string
  emails: string[]
  role: OrganizationRole
  appId: string
}

export interface InviteResult {
  email: string
  status: 'pending' | 'assigned' | 'failed'
  invitationId?: string
  userExists?: boolean
  emailSent?: boolean
  error?: string
}

export interface InviteResultsSummary {
  results: InviteResult[]
  summary: {
    total: number
    successful: number
    failed: number
  }
}

export interface OrgInvitation {
  id: string
  email: string
  role: OrganizationRole
  status: string
  invited_at: string
  expires_at: string
  invited_by_name: string | null
}

export interface ParsedEmails {
  valid: string[]
  invalid: string[]
}
