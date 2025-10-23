import { Card } from '@playze/shared-ui'
import { CreateOrganizationForm } from '@/components/organizations/create-organization-form'

export default function NewOrganizationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Organization</h1>
        <p className="text-muted-foreground">
          Create a new organization and optionally invite an initial owner.
        </p>
      </div>

      <Card className="p-6 max-w-2xl">
        <CreateOrganizationForm />
      </Card>
    </div>
  )
}
