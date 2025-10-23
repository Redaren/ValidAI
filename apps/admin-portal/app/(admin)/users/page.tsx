import { Metadata } from 'next'
import { UsersTable } from '@/components/users/users-table'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@playze/shared-ui'

export const metadata: Metadata = {
  title: 'Users | Admin Portal',
  description: 'View all users across organizations',
}

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          View all users and their organization memberships
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Users across all organizations in the Playze platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable />
        </CardContent>
      </Card>
    </div>
  )
}
