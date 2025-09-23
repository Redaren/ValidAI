# Testing Strategy

## Overview

ValidAI follows a comprehensive testing strategy based on the testing pyramid, ensuring high code quality, reliability, and maintainability. Our approach balances test coverage with execution speed and maintenance overhead.

## Testing Pyramid

### 1. Unit Tests (70% of total tests)
**Purpose**: Test individual components, functions, and modules in isolation
**Tools**: Vitest + React Testing Library
**Coverage**: ~80% code coverage target

**What to test**:
- UI component rendering and props
- Business logic functions
- Utility functions
- State management (Zustand stores)
- Custom hooks
- Form validation logic

**Example**:
```typescript
// components/ui/button.test.tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

test('renders with correct variant class', () => {
  render(<Button variant="destructive">Delete</Button>)
  expect(screen.getByRole('button')).toHaveClass('bg-destructive')
})
```

### 2. Integration Tests (20% of total tests)
**Purpose**: Test interactions between multiple components and modules
**Tools**: Vitest + React Testing Library + Mock Service Worker (MSW)
**Coverage**: Critical user flows and component interactions

**What to test**:
- Authentication flows
- Data fetching with TanStack Query
- Form submissions with Supabase
- Component interactions within pages
- API route handlers
- Store updates with side effects

**Example**:
```typescript
// __tests__/integration/auth-flow.test.tsx
test('user can sign in and access protected content', async () => {
  // Mock successful auth
  mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser }, error: null })

  render(<LoginForm />)
  await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'password')
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

  expect(mockRouter.push).toHaveBeenCalledWith('/protected')
})
```

### 3. E2E Tests (10% of total tests)
**Purpose**: Test complete user journeys across the entire application
**Tools**: Playwright
**Coverage**: Critical paths and user journeys

**What to test**:
- Complete authentication workflows
- Key business processes
- Cross-browser compatibility
- Performance benchmarks
- Accessibility compliance
- Mobile responsiveness

**Example**:
```typescript
// e2e/auth.spec.ts
test('complete sign up and onboarding flow', async ({ page }) => {
  await page.goto('/auth/sign-up')
  await page.fill('[name="email"]', 'user@example.com')
  await page.fill('[name="password"]', 'securepassword')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/protected')
  await expect(page.getByText('Welcome')).toBeVisible()
})
```

## Testing Patterns by Technology

### Supabase Integration Testing

**Database Operations**:
```typescript
// Use test database or mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
      insert: vi.fn(() => Promise.resolve({ data: mockData, error: null }))
    }))
  })
}))
```

**Authentication Testing**:
```typescript
// Mock auth state changes
const mockUser = { id: '1', email: 'test@example.com' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null }))
    }
  })
}))
```

### TanStack Query Testing

**Query Testing**:
```typescript
// Wrap components with QueryClient for testing
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
})

const renderWithQuery = (component: ReactElement) => {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}
```

### Zustand Store Testing

**Store Testing**:
```typescript
// Reset store state between tests
import { useNotificationStore } from '@/stores/notification-store'

beforeEach(() => {
  useNotificationStore.getState().reset()
})

test('adds notification', () => {
  const { addNotification } = useNotificationStore.getState()
  addNotification({ type: 'success', message: 'Test' })

  expect(useNotificationStore.getState().notifications).toHaveLength(1)
})
```

### Next.js App Router Testing

**Server Components**:
```typescript
// Test server components with async rendering
test('renders server component with data', async () => {
  const Component = await ServerComponent()
  render(Component)
  expect(screen.getByText('Server Data')).toBeInTheDocument()
})
```

**Route Handlers**:
```typescript
// Test API routes directly
import { GET } from '@/app/api/instruments/route'

test('returns instruments data', async () => {
  const request = new Request('http://localhost:3000/api/instruments')
  const response = await GET(request)
  const data = await response.json()

  expect(response.status).toBe(200)
  expect(data).toHaveProperty('instruments')
})
```

## Test Data Management

### Mock Data Strategy
- **Static Mocks**: Use `lib/__tests__/mocks/` for reusable mock data
- **Factories**: Create data factories for generating test data
- **Fixtures**: Store larger test datasets in `__tests__/fixtures/`

**Example Factory**:
```typescript
// lib/__tests__/factories/user.ts
export const createMockUser = (overrides = {}) => ({
  id: '1',
  email: 'test@example.com',
  created_at: new Date().toISOString(),
  ...overrides
})
```

### Database Testing
- **Unit/Integration**: Mock Supabase client responses
- **E2E**: Use separate test database or Supabase test environment
- **Seed Data**: Create consistent test data for E2E tests

## Coverage Requirements

### Minimum Coverage Targets
- **Overall**: 80% line coverage
- **Critical Components**: 90% coverage (auth, data handling)
- **UI Components**: 70% coverage
- **Utilities**: 95% coverage

### Coverage Exclusions
- Configuration files
- Build scripts
- Type definitions
- Test files themselves
- Generated code

## Test Environment Setup

### Local Development
```bash
# Run all tests
npm run test:all

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e
```

### CI/CD Pipeline
1. **Unit/Integration Tests**: Run on every PR
2. **E2E Tests**: Run on main branch and releases
3. **Coverage Reports**: Upload to codecov or similar
4. **Performance Tests**: Run nightly

## Best Practices

### Writing Tests
1. **AAA Pattern**: Arrange, Act, Assert
2. **Descriptive Names**: Test names should describe the scenario
3. **Single Responsibility**: One assertion per test when possible
4. **Test Isolation**: Tests should not depend on each other
5. **Fast Feedback**: Unit tests should run in milliseconds

### Mocking Guidelines
1. **Mock External Dependencies**: APIs, databases, third-party services
2. **Don't Mock Implementation Details**: Focus on behavior, not internals
3. **Use Real Objects When Possible**: Prefer real objects over mocks for internal code
4. **Reset Mocks**: Clear mock state between tests

### Performance Considerations
1. **Parallel Execution**: Tests should be parallelizable
2. **Resource Cleanup**: Clean up resources after tests
3. **Selective Testing**: Run relevant tests based on changes
4. **Timeout Management**: Set appropriate timeouts for async operations

## Continuous Improvement

### Metrics to Track
- Test execution time
- Flaky test rate
- Coverage trends
- Bug escape rate

### Regular Reviews
- Monthly test strategy review
- Quarterly tooling evaluation
- Annual testing pyramid rebalancing
- Continuous refactoring of test code

## Testing Checklist

### Before Committing
- [ ] All tests pass locally
- [ ] New features have corresponding tests
- [ ] Coverage thresholds are met
- [ ] No flaky tests introduced
- [ ] Tests are properly organized

### Before Releasing
- [ ] Full test suite passes
- [ ] E2E tests complete successfully
- [ ] Performance tests show no regression
- [ ] Security tests pass
- [ ] Cross-browser testing complete