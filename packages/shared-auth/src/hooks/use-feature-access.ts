import { useAuthorization } from './use-authorization'

/**
 * Hook to check if the current organization has access to a specific tier-based feature.
 *
 * REFACTORED: Now uses useAuthorization() internally for optimal performance.
 * Multiple feature checks on the same page = only ONE database query.
 *
 * @param appId - The app ID (e.g., 'testapp', 'roadcloud', 'projectx')
 * @param featureName - The feature name (e.g., 'export_reports', 'advanced_mapping')
 *
 * @example
 * ```typescript
 * const { data: canExport } = useFeatureAccess('roadcloud', 'export_reports')
 * const { data: hasAdvanced } = useFeatureAccess('roadcloud', 'advanced_mapping')
 *
 * // Only ONE database query for both checks!
 *
 * if (!canExport) {
 *   return <UpgradePrompt />
 * }
 * ```
 */
export function useFeatureAccess(appId: string, featureName: string) {
  const { data: auth, isLoading } = useAuthorization(appId)

  return {
    data: auth?.tier_features?.[featureName] || false,
    isLoading,
  }
}
