import '@testing-library/jest-dom'
import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'

// Type declaration to help TypeScript understand our polyfills
declare global {
  var URL: typeof globalThis.URL
  var URLSearchParams: typeof globalThis.URLSearchParams
}

// Setup global error handlers before JSDOM initialization
beforeAll(() => {
  // Handle unhandled promise rejections globally
  process.removeAllListeners('unhandledRejection')

  process.on('unhandledRejection', (reason: unknown) => {
    // Check if it's a known JSDOM/webidl-conversions error
    if (reason && typeof reason === 'object' && reason !== null && 'message' in reason) {
      const message = String((reason as { message: unknown }).message)
      if (
        message.includes('Cannot read properties of undefined') ||
        message.includes('webidl-conversions') ||
        message.includes('whatwg-url') ||
        message.includes('jsdom')
      ) {
        // Silently ignore these specific errors
        return
      }
    }

    // Re-throw other unhandled rejections
    throw reason
  })
})

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root = null
  rootMargin = '0px'
  thresholds = []

  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
  takeRecords() {
    return []
  }
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Polyfill URL and URLSearchParams before JSDOM tries to use them
if (typeof global.URL === 'undefined') {
  (global as any).URL = class URL {
    href: string
    origin: string
    protocol: string
    host: string
    hostname: string
    port: string
    pathname: string
    search: string
    hash: string
    username: string
    password: string
    searchParams: URLSearchParams

    constructor(url: string | URL, base?: string | URL) {
      const urlString = typeof url === 'string' ? url : url.href
      const baseString = typeof base === 'string' ? base : base?.href

      // Simple URL implementation for tests
      this.href = urlString.startsWith('http') ? urlString : `http://localhost:3000${urlString.startsWith('/') ? urlString : '/' + urlString}`
      this.origin = 'http://localhost:3000'
      this.protocol = 'http:'
      this.host = 'localhost:3000'
      this.hostname = 'localhost'
      this.port = '3000'
      this.pathname = urlString.startsWith('/') ? urlString : '/' + urlString
      this.search = ''
      this.hash = ''
      this.username = ''
      this.password = ''
      this.searchParams = new URLSearchParams()
    }

    toString() {
      return this.href
    }

    toJSON() {
      return this.href
    }

    static canParse(url: string | URL, base?: string | URL): boolean {
      try {
        new URL(url, base)
        return true
      } catch {
        return false
      }
    }

    static createObjectURL(obj: Blob | MediaSource): string {
      return 'blob:http://localhost:3000/mock-object-url'
    }

    static parse(url: string | URL, base?: string | URL): URL | null {
      try {
        return new URL(url, base)
      } catch {
        return null
      }
    }

    static revokeObjectURL(url: string): void {
      // Mock implementation - no-op
    }
  }
}

if (typeof global.URLSearchParams === 'undefined') {
  (global as any).URLSearchParams = class URLSearchParams {
    private params = new Map<string, string[]>()

    constructor(init?: string | URLSearchParams | string[][] | Record<string, string>) {
      if (typeof init === 'string') {
        this.parseString(init)
      } else if (init instanceof URLSearchParams) {
        // Copy entries from the existing URLSearchParams
        for (const [key, value] of init.entries()) {
          this.append(key, value)
        }
      } else if (Array.isArray(init)) {
        // Handle string[][] case
        init.forEach(([key, value]) => {
          this.append(key, value)
        })
      } else if (init && typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => {
          this.append(key, value)
        })
      }
    }

    private parseString(str: string) {
      if (str.startsWith('?')) str = str.slice(1)
      str.split('&').forEach(pair => {
        if (pair) {
          const [key, value = ''] = pair.split('=')
          this.append(decodeURIComponent(key), decodeURIComponent(value))
        }
      })
    }

    append(name: string, value: string) {
      if (!this.params.has(name)) {
        this.params.set(name, [])
      }
      this.params.get(name)!.push(value)
    }

    delete(name: string) {
      this.params.delete(name)
    }

    get(name: string) {
      const values = this.params.get(name)
      return values ? values[0] : null
    }

    getAll(name: string) {
      return this.params.get(name) || []
    }

    has(name: string) {
      return this.params.has(name)
    }

    set(name: string, value: string) {
      this.params.set(name, [value])
    }

    get size() {
      let count = 0
      this.params.forEach(values => {
        count += values.length
      })
      return count
    }

    sort() {
      const sortedEntries = Array.from(this.params.entries()).sort(([a], [b]) => a.localeCompare(b))
      this.params.clear()
      sortedEntries.forEach(([key, values]) => {
        this.params.set(key, values)
      })
    }

    forEach(callback: (value: string, key: string, parent: URLSearchParams) => void) {
      this.params.forEach((values, name) => {
        values.forEach(value => {
          callback(value, name, this)
        })
      })
    }

    *entries(): IterableIterator<[string, string]> {
      for (const [name, values] of this.params) {
        for (const value of values) {
          yield [name, value]
        }
      }
    }

    *keys(): IterableIterator<string> {
      for (const [name] of this.entries()) {
        yield name
      }
    }

    *values(): IterableIterator<string> {
      for (const [, value] of this.entries()) {
        yield value
      }
    }

    *[Symbol.iterator](): IterableIterator<[string, string]> {
      yield* this.entries()
    }

    toString() {
      const parts: string[] = []
      this.params.forEach((values, name) => {
        values.forEach(value => {
          parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
        })
      })
      return parts.join('&')
    }
  }
}

// Mock fetch if not available
if (typeof global.fetch === 'undefined') {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as Response)
  )
}