'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Card, Badge, Button } from '@playze/shared-ui'
import { Loader2, User, Plus } from 'lucide-react'
import { useOrganizationMembers } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { AssignMembershipDialog } from '@/components/organizations/assign-membership-dialog'

interface OrgMembersTabProps {
  organizationId: string
}

interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: string
  joined_at: string
  invited_by: string | null
  profiles: {
    id: string
    full_name: string | null
    avatar_url: string | null
  }
}

export function OrgMembersTab({ organizationId }: OrgMembersTabProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { data: members, isLoading } = useOrganizationMembers(organizationId)

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (!members || members.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <User className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No members yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This organization doesn&apos;t have any members yet.
          </p>
          <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Assign Membership
          </Button>
        </div>

        <AssignMembershipDialog
          organizationId={organizationId}
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
        />
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Members</h3>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Assign Membership
        </Button>
      </div>

      <div className="space-y-4">
        {members.map((member: OrganizationMember) => (
          <div
            key={member.user_id}
            className="flex items-center justify-between p-4 rounded-lg border bg-card"
          >
            <div className="flex items-center gap-4">
              {/* Avatar or Initials */}
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {member.profiles?.avatar_url ? (
                  <Image
                    src={member.profiles.avatar_url}
                    alt={member.profiles.full_name || 'User'}
                    width={40}
                    height={40}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5 text-primary" />
                )}
              </div>

              {/* Member Info */}
              <div>
                <p className="font-medium">
                  {member.profiles?.full_name || 'Unknown User'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Joined {formatDate(member.joined_at)}
                </p>
              </div>
            </div>

            {/* Role Badge */}
            <Badge
              variant={
                member.role === 'owner'
                  ? 'default'
                  : member.role === 'admin'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
            </Badge>
          </div>
        ))}
      </div>

      <AssignMembershipDialog
        organizationId={organizationId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </Card>
  )
}
