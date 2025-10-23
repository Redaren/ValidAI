import { Database } from './database.types'

// Table Row types (for SELECT results)
export type Organization = Database['public']['Tables']['organizations']['Row']
export type OrganizationInsert = Database['public']['Tables']['organizations']['Insert']
export type OrganizationUpdate = Database['public']['Tables']['organizations']['Update']

export type OrganizationMember = Database['public']['Tables']['organization_members']['Row']
export type OrganizationInvitation = Database['public']['Tables']['organization_invitations']['Row']

export type App = Database['public']['Tables']['apps']['Row']
export type AppTier = Database['public']['Tables']['app_tiers']['Row']

export type OrganizationAppSubscription = Database['public']['Tables']['organization_app_subscriptions']['Row']
export type OrganizationAppUsage = Database['public']['Tables']['organization_app_usage']['Row']

export type Profile = Database['public']['Tables']['profiles']['Row']
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row']

export type Invoice = Database['public']['Tables']['invoices']['Row']

// Database function return types
export type UserOrganization = Database['public']['Functions']['get_user_organizations']['Returns'][0]
export type OrganizationApp = Database['public']['Functions']['get_organization_apps']['Returns'][0]

// Role types
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'canceled'
