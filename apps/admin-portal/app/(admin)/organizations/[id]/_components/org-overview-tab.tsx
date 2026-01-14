'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Card,
  Button,
  Input,
  Label,
  Textarea,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import { Loader2, Pencil } from 'lucide-react'
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@/lib/validations'
import { useUpdateOrganization, useApps } from '@/lib/queries'
import { useToastStore } from '@/stores'
import { formatDate } from '@/lib/utils'
import { CountrySelect } from '@/components/ui/country-select'
import { getCountryName } from '@/lib/countries'

interface OrgOverviewTabProps {
  organization: {
    id: string
    name: string
    description: string | null
    is_active: boolean | null
    created_at: string | null
    updated_at: string | null
    // Extended fields
    org_number?: string | null
    vat_number?: string | null
    street_address?: string | null
    postal_code?: string | null
    city?: string | null
    country?: string | null
    contact_person?: string | null
    contact_role?: string | null
    contact_email?: string | null
    contact_phone?: string | null
    referral?: string | null
    lead_source?: string | null
    kam?: string | null
    default_app_id?: string | null
    created_by?: string | null
    created_by_email?: string | null
  }
}

export function OrgOverviewTab({ organization }: OrgOverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const updateOrg = useUpdateOrganization(organization.id)
  const addToast = useToastStore((state) => state.addToast)
  const { data: apps, isLoading: appsLoading } = useApps()

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
      // Extended fields
      org_number: organization.org_number,
      vat_number: organization.vat_number,
      street_address: organization.street_address,
      postal_code: organization.postal_code,
      city: organization.city,
      country: organization.country,
      contact_person: organization.contact_person,
      contact_role: organization.contact_role,
      contact_email: organization.contact_email,
      contact_phone: organization.contact_phone,
      referral: organization.referral,
      lead_source: organization.lead_source,
      kam: organization.kam,
      default_app_id: organization.default_app_id,
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

  const inputClassName = "h-9 text-sm"
  const labelClassName = "text-xs font-medium text-muted-foreground"

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Edit/Save Actions - Fixed at top */}
        <div className="flex justify-end gap-2 mb-4">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {/* Legal Information Card */}
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Legal Information
          </h3>

          {/* Row 1: Name, Org Number, VAT Number */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-1">
              <Label htmlFor="name" className={labelClassName}>Organization Name</Label>
              <Input
                id="name"
                {...register('name')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="org_number" className={labelClassName}>Org Number</Label>
              <Input
                id="org_number"
                {...register('org_number')}
                disabled={!isEditing || isSubmitting}
                placeholder="556123-4567"
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vat_number" className={labelClassName}>VAT Number</Label>
              <Input
                id="vat_number"
                {...register('vat_number')}
                disabled={!isEditing || isSubmitting}
                placeholder="SE556123456701"
                className={inputClassName}
              />
            </div>
          </div>

          {/* Row 2: Street Address, Postal Code, City, Country */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="street_address" className={labelClassName}>Street Address</Label>
              <Input
                id="street_address"
                {...register('street_address')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="postal_code" className={labelClassName}>Postal Code</Label>
              <Input
                id="postal_code"
                {...register('postal_code')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="city" className={labelClassName}>City</Label>
              <Input
                id="city"
                {...register('city')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
          </div>

          {/* Row 3: Country (separate row for dropdown) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div className="space-y-1">
              <Label htmlFor="country" className={labelClassName}>Country</Label>
              {isEditing ? (
                <CountrySelect
                  value={watch('country')}
                  onChange={(value) => setValue('country', value)}
                  disabled={isSubmitting}
                />
              ) : (
                <div className="h-9 flex items-center text-sm">
                  {getCountryName(watch('country')) || <span className="text-muted-foreground">-</span>}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Contact Details Card */}
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Contact Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label htmlFor="contact_person" className={labelClassName}>Contact Person</Label>
              <Input
                id="contact_person"
                {...register('contact_person')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_role" className={labelClassName}>Role</Label>
              <Input
                id="contact_role"
                {...register('contact_role')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_email" className={labelClassName}>
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contact_email"
                type="email"
                {...register('contact_email')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
              {errors.contact_email && (
                <p className="text-xs text-destructive">{errors.contact_email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_phone" className={labelClassName}>Phone</Label>
              <Input
                id="contact_phone"
                {...register('contact_phone')}
                disabled={!isEditing || isSubmitting}
                placeholder="+46..."
                className={inputClassName}
              />
            </div>
          </div>
        </Card>

        {/* Internal / Misc Card */}
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Internal
          </h3>

          {/* Row 1: Referral, Lead Source, KAM, Status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="space-y-1">
              <Label htmlFor="referral" className={labelClassName}>Referral</Label>
              <Input
                id="referral"
                {...register('referral')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead_source" className={labelClassName}>Lead Source</Label>
              <Input
                id="lead_source"
                {...register('lead_source')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kam" className={labelClassName}>KAM</Label>
              <Input
                id="kam"
                {...register('kam')}
                disabled={!isEditing || isSubmitting}
                placeholder="Key Account Manager"
                className={inputClassName}
              />
            </div>
            <div className="space-y-1">
              <Label className={labelClassName}>Status</Label>
              <div className="flex items-center h-9 gap-2">
                <Switch
                  id="is_active"
                  checked={watch('is_active')}
                  onCheckedChange={(checked) => setValue('is_active', checked)}
                  disabled={!isEditing || isSubmitting}
                />
                <Label htmlFor="is_active" className="text-sm cursor-pointer">
                  {watch('is_active') ? 'Active' : 'Inactive'}
                </Label>
              </div>
            </div>
          </div>

          {/* Row 2: Default App */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="default_app_id" className={labelClassName}>
                Default App
              </Label>
              <p className="text-xs text-muted-foreground mb-1">
                Where invited users land after accepting their invitation
              </p>
              {isEditing ? (
                <Select
                  value={watch('default_app_id') ?? ''}
                  onValueChange={(value) => setValue('default_app_id', value === '' ? null : value)}
                  disabled={isSubmitting || appsLoading}
                >
                  <SelectTrigger className={inputClassName}>
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
              ) : (
                <div className="h-9 flex items-center text-sm">
                  {apps?.find(a => a.id === watch('default_app_id'))?.name || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Description (full width) */}
          <div className="space-y-1">
            <Label htmlFor="description" className={labelClassName}>Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              rows={2}
              disabled={!isEditing || isSubmitting}
              className="text-sm resize-none"
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>
        </Card>
      </form>

      {/* Metadata Card (Read-only) */}
      <Card className="p-4 bg-muted/30">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          Metadata
        </h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className={labelClassName}>Organization ID</dt>
            <dd className="font-mono text-xs truncate" title={organization.id}>
              {organization.id.slice(0, 8)}...
            </dd>
          </div>
          <div>
            <dt className={labelClassName}>Created</dt>
            <dd>{formatDate(organization.created_at)}</dd>
          </div>
          <div>
            <dt className={labelClassName}>Last Updated</dt>
            <dd>{formatDate(organization.updated_at)}</dd>
          </div>
          <div>
            <dt className={labelClassName}>Created By</dt>
            <dd className="truncate" title={organization.created_by_email || undefined}>
              {organization.created_by_email || <span className="text-muted-foreground">-</span>}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
