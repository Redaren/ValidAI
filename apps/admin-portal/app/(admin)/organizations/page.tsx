import Link from 'next/link'
import { Button, Card } from '@playze/shared-ui'
import { Plus } from 'lucide-react'
import { OrganizationTable } from '@/components/organizations/organization-table'

export default function OrganizationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Manage organizations and their members
          </p>
        </div>
        <Button asChild>
          <Link href="/organizations/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Link>
        </Button>
      </div>

      <Card className="p-6">
        <OrganizationTable />
      </Card>
    </div>
  )
}
