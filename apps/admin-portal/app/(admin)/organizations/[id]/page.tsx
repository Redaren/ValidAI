'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent, Badge, Button } from '@playze/shared-ui'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useOrganization } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { OrgOverviewTab } from './_components/org-overview-tab'
import { OrgMembersTab } from './_components/org-members-tab'
import { OrgSubscriptionsTab } from './_components/org-subscriptions-tab'

interface Organization {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  member_count: number
}

export default function OrganizationDetailsPage() {
  const params = useParams()
  const organizationId = params.id as string
  const { data: organization, isLoading } = useOrganization(organizationId) as {
    data: Organization | null | undefined
    isLoading: boolean
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="space-y-6">
        <div>
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/organizations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Organizations
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Organization Not Found</h1>
          <p className="text-muted-foreground">
            The organization you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/organizations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Organizations
          </Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{organization.name}</h1>
              <Badge variant={organization.is_active ? 'default' : 'secondary'}>
                {organization.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {organization.description && (
              <p className="mt-2 text-muted-foreground">{organization.description}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatDate(organization.created_at)} • {organization.member_count}{' '}
              {organization.member_count === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">
            Members ({organization.member_count})
          </TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OrgOverviewTab organization={organization} />
        </TabsContent>

        <TabsContent value="members">
          <OrgMembersTab organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="subscriptions">
          <OrgSubscriptionsTab organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
