import { Metadata } from 'next'
import { UsersTabs } from './_components/users-tabs'

export const metadata: Metadata = {
  title: 'Users | Admin Portal',
  description: 'View all users and pending invitations across organizations',
}

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          View all users and pending invitations across organizations
        </p>
      </div>

      <UsersTabs />
    </div>
  )
}
