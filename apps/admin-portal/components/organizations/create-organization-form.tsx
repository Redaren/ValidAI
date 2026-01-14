'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Input,
  Label,
  Textarea,
  Alert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { createOrganizationSchema, type CreateOrganizationInput } from '@/lib/validations'
import { useCreateOrganization, useApps } from '@/lib/queries'
import { useAppTiers } from '@/lib/queries/subscriptions'
import { useToastStore } from '@/stores'

interface AppTier {
  id: string
  tier_name: string
  display_name: string
}

export function CreateOrganizationForm() {
  const router = useRouter()
  const createOrg = useCreateOrganization()
  const addToast = useToastStore((state) => state.addToast)
  const { data: apps, isLoading: appsLoading } = useApps()

  // Track selected app to load its tiers
  const [selectedAppId, setSelectedAppId] = useState('')
  const { data: tiersData = [], isLoading: tiersLoading } = useAppTiers(selectedAppId)
  const tiers = tiersData as AppTier[]

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      tier_name: 'free',
    },
  })

  const onSubmit = async (data: CreateOrganizationInput) => {
    try {
      // Construct the appSubscriptions array from the selected app and tier
      const submitData = {
        ...data,
        appSubscriptions: [
          {
            appId: data.default_app_id,
            tierName: data.tier_name,
          },
        ],
      }
      const result = await createOrg.mutateAsync(submitData)

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

      {/* Default App */}
      <div className="space-y-2">
        <Label htmlFor="default_app_id">
          Default App <span className="text-destructive">*</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          The app where invited users will be redirected after accepting their invitation.
          A subscription will be created for this app.
        </p>
        <Controller
          name="default_app_id"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ?? ''}
              onValueChange={(value) => {
                field.onChange(value)
                setSelectedAppId(value)
                // Reset tier selection when app changes
                setValue('tier_name', 'free')
              }}
              disabled={isSubmitting || appsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select default app..." />
              </SelectTrigger>
              <SelectContent>
                {apps?.filter(app => app.id !== 'admin').map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.default_app_id && (
          <p className="text-sm text-destructive">{errors.default_app_id.message}</p>
        )}
      </div>

      {/* Subscription Tier - shown after app is selected */}
      {selectedAppId && (
        <div className="space-y-2">
          <Label htmlFor="tier_name">
            Subscription Tier <span className="text-destructive">*</span>
          </Label>
          <p className="text-sm text-muted-foreground">
            The subscription tier for this organization.
          </p>
          <Controller
            name="tier_name"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? 'free'}
                onValueChange={(value) => field.onChange(value as 'free' | 'pro' | 'enterprise')}
                disabled={isSubmitting || tiersLoading || tiers.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      tiersLoading
                        ? 'Loading tiers...'
                        : tiers.length === 0
                          ? 'No tiers available'
                          : 'Select tier...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.tier_name}>
                      {tier.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.tier_name && (
            <p className="text-sm text-destructive">{errors.tier_name.message}</p>
          )}
        </div>
      )}

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
