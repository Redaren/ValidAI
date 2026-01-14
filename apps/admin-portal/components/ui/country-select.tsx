'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import { COUNTRIES, getCountryName } from '@/lib/countries'

interface CountrySelectProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
}

/**
 * Country select dropdown using ISO 3166-1 alpha-2 codes
 * Nordic countries are prioritized at the top of the list
 */
export function CountrySelect({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select country',
}: CountrySelectProps) {
  return (
    <Select
      value={value || ''}
      onValueChange={(val) => onChange(val || null)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder}>
          {value ? getCountryName(value) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {COUNTRIES.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            {country.name} ({country.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
