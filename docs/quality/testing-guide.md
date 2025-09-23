# Testing Guide

## Quick Start

### Running Tests

```bash
# Run all unit and integration tests
npm run test

# Run tests in watch mode (recommended for development)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with browser visible
npm run test:e2e:headed

# Run all tests (unit + integration + E2E)
npm run test:all
```

### Test File Structure

```
validai-app/
├── __tests__/
│   ├── unit/                 # Unit tests
│   │   ├── components/       # Component tests
│   │   ├── lib/             # Utility function tests
│   │   └── stores/          # Store tests
│   ├── integration/         # Integration tests
│   │   ├── auth-flow.test.tsx
│   │   └── data-fetching.test.tsx
│   └── fixtures/            # Test data
├── e2e/                     # E2E tests
│   ├── auth.spec.ts
│   └── navigation.spec.ts
└── lib/__tests__/
    ├── setup.ts             # Test configuration
    ├── mocks/               # Mock data
    └── factories/           # Data factories
```

## Writing Unit Tests

### Component Testing

#### Basic Component Test
```typescript
// __tests__/unit/components/ui/button.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Button } from '@/components/ui/button'

describe('Button Component', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<Button onClick={handleClick}>Click me</Button>)
    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('applies variant classes', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-destructive')
  })
})
```

#### Testing Components with Props
```typescript
// __tests__/unit/components/instrument-card.test.tsx
import { render, screen } from '@testing-library/react'
import { InstrumentCard } from '@/components/instrument-card'
import { createMockInstrument } from '@/lib/__tests__/factories/instrument'

describe('InstrumentCard', () => {
  it('displays instrument information', () => {
    const instrument = createMockInstrument({
      name: 'Bitcoin',
      symbol: 'BTC',
      price: 45000
    })

    render(<InstrumentCard instrument={instrument} />)

    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('$45,000')).toBeInTheDocument()
  })
})
```

### Testing Custom Hooks

#### TanStack Query Hooks
```typescript
// __tests__/unit/hooks/use-instruments.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useInstruments } from '@/app/queries/instruments/use-instruments'

// Mock the API function
vi.mock('@/app/queries/instruments/get-instruments', () => ({
  getInstruments: vi.fn(() => Promise.resolve([
    { id: '1', name: 'Bitcoin', symbol: 'BTC' }
  ]))
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useInstruments', () => {
  it('returns instruments data', async () => {
    const { result } = renderHook(() => useInstruments(), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].name).toBe('Bitcoin')
  })
})
```

### Testing Zustand Stores

```typescript
// __tests__/unit/stores/notification-store.test.ts
import { useNotificationStore } from '@/stores/notification-store'

describe('NotificationStore', () => {
  beforeEach(() => {
    // Reset store state
    useNotificationStore.setState({ notifications: [] })
  })

  it('adds notification', () => {
    const { addNotification } = useNotificationStore.getState()

    addNotification({
      type: 'success',
      message: 'Test notification'
    })

    const { notifications } = useNotificationStore.getState()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toBe('Test notification')
  })

  it('removes notification', () => {
    const { addNotification, removeNotification } = useNotificationStore.getState()

    addNotification({ type: 'info', message: 'Test' })
    const { notifications } = useNotificationStore.getState()

    removeNotification(notifications[0].id)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
```

### Testing Utility Functions

```typescript
// __tests__/unit/lib/utils.test.ts
import { cn, formatCurrency } from '@/lib/utils'

describe('Utils', () => {
  describe('cn (className utility)', () => {
    it('merges class names correctly', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2')
    })

    it('handles conditional classes', () => {
      expect(cn('base', true && 'active', false && 'inactive')).toBe('base active')
    })
  })

  describe('formatCurrency', () => {
    it('formats USD currency correctly', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56')
    })

    it('handles zero values', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })
  })
})
```

## Writing Integration Tests

### Authentication Flow Testing

```typescript
// __tests__/integration/auth-flow.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginForm } from '@/components/login-form'

// Mock Supabase client
const mockSignInWithPassword = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword: mockSignInWithPassword }
  })
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush })
}))

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('Authentication Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully signs in user and redirects', async () => {
    const user = userEvent.setup()

    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: '1', email: 'test@example.com' } },
      error: null
    })

    renderWithProviders(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123'
    })

    expect(mockPush).toHaveBeenCalledWith('/protected')
  })
})
```

### Data Fetching Integration

```typescript
// __tests__/integration/instruments-page.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InstrumentsPage } from '@/app/examples/instruments/page'

// Mock the API call
const mockGetInstruments = vi.fn()
vi.mock('@/app/queries/instruments/get-instruments', () => ({
  getInstruments: mockGetInstruments
}))

describe('Instruments Page Integration', () => {
  it('loads and displays instruments', async () => {
    const mockInstruments = [
      { id: '1', name: 'Bitcoin', symbol: 'BTC', price: 45000 },
      { id: '2', name: 'Ethereum', symbol: 'ETH', price: 3000 }
    ]

    mockGetInstruments.mockResolvedValue(mockInstruments)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    })

    render(
      <QueryClientProvider client={queryClient}>
        <InstrumentsPage />
      </QueryClientProvider>
    )

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Check that instruments are displayed
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('Ethereum')).toBeInTheDocument()
  })
})
```

## Writing E2E Tests

