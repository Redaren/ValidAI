import { format } from 'date-fns'

/**
 * Format a date string or Date object to a readable format
 * @param date - Date string or Date object
 * @param formatStr - Date format string (default: 'MMM d, yyyy')
 * @returns Formatted date string
 */
export function formatDate(date: string | Date | null, formatStr = 'MMM d, yyyy'): string {
  if (!date) return 'N/A'

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return format(dateObj, formatStr)
  } catch (error) {
    console.error('Error formatting date:', error)
    return 'Invalid date'
  }
}

/**
 * Format a date string or Date object to include time
 * @param date - Date string or Date object
 * @returns Formatted date and time string
 */
export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'MMM d, yyyy HH:mm')
}
