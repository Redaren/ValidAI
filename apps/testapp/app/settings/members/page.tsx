'use client'

import { useCurrentOrganization } from '@playze/shared-auth'
import {
  OrgMembersTable,
  OrgInvitationsTable,
  InviteMembersButton,
  Card,
} from '@playze/shared-ui'
import { Users, Mail, Loader2 } from 'lucide-react'

/**
 * Members Settings Page
 *
 * Demonstrates the self-service organization management components:
 * - OrgMembersTable: View/manage members with role changes and status toggles
 * - OrgInvitationsTable: View/cancel pending invitations
 * - InviteMembersButton: Invite new members (auto-hides if no permission)
 *
 * All components automatically check permissions via useAuthorization hook.
 */
export default function MembersPage() {
  const { data: org, isLoading } = useCurrentOrganization()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage members and invitations for {org?.name || 'your organization'}
          </p>
        </div>
        <InviteMembersButton appId="testapp" />
      </div>

      {/* Members Table */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-full bg-primary/10 p-2">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Members</h2>
            <p className="text-sm text-muted-foreground">
              Active and inactive members of your organization
            </p>
          </div>
        </div>
        <OrgMembersTable
          organizationId={org?.id}
          appId="testapp"
          showActions={true}
          pageSize={10}
        />
      </Card>

      {/* Pending Invitations */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-full bg-orange-100 dark:bg-orange-900 p-2">
            <Mail className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pending Invitations</h2>
            <p className="text-sm text-muted-foreground">
              Invitations that have been sent but not yet accepted
            </p>
          </div>
        </div>
        <OrgInvitationsTable
          organizationId={org?.id}
          appId="testapp"
          showActions={true}
        />
      </Card>

      {/* Info Card */}
      <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Self-Service Organization Management
        </h3>
        <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <p>This page demonstrates the shared platform components for organization management:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>OrgMembersTable</strong> - Paginated member list with search, role changes, and status toggles</li>
            <li><strong>OrgInvitationsTable</strong> - Pending invitations with cancel functionality</li>
            <li><strong>InviteMembersButton</strong> - Bulk email invitations with role selection</li>
          </ul>
          <p className="pt-2 text-xs text-blue-700 dark:text-blue-300 italic">
            Note: Actions are permission-gated. Role hierarchy is enforced (you can only manage members at your level or below).
          </p>
        </div>
      </Card>
    </div>
  )
}
