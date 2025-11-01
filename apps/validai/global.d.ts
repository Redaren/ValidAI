/**
 * Type definitions for next-intl.
 * Merges app-specific and shared UI messages for complete type safety.
 *
 * This enables:
 * - Autocomplete for translation keys in IDE
 * - Compile-time errors for missing keys
 * - Type checking for parameters
 */

// Merge app-specific and shared UI messages for complete type safety
type AppMessages = typeof import('./messages/en.json');
type UIMessages = typeof import('@playze/shared-ui/messages/en.json');
type Messages = AppMessages & UIMessages;

declare interface IntlMessages extends Messages {}
