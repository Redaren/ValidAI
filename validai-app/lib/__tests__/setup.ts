import '@testing-library/jest-dom'
import { afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'

// Handle unhandled promise rejections
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

beforeAll(() => {
  // Suppress specific console errors that are expected during tests
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || ''

    // Suppress known test-related errors
    if (
      message.includes('Warning: ReactDOM.render is deprecated') ||
      message.includes('Warning: You are using a development build') ||
      message.includes('Cannot read properties of undefined') ||
      message.includes('node_modules/jsdom/') ||
      message.includes('whatwg-url/lib/URL.js')
    ) {
      return
    }

    originalConsoleError.apply(console, args)
  }

  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || ''

    // Suppress known test-related warnings
    if (
      message.includes('Warning: ReactDOM.render is deprecated') ||
      message.includes('Warning: You are using a development build')
    ) {
      return
    }

    originalConsoleWarn.apply(console, args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
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

// Mock URL constructor if not available
if (typeof global.URL === 'undefined') {
  global.URL = class URL {
    constructor(url: string, base?: string) {
      // Simple URL mock for tests
      this.href = url
      this.origin = 'http://localhost:3000'
      this.protocol = 'http:'
      this.host = 'localhost:3000'
      this.pathname = '/'
      this.search = ''
      this.hash = ''
    }
    href: string
    origin: string
    protocol: string
    host: string
    pathname: string
    search: string
    hash: string
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
    } as Response)
  )
}