'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, Button, Input, Label, Textarea, Switch } from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@/lib/validations'
import { useUpdateOrganization } from '@/lib/queries'
import { useToastStore } from '@/stores'
import { formatDate } from '@/lib/utils'

interface OrgOverviewTabProps {
  organization: {
    id: string
    name: string
    description: string | null
    is_active: boolean | null
    created_at: string | null
    updated_at: string | null
  }
}

export function OrgOverviewTab({ organization }: OrgOverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const updateOrg = useUpdateOrganization(organization.id)
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      description: organization.description,
      is_active: organization.is_active ?? true,
    },
  })

  const onSubmit = async (data: UpdateOrganizationInput) => {
    try {
      await updateOrg.mutateAsync(data)

      addToast({
        title: 'Organization updated',
        description: 'The organization has been updated successfully.',
        variant: 'success',
      })

      setIsEditing(false)
    } catch (error) {
      console.error('Error updating organization:', error)
      addToast({
        title: 'Error updating organization',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleCancel = () => {
    reset()
    setIsEditing(false)
  }

  return (
    <div className="space-y-6">
      {/* Organization Details Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Organization Details</h3>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              {...register('name')}
              disabled={!isEditing || isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              rows={3}
              disabled={!isEditing || isSubmitting}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={watch('is_active')}
              onCheckedChange={(checked) => setValue('is_active', checked)}
              disabled={!isEditing || isSubmitting}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Active
            </Label>
          </div>

          {/* Form Actions */}
          {isEditing && (
            <div className="flex gap-4 pt-4 border-t">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          )}
        </form>
      </Card>

      {/* Metadata Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Metadata</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Organization ID</dt>
            <dd className="mt-1 text-sm font-mono">{organization.id}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1 text-sm">{formatDate(organization.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last Updated</dt>
            <dd className="mt-1 text-sm">{formatDate(organization.updated_at)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
