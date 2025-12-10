/**
 * Content Detection and Sanitization Utilities
 *
 * Provides utilities for detecting content types (HTML vs plain text) and
 * sanitizing HTML content for safe rendering in operation results.
 *
 * Security: Uses DOMPurify with strict whitelist to prevent XSS attacks
 * from untrusted LLM-generated content.
 */

import DOMPurify from 'dompurify'

/**
 * Content types supported by the smart comment renderer
 */
export type ContentType = 'html-table' | 'html' | 'plain-text'

/**
 * DOMPurify configuration for ValidAI operation results
 *
 * Whitelist includes:
 * - Table elements: table, thead, tbody, tr, th, td
 * - Basic formatting: b, strong, em, i, u, br, p
 * - Lists: ul, ol, li
 *
 * No attributes allowed to prevent event handlers and malicious links
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'b',
    'strong',
    'em',
    'i',
    'u',
    'br',
    'p',
    'ul',
    'ol',
    'li',
  ],
  ALLOWED_ATTR: [], // No attributes - prevents onclick, href, etc.
  KEEP_CONTENT: true, // Keep text content even if tags are stripped
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM: false,
}

/**
 * Detects if content contains HTML table markup
 *
 * @param content - Text content to analyze
 * @returns true if content appears to contain an HTML table
 */
export function containsHTMLTable(content: string): boolean {
  if (!content || typeof content !== 'string') return false

  const lowerContent = content.toLowerCase()

  // Check for table-specific tags
  const hasTable = lowerContent.includes('<table')
  const hasTr = lowerContent.includes('<tr')
  const hasTd = lowerContent.includes('<td') || lowerContent.includes('<th')

  // All three must be present for a valid table
  return hasTable && hasTr && hasTd
}

/**
 * Detects if content contains any HTML markup
 *
 * @param content - Text content to analyze
 * @returns true if content appears to contain HTML tags
 */
export function containsHTML(content: string): boolean {
  if (!content || typeof content !== 'string') return false

  // Simple regex to detect HTML tags
  // Matches opening tags like <div>, <p>, <br />, etc.
  const htmlTagPattern = /<[a-z][\s\S]*>/i

  return htmlTagPattern.test(content)
}

/**
 * Determines the content type for appropriate rendering
 *
 * Priority:
 * 1. HTML table (if contains table markup)
 * 2. HTML (if contains any other HTML tags)
 * 3. Plain text (default fallback)
 *
 * @param content - Text content to analyze
 * @returns Content type classification
 *
 * @example
 * ```typescript
 * detectContentType('<table><tr><td>Data</td></tr></table>')
 * // Returns: 'html-table'
 *
 * detectContentType('<p>Some text</p>')
 * // Returns: 'html'
 *
 * detectContentType('Plain text content')
 * // Returns: 'plain-text'
 * ```
 */
export function detectContentType(content: string): ContentType {
  if (!content || typeof content !== 'string') {
    return 'plain-text'
  }

  if (containsHTMLTable(content)) {
    return 'html-table'
  }

  if (containsHTML(content)) {
    return 'html'
  }

  return 'plain-text'
}

/**
 * Sanitizes HTML content using DOMPurify with strict whitelist
 *
 * This function is critical for security. It prevents XSS attacks by:
 * 1. Removing all script tags and event handlers
 * 2. Stripping dangerous attributes (onclick, onerror, etc.)
 * 3. Only allowing safe formatting and table tags
 * 4. Preserving text content even if tags are removed
 *
 * @param html - Raw HTML string (potentially malicious)
 * @returns Sanitized HTML safe for rendering
 *
 * @example
 * ```typescript
 * // Safe table content
 * sanitizeHTML('<table><tr><td>Safe</td></tr></table>')
 * // Returns: '<table><tr><td>Safe</td></tr></table>'
 *
 * // Malicious content - strips dangerous parts
 * sanitizeHTML('<script>alert("XSS")</script><p>Text</p>')
 * // Returns: '<p>Text</p>'
 *
 * sanitizeHTML('<img src=x onerror="alert(1)">')
 * // Returns: '' (img not in whitelist)
 * ```
 */
export function sanitizeHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  try {
    // Use DOMPurify to sanitize with strict config
    const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG)
    return clean
  } catch (error) {
    // If sanitization fails, return empty string (fail safe)
    return ''
  }
}

/**
 * Checks if sanitized HTML is safe and non-empty
 *
 * @param html - Raw HTML string
 * @returns true if HTML sanitizes to non-empty content
 */
export function isSafeHTML(html: string): boolean {
  const sanitized = sanitizeHTML(html)
  return sanitized.trim().length > 0
}