### Basic E2E Test Structure

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to starting point
    await page.goto('/')
  })

  test('user can sign up and access protected content', async ({ page }) => {
    // Navigate to sign up
    await page.click('text=Sign up')

    // Fill form
    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'securepassword123')

    // Submit form
    await page.click('button[type="submit"]')

    // Check for success
    await expect(page).toHaveURL(/protected/)
    await expect(page.getByText('Welcome')).toBeVisible()
  })

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/auth/login')

    await page.fill('[name="email"]', 'invalid@example.com')
    await page.fill('[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.getByText(/invalid credentials/i)).toBeVisible()
  })
})
```

### Testing with Authentication State

```typescript
// e2e/protected-routes.spec.ts
import { test, expect } from '@playwright/test'

// Create authenticated user state
test.use({
  storageState: 'e2e/auth.json' // Pre-authenticated state
})

test.describe('Protected Routes', () => {
  test('authenticated user can access instruments', async ({ page }) => {
    await page.goto('/protected/instruments')

    await expect(page.getByText('Instruments')).toBeVisible()
    await expect(page.getByText('Loading...')).toBeHidden()
  })
})
```

## Testing Best Practices

### Test Organization

1. **Group Related Tests**: Use `describe` blocks to group related tests
2. **Descriptive Names**: Test names should describe the scenario clearly
3. **Single Responsibility**: Each test should verify one specific behavior
4. **Consistent Structure**: Follow AAA pattern (Arrange, Act, Assert)

### Mock Management

#### Creating Reusable Mocks

```typescript
// lib/__tests__/mocks/supabase.ts
export const createMockSupabaseClient = (overrides = {}) => ({
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    ...overrides.auth
  },
  from: vi.fn(() => ({
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn(() => Promise.resolve({ data: null, error: null })),
    delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
    ...overrides.from
  })),
  ...overrides
})
```

#### Using Mock Factories

```typescript
// lib/__tests__/factories/instrument.ts
export const createMockInstrument = (overrides = {}) => ({
  id: crypto.randomUUID(),
  name: 'Test Instrument',
  symbol: 'TEST',
  price: 100,
  created_at: new Date().toISOString(),
  ...overrides
})

// Usage in tests
const instrument = createMockInstrument({ name: 'Bitcoin', price: 45000 })
```

### Common Testing Patterns

#### Testing Async Operations

```typescript
// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument()
})

// Wait for element to disappear
await waitForElementToBeRemoved(screen.getByText('Loading...'))

// Find async elements
const button = await screen.findByRole('button', { name: /submit/i })
```

#### Testing Error States

```typescript
it('handles API errors gracefully', async () => {
  mockApiCall.mockRejectedValue(new Error('Network error'))

  render(<MyComponent />)

  await expect(screen.findByText(/error occurred/i)).resolves.toBeInTheDocument()
})
```

#### Testing Loading States

```typescript
it('shows loading spinner while fetching data', () => {
  mockApiCall.mockImplementation(() => new Promise(() => {})) // Never resolves

  render(<MyComponent />)

  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})
```

## Debugging Tests

### Debugging Unit Tests

```typescript
// Add debug output
import { screen } from '@testing-library/react'

// Print DOM structure
screen.debug()

// Print specific element
screen.debug(screen.getByRole('button'))

// Use logRoles to see available roles
import { logRoles } from '@testing-library/dom'
logRoles(container)
```

### Debugging E2E Tests

```typescript
// Add screenshots
await page.screenshot({ path: 'debug.png' })

// Add video recording
test.use({ video: 'on' })

// Pause execution for inspection
await page.pause()

// Add console logs
page.on('console', msg => console.log(msg.text()))
```

### Common Issues and Solutions

#### Test Timeouts
```typescript
// Increase timeout for slow operations
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument()
}, { timeout: 5000 })

// For Playwright
test.setTimeout(60000) // 60 seconds
```

#### Flaky Tests
```typescript
// Add proper waits instead of arbitrary delays
// ❌ Bad
await new Promise(resolve => setTimeout(resolve, 1000))

// ✅ Good
await waitFor(() => {
  expect(screen.getByText('Content')).toBeInTheDocument()
})
```

#### Memory Leaks
```typescript
// Clean up after tests
afterEach(() => {
  vi.clearAllMocks()
  cleanup() // From @testing-library/react
})

// Reset stores
beforeEach(() => {
  useStore.getState().reset()
})
```

## Performance Testing

### Running Performance Tests

```bash
# Run with performance profiling
npm run test:coverage -- --reporter=verbose

# Check test execution time
npm run test -- --reporter=verbose

# E2E performance testing
npx playwright test --project=chromium --grep="@performance"
```

### Writing Performance Tests

```typescript
// e2e/performance.spec.ts
test('page loads within performance budget', async ({ page }) => {
  const startTime = Date.now()

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const loadTime = Date.now() - startTime
  expect(loadTime).toBeLessThan(3000) // 3 seconds max
})
```

## Continuous Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: npm

      - run: npm ci
      - run: npm run test:coverage
      - run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Troubleshooting

### Common Error Messages

1. **"Element not found"**: Use proper queries and waits
2. **"Multiple elements found"**: Make queries more specific
3. **"Test timeout"**: Increase timeout or fix async handling
4. **"Mock not working"**: Check mock placement and module path
5. **"State not updating"**: Ensure proper state management in tests

### Getting Help

1. Check the [Testing Library docs](https://testing-library.com/)
2. Review [Vitest documentation](https://vitest.dev/)
3. Consult [Playwright guides](https://playwright.dev/)
4. Ask in team chat with specific error messages
5. Review existing test patterns in the codebase