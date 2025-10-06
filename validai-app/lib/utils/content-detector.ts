/**
 * Content Detection and Extraction Utilities
 *
 * Detects and extracts structured data (JSON/XML) from LLM text responses.
 * Converts XML to JSON for unified processing using a lightweight regex-based parser.
 * Works in both browser and Node.js environments without external dependencies.
 */

/**
 * Represents a block of structured data found in text
 */
export interface StructuredBlock {
  type: 'json' | 'xml'
  raw: string           // Original text (JSON string or XML string)
  data: unknown        // Parsed JSON object (unknown type - requires type guards)
  startIndex: number   // Position in original text
  endIndex: number
}

/**
 * Result of content extraction
 */
export interface ExtractedContent {
  plainText: string         // Text with structured blocks removed
  blocks: StructuredBlock[] // Detected structured data blocks
}

/**
 * Safely parse JSON string, returns null if invalid
 */
function parseJsonSafely(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * Check if DOMParser is available (browser environment)
 */
const isDomParserAvailable = typeof DOMParser !== 'undefined'

/**
 * Parse XML using the browser's native DOMParser
 * Handles all valid XML including attributes, namespaces, and deep nesting
 */
function parseXmlWithDomParser(xmlString: string): unknown | null {
  // Check if we're in a browser environment
  if (!isDomParserAvailable) {
    return null // Server-side or old browser
  }

  try {
    // Remove XML declaration if present (DOMParser handles it but we'll be consistent)
    const cleanXml = xmlString.replace(/<\?xml[^?]*\?>/g, '').trim()

    // Use browser's native DOMParser
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(cleanXml, 'text/xml')

    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror')
    if (parserError) {
      // Invalid XML - silent fail
      return null
    }

    // Convert DOM to JSON
    return xmlToJson(xmlDoc.documentElement)
  } catch {
    // Silent fail for any unexpected errors
    return null
  }
}

/**
 * Convert XML DOM Element to JSON
 * Preserves attributes, handles repeated elements as arrays, maintains hierarchy
 */
function xmlToJson(element: Element): unknown {
  // Base case: no element
  if (!element) return null

  // If element has no children and no attributes, return its text content
  if (!element.hasChildNodes() && !element.hasAttributes()) {
    return null
  }

  // Check if element only has text content (no element children)
  let hasElementChildren = false
  let textContent = ''

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      hasElementChildren = true
    } else if (child.nodeType === Node.TEXT_NODE) {
      textContent += child.textContent || ''
    }
  }

  textContent = textContent.trim()

  // If only text content and no attributes, return the text
  if (!hasElementChildren && !element.hasAttributes() && textContent) {
    return textContent
  }

  // Build the result object
  const result: Record<string, unknown> = {}

  // Handle attributes
  if (element.hasAttributes()) {
    const attrs: Record<string, string> = {}
    for (const attr of Array.from(element.attributes)) {
      attrs[attr.name] = attr.value
    }
    result['@attributes'] = attrs
  }

  // Handle child elements
  const children: Record<string, unknown[]> = {}

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as Element
      const childName = childElement.nodeName

      // Convert child to JSON
      const childJson = xmlToJson(childElement)

      // Group children by tag name
      if (!children[childName]) {
        children[childName] = []
      }
      children[childName].push(childJson)
    }
  }

  // Add children to result
  for (const [childName, childArray] of Object.entries(children)) {
    // If only one child with this name, don't use array
    result[childName] = childArray.length === 1 ? childArray[0] : childArray
  }

  // Add text content if there are also element children or attributes
  if (hasElementChildren && textContent) {
    result['#text'] = textContent
  } else if (!hasElementChildren && element.hasAttributes() && textContent) {
    result['#text'] = textContent
  }

  // If result only has text and no attributes, return just the text
  if (Object.keys(result).length === 1 && result['#text']) {
    return result['#text']
  }

  return result
}

/**
 * Extract JSON blocks from text
 * Looks for JSON objects {...} and arrays [...]
 * Also handles JSON inside markdown code fences
 */
