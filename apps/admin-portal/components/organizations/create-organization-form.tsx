'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Input, Label, Textarea, Alert } from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { createOrganizationSchema, type CreateOrganizationInput } from '@/lib/validations'
import { useCreateOrganization } from '@/lib/queries'
import { useToastStore } from '@/stores'

export function CreateOrganizationForm() {
  const router = useRouter()
  const createOrg = useCreateOrganization()
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
  })

  const onSubmit = async (data: CreateOrganizationInput) => {
    try {
      const result = await createOrg.mutateAsync(data)

      addToast({
        title: 'Organization created',
        description: `${data.name} has been created successfully.`,
        variant: 'success',
      })

      // Navigate to the organization details page
      if (result?.organization?.id) {
        router.push(`/organizations/${result.organization.id}`)
      } else {
        router.push('/organizations')
      }
    } catch (error) {
      console.error('Error creating organization:', error)
      addToast({
        title: 'Error creating organization',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Organization Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Organization Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Acme Corporation"
          disabled={isSubmitting}
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
          placeholder="A brief description of the organization..."
          rows={3}
          disabled={isSubmitting}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      {/* Initial Owner Email */}
      <div className="space-y-2">
        <Label htmlFor="initialOwnerEmail">Initial Owner Email (Optional)</Label>
        <Input
          id="initialOwnerEmail"
          type="email"
          {...register('initialOwnerEmail')}
          placeholder="owner@example.com"
          disabled={isSubmitting}
        />
        <p className="text-sm text-muted-foreground">
          If provided, an invitation email will be sent to this address.
        </p>
        {errors.initialOwnerEmail && (
          <p className="text-sm text-destructive">{errors.initialOwnerEmail.message}</p>
        )}
      </div>

      {/* Error Alert */}
      {createOrg.error && (
        <Alert variant="destructive">
          <p className="font-semibold">Error creating organization</p>
          <p className="text-sm">
            {createOrg.error instanceof Error
              ? createOrg.error.message
              : 'An unexpected error occurred'}
          </p>
        </Alert>
      )}

      {/* Form Actions */}
      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Creating...' : 'Create Organization'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
