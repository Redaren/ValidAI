'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Badge, Card, CardContent } from '@playze/shared-ui'
import { useUserMemberships } from '@/lib/queries'
import { Building2, Clock } from 'lucide-react'

interface UserOrgMembershipsProps {
  userId: string
}

interface UserMembership {
  organization_id: string
  organization_name: string
  organization_is_active: boolean
  role: string
  joined_at: string
}

const ROLE_COLORS = {
  owner: 'destructive',
  admin: 'default',
  member: 'secondary',
  viewer: 'outline',
} as const

export function UserOrgMemberships({ userId }: UserOrgMembershipsProps) {
  const { data: memberships, isLoading } = useUserMemberships(userId) as {
    data: UserMembership[] | undefined
    isLoading: boolean
  }

  if (isLoading) {
    return <div>Loading memberships...</div>
  }

  if (!memberships || memberships.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No Organizations</h3>
          <p className="text-sm text-muted-foreground">
            This user is not a member of any organizations
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {memberships.map((membership) => (
        <Card key={membership.organization_id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <Link
                  href={`/organizations/${membership.organization_id}`}
                  className="text-lg font-semibold hover:underline"
                >
                  {membership.organization_name}
                </Link>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={ROLE_COLORS[membership.role as keyof typeof ROLE_COLORS]}>
                  {membership.role}
                </Badge>
                {membership.organization_is_active ? (
                  <Badge variant="default" className="bg-green-600">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Joined {formatDistanceToNow(new Date(membership.joined_at), { addSuffix: true })}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
