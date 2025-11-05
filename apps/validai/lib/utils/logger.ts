/* eslint-disable no-console */

/**
 * Production-safe logging utility for ValidAI
 *
 * Features:
 * - Environment-aware: debug/info logs only in development
 * - Structured logging with context
 * - Future-ready for monitoring service integration (Sentry, LogRocket, etc.)
 * - Type-safe logging methods
 *
 * Usage:
 * ```typescript
 * import { logger } from '@/lib/utils/logger'
 *
 * logger.debug('Processing document', { documentId: '123' })
 * logger.info('User action', { action: 'export', count: 5 })
 * logger.warn('Deprecated feature used', { feature: 'old-api' })
 * logger.error('Failed to save', { error, userId: '456' })
 * ```
 */

const isDevelopment = process.env.NODE_ENV === 'development'

type LogContext = Record<string, unknown>

/**
 * Format log message with optional context
 */
function formatMessage(level: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString()
  const contextStr = context ? ` ${JSON.stringify(context)}` : ''
  return `[${timestamp}] [${level}] ${message}${contextStr}`
}

/**
 * Production-safe logger
 *
 * In development: All log levels are active
 * In production: Only warn() and error() produce output
 */
export const logger = {
  /**
   * Debug-level logging (development only)
   * Use for detailed debugging information
   */
  debug: (message: string, context?: LogContext) => {
    if (isDevelopment) {
      console.log(formatMessage('DEBUG', message, context))
    }
  },

  /**
   * Info-level logging (development only)
   * Use for general informational messages
   */
  info: (message: string, context?: LogContext) => {
    if (isDevelopment) {
      console.log(formatMessage('INFO', message, context))
    }
  },

  /**
   * Warning-level logging (always active)
   * Use for recoverable issues or deprecation notices
   */
  warn: (message: string, context?: LogContext) => {
    console.warn(formatMessage('WARN', message, context))
  },

  /**
   * Error-level logging (always active)
   * Use for errors that should be tracked and monitored
   *
   * In production, these should be sent to error tracking service
   */
  error: (message: string, context?: LogContext) => {
    console.error(formatMessage('ERROR', message, context))

    // TODO: In production, send to error tracking service
    // Example with Sentry:
    // if (!isDevelopment && typeof window !== 'undefined') {
    //   Sentry.captureMessage(message, {
    //     level: 'error',
    //     extra: context,
    //   })
    // }
  },
}

/**
 * Helper to safely extract error details for logging
 */
export function extractErrorDetails(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: isDevelopment ? error.stack : undefined,
    }
  }

  if (typeof error === 'object' && error !== null) {
    return error as LogContext
  }

  return { error: String(error) }
}
