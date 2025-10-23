/**
 * Platform-specific types that aren't directly from the database
 */

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