function extractJsonBlocks(text: string): StructuredBlock[] {
  const blocks: StructuredBlock[] = []

  // First, try to extract JSON from markdown code fences
  // Pattern: ```json\n<content>\n```
  const codeFencePattern = /```json\n([\s\S]*?)```/g
  let fenceMatch

  while ((fenceMatch = codeFencePattern.exec(text)) !== null) {
    const jsonContent = fenceMatch[1].trim()
    const data = parseJsonSafely(jsonContent)

    if (data !== null) {
      blocks.push({
        type: 'json',
        raw: jsonContent,
        data,
        startIndex: fenceMatch.index,
        endIndex: fenceMatch.index + fenceMatch[0].length
      })
    }
  }

  // Also check for JSON without code fences (backwards compatibility)
  // Only look for JSON outside of code fences
  const textWithoutFences = text.replace(/```json\n[\s\S]*?```/g, '')

  // Match JSON objects and arrays (greedy, balanced braces)
  // This regex finds potential JSON by matching balanced {} or []
  const jsonPattern = /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}|\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\]/g

  let match
  while ((match = jsonPattern.exec(textWithoutFences)) !== null) {
    const candidate = match[0]
    const data = parseJsonSafely(candidate)

    if (data !== null) {
      blocks.push({
        type: 'json',
        raw: candidate,
        data,
        startIndex: match.index,
        endIndex: match.index + candidate.length
      })
    }
  }

  return blocks
}

/**
 * Extract XML blocks from text
 * Looks for XML tags <root>...</root>
 * Also handles XML inside markdown code fences
 */
function extractXmlBlocks(text: string): StructuredBlock[] {
  const blocks: StructuredBlock[] = []

  // First, try to extract XML from markdown code fences
  // Pattern: ```xml\n<content>\n```
  const codeFencePattern = /```xml\n([\s\S]*?)```/g
  let fenceMatch

  while ((fenceMatch = codeFencePattern.exec(text)) !== null) {
    const xmlContent = fenceMatch[1].trim()

    // Try to parse the XML content using DOMParser
    const data = parseXmlWithDomParser(xmlContent)

    if (data !== null) {
      blocks.push({
        type: 'xml',
        raw: xmlContent,
        data,
        startIndex: fenceMatch.index,
        endIndex: fenceMatch.index + fenceMatch[0].length
      })
    }
  }

  // Also check for XML without code fences (backwards compatibility)
  const xmlPattern = /<([a-zA-Z][a-zA-Z0-9_-]*)[^>]*>[\s\S]*?<\/\1>/g
  let match

  // Only look for XML outside of code fences
  const textWithoutFences = text.replace(/```xml\n[\s\S]*?```/g, '')

  while ((match = xmlPattern.exec(textWithoutFences)) !== null) {
    const candidate = match[0]
    const data = parseXmlWithDomParser(candidate)

    if (data !== null) {
      blocks.push({
        type: 'xml',
        raw: candidate,
        data,
        startIndex: match.index,
        endIndex: match.index + candidate.length
      })
    }
  }

  return blocks
}

/**
 * Extract structured content (JSON and XML) from text
 *
 * Detects both JSON and XML blocks, parses them, and returns:
 * - Full original text (unchanged)
 * - Array of parsed structured blocks for visualization
 *
 * @param text - Input text from LLM response
 * @returns Extracted content with full text and structured blocks
 *
 * @example
 * ```typescript
 * const text = 'Here are the results: {"status": "pass", "score": 95}'
 * const result = extractStructuredContent(text)
 * // result.plainText = 'Here are the results: {"status": "pass", "score": 95}' (full text)
 * // result.blocks = [{ type: 'json', data: { status: 'pass', score: 95 }, ... }]
 * ```
 */
export function extractStructuredContent(text: string): ExtractedContent {
  // Extract all blocks
  const jsonBlocks = extractJsonBlocks(text)
  const xmlBlocks = extractXmlBlocks(text)

  // Combine and sort by position
  const allBlocks = [...jsonBlocks, ...xmlBlocks].sort(
    (a, b) => a.startIndex - b.startIndex
  )

  // Remove duplicates (if XML contains JSON or vice versa)
  const uniqueBlocks: StructuredBlock[] = []
  let lastEnd = -1

  for (const block of allBlocks) {
    // Skip if this block overlaps with previous one
    if (block.startIndex >= lastEnd) {
      uniqueBlocks.push(block)
      lastEnd = block.endIndex
    }
  }

  // IMPORTANT: Return the FULL original text, not stripped version
  // This allows users to see exactly what the LLM returned
  // The visualization is shown IN ADDITION to the full text
  return {
    plainText: text,  // Full original text
    blocks: uniqueBlocks
  }
}
