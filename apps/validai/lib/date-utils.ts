/**
 * Date Utility Functions
 *
 * @module lib/date-utils
 * @description
 * Shared date formatting utilities used across the application.
 */

import { format } from 'date-fns'

/**
 * Formats ISO date string to readable date and time without seconds
 *
 * @param isoString - ISO 8601 date string
 * @returns Formatted date string (e.g., "Oct 16, 2025 14:30")
 *
 * @example
 * ```typescript
 * formatCompletionDateTime("2025-10-16T14:30:45.123Z")
 * // Returns: "Oct 16, 2025 14:30"
 * ```
 */
export function formatCompletionDateTime(isoString: string): string {
  return format(new Date(isoString), 'MMM dd, yyyy HH:mm')
}
