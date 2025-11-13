/**
 * Smart Comment Renderer Component
 *
 * Automatically detects content type (HTML table, HTML, or plain text) and renders
 * appropriately with security-first sanitization.
 *
 * Usage:
 * ```tsx
 * <SmartCommentRenderer content={operationResult.comment} />
 * ```
 *
 * Security: All HTML content is sanitized with DOMPurify before rendering
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  detectContentType,
  sanitizeHTML,
  type ContentType,
} from '@/lib/utils/content-detection'

export interface SmartCommentRendererProps {
  /**
   * The content to render (may be HTML or plain text)
   */
  content: string

  /**
   * Additional CSS classes to apply to the container
   */
  className?: string

  /**
   * Whether the content represents a failed operation
   * (applies destructive styling)
   */
  isFailed?: boolean
}

/**
 * SmartCommentRenderer
 *
 * Intelligently renders operation result comments with support for:
 * - HTML tables (from LLM analysis operations)
 * - Basic HTML formatting (bold, italic, lists)
 * - Plain text (default fallback)
 *
 * @example
 * ```tsx
 * // Renders HTML table
 * <SmartCommentRenderer
 *   content="<table><tr><td>Data</td></tr></table>"
 * />
 *
 * // Renders plain text
 * <SmartCommentRenderer
 *   content="Simple text response"
 * />
 *
 * // Failed operation with error styling
 * <SmartCommentRenderer
 *   content="Operation failed"
 *   isFailed
 * />
 * ```
 */
export function SmartCommentRenderer({
  content,
  className,
  isFailed = false,
}: SmartCommentRendererProps) {
  // Memoize content type detection and sanitization
  const { contentType, sanitizedContent } = useMemo(() => {
    const type = detectContentType(content)
    const sanitized = type !== 'plain-text' ? sanitizeHTML(content) : content

    return {
      contentType: type,
      sanitizedContent: sanitized,
    }
  }, [content])

  // Render based on detected content type
  return (
    <div className={cn('w-full', className)}>
      {contentType === 'html-table' ? (
        <HTMLTableRenderer content={sanitizedContent} isFailed={isFailed} />
      ) : contentType === 'html' ? (
        <HTMLRenderer content={sanitizedContent} isFailed={isFailed} />
      ) : (
        <PlainTextRenderer content={content} isFailed={isFailed} />
      )}
    </div>
  )
}

/**
 * Renders HTML table content with ValidAI table styling
 */
function HTMLTableRenderer({
  content,
  isFailed,
}: {
  content: string
  isFailed: boolean
}) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border bg-card',
        isFailed && 'border-destructive'
      )}
    >
      <div
        className={cn(
          'prose prose-sm max-w-none',
          isFailed && 'text-destructive',
          // Table-specific prose styles
          'prose-table:text-sm',
          'prose-table:border-collapse',
          'prose-thead:bg-muted',
          'prose-th:border prose-th:border-border prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:font-semibold',
          'prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2',
          'prose-tr:border-b prose-tr:border-border',
          'prose-tbody:divide-y'
        )}
        // Sanitized HTML is safe to render
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}

/**
 * Renders basic HTML content (paragraphs, lists, formatting)
 */
function HTMLRenderer({
  content,
  isFailed,
}: {
  content: string
  isFailed: boolean
}) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none rounded-lg border bg-card p-4',
        isFailed && 'border-destructive text-destructive',
        // Basic prose styles
        'prose-p:my-2',
        'prose-strong:font-semibold',
        'prose-em:italic',
        'prose-ul:my-2 prose-ul:list-disc prose-ul:pl-4',
        'prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-4',
        'prose-li:my-1'
      )}
      // Sanitized HTML is safe to render
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

/**
 * Renders plain text content (default fallback)
 */
function PlainTextRenderer({
  content,
  isFailed,
}: {
  content: string
  isFailed: boolean
}) {
  return (
    <pre
      className={cn(
        'whitespace-pre-wrap text-sm leading-relaxed font-sans',
        isFailed && 'text-destructive'
      )}
    >
      {content}
    </pre>
  )
}
