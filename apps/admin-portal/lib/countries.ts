/**
 * Country data for organization forms
 * Uses ISO 3166-1 alpha-2 country codes
 * Nordic countries first, then common EU countries, then rest alphabetically
 */

export interface Country {
  code: string // ISO 3166-1 alpha-2
  name: string
}

export const COUNTRIES: Country[] = [
  // Nordic countries (prioritized for Swedish market)
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'IS', name: 'Iceland' },
  // Common EU countries
  { code: 'DE', name: 'Germany' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'PL', name: 'Poland' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IE', name: 'Ireland' },
  // Other common countries
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  // Baltic states
  { code: 'EE', name: 'Estonia' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  // Rest of EU alphabetically
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
]

/**
 * Get country name by code
 */
export function getCountryName(code: string | null | undefined): string {
  if (!code) return ''
  const country = COUNTRIES.find((c) => c.code === code.toUpperCase())
  return country?.name || code
}

/**
 * Get country by code
 */
export function getCountry(code: string | null | undefined): Country | undefined {
  if (!code) return undefined
  return COUNTRIES.find((c) => c.code === code.toUpperCase())
}
