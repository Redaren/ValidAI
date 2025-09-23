# Code Standards

## Overview

This document outlines the coding standards, best practices, and conventions for the ValidAI project. Following these standards ensures consistency, maintainability, and quality across the codebase.

## Code Formatting

### Prettier Configuration

We use Prettier for consistent code formatting with the following configuration:

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "useTabs": false,
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

**Key Rules**:
- No semicolons
- Single quotes for strings
- 2-space indentation
- 100 character line length
- Trailing commas in ES5-compatible positions
- LF line endings

**Enforcement**:
- Pre-commit hooks automatically format code
- CI pipeline checks formatting
- IDE integration recommended

### ESLint Configuration

ESLint is configured with Next.js recommended rules plus custom rules for our project.

**Base Configuration**: `next/core-web-vitals`

**Custom Rules**:
```javascript
{
  "@typescript-eslint/no-unused-vars": "error",
  "@typescript-eslint/no-explicit-any": "warn",
  "prefer-const": "error",
  "no-var": "error",
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn"
}
```

## File Organization

### Directory Structure

```
validai-app/
├── app/                     # Next.js App Router
│   ├── (auth)/             # Route groups
│   ├── api/                # API routes
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── queries/            # TanStack Query functions
├── components/             # Reusable components
│   ├── ui/                 # shadcn/ui components
│   ├── forms/              # Form components
│   └── providers/          # Context providers
├── lib/                    # Utility functions
│   ├── supabase/           # Supabase configuration
│   ├── utils.ts            # General utilities
│   └── validations.ts      # Zod schemas
├── stores/                 # Zustand stores
├── __tests__/              # Test files
└── types/                  # Type definitions
```

### File Naming Conventions

**Components**: PascalCase
```
UserProfile.tsx
InstrumentCard.tsx
NavigationMenu.tsx
```

**Hooks**: camelCase with "use" prefix
```
useInstruments.ts
useAuth.ts
useLocalStorage.ts
```

**Utilities**: camelCase
```
formatCurrency.ts
validateEmail.ts
apiClient.ts
```

**Types**: PascalCase with descriptive suffix
```
UserTypes.ts
ApiTypes.ts
ComponentProps.ts
```

**Constants**: SCREAMING_SNAKE_CASE
```
API_ENDPOINTS.ts
DEFAULT_VALUES.ts
ERROR_MESSAGES.ts
```

## TypeScript Standards

### Type Definitions

**Interfaces for object shapes**:
```typescript
interface User {
  id: string
  email: string
  name: string
  createdAt: Date
}
```

**Types for unions and computed types**:
```typescript
type Theme = 'light' | 'dark' | 'system'
type UserWithoutId = Omit<User, 'id'>
```

**Generic types for reusability**:
```typescript
interface ApiResponse<T> {
  data: T
  error: string | null
  success: boolean
}
```

### Type Safety Rules

**1. Avoid `any` type**
```typescript
// ❌ Avoid
const data: any = fetchData()

// ✅ Prefer
const data: ApiResponse<User[]> = fetchData()
```

**2. Use proper return types**
```typescript
// ❌ Implicit return type
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// ✅ Explicit return type
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}
```

**3. Use type guards for runtime checks**
```typescript
function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' &&
         obj !== null &&
         typeof (obj as User).id === 'string'
}
```

### Database Types

**Use generated Supabase types**:
```typescript
import { Database } from '@/lib/database.types'

type User = Database['public']['Tables']['users']['Row']
type UserInsert = Database['public']['Tables']['users']['Insert']
type UserUpdate = Database['public']['Tables']['users']['Update']
```

## React Component Standards

### Component Structure

**Functional components with TypeScript**:
```typescript
interface UserProfileProps {
  userId: string
  className?: string
  onUpdate?: (user: User) => void
}

export function UserProfile({ userId, className, onUpdate }: UserProfileProps) {
  // Component logic here

  return (
    <div className={cn('user-profile', className)}>
      {/* JSX here */}
    </div>
  )
}
```

### Component Organization

**1. Imports** (in order):
```typescript
// React and Next.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Third-party libraries
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'

// Internal utilities and types
import { cn } from '@/lib/utils'
import { User } from '@/types/user'

// Internal components
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Relative imports
import './UserProfile.css'
```

**2. Types and interfaces**
**3. Component implementation**
**4. Default export**

### Props and State

**Props interface**:
```typescript
interface ComponentProps {
  // Required props first
  id: string
  title: string

  // Optional props
  className?: string
  variant?: 'primary' | 'secondary'

  // Event handlers
  onClick?: () => void
  onSubmit?: (data: FormData) => void

  // Children and complex types
  children?: React.ReactNode
}
```

**State management**:
```typescript
// Simple local state
const [isOpen, setIsOpen] = useState(false)

// Complex state with proper typing
const [formData, setFormData] = useState<FormData>({
  name: '',
  email: '',
  preferences: {}
})

// State updates
const updateFormData = (field: keyof FormData, value: unknown) => {
  setFormData(prev => ({ ...prev, [field]: value }))
}
```

### Event Handlers

**Naming convention**: `handle` + `Action`
```typescript
const handleSubmit = (event: React.FormEvent) => {
  event.preventDefault()
  // Handle form submission
}

const handleUserSelect = (user: User) => {
  setSelectedUser(user)
  onUserSelect?.(user)
}

const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = event.target
  updateFormData(name, value)
}
```

## Styling Standards

### Tailwind CSS

**Class organization**:
```typescript
// ✅ Organized by category
<div className={cn(
  // Layout
  'flex items-center justify-between',
  // Spacing
  'px-4 py-2 mb-4',
  // Appearance
  'bg-white border border-gray-200 rounded-lg shadow-sm',
  // States
  'hover:bg-gray-50 focus:ring-2 focus:ring-blue-500',
  // Responsive
  'sm:px-6 md:px-8',
  // Conditional classes
  isActive && 'bg-blue-50 border-blue-200',
  className
)}>
```

**Component variants**:
```typescript
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)
```

### CSS Guidelines

**Avoid custom CSS when possible**
- Use Tailwind utilities first
- Create component variants for reusable patterns
- Use CSS modules for complex custom styles

**CSS Module example** (when needed):
```css
/* UserProfile.module.css */
.container {
  @apply flex flex-col space-y-4;
}

.avatar {
  @apply w-16 h-16 rounded-full object-cover;
  transition: transform 0.2s ease-in-out;
}

.avatar:hover {
  transform: scale(1.05);
}
```

## State Management

### TanStack Query

**Query naming**:
```typescript
// Query keys
export const instrumentKeys = {
  all: ['instruments'] as const,
  lists: () => [...instrumentKeys.all, 'list'] as const,
  list: (filters: string) => [...instrumentKeys.lists(), filters] as const,
  details: () => [...instrumentKeys.all, 'detail'] as const,
  detail: (id: string) => [...instrumentKeys.details(), id] as const,
}

// Query functions
export function useInstruments(filters?: InstrumentFilters) {
  return useQuery({
    queryKey: instrumentKeys.list(JSON.stringify(filters)),
    queryFn: () => getInstruments(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

**Mutation patterns**:
```typescript
export function useCreateInstrument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createInstrument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instrumentKeys.lists() })
    },
  })
}
```

### Zustand Stores

**Store structure**:
```typescript
interface NotificationState {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set, get) => ({
      notifications: [],

      addNotification: (notification) => set((state) => ({
        notifications: [
          ...state.notifications,
          { ...notification, id: crypto.randomUUID() }
        ]
      })),

      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),

      clearNotifications: () => set({ notifications: [] }),
    }),
    { name: 'notification-store' }
  )
)
```

## API and Data Handling

### Error Handling

**API error handling**:
```typescript
async function fetchUserData(id: string): Promise<User> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw new Error(`Failed to fetch user: ${error.message}`)
    }

    return data
  } catch (error) {
    // Log error for monitoring
    console.error('User fetch error:', error)

    // Re-throw with user-friendly message
    throw new Error('Unable to load user data. Please try again.')
  }
}
```

**Component error boundaries**:
```typescript
function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="error-fallback">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}

// Usage
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <UserProfile userId={userId} />
</ErrorBoundary>
```

### Form Validation

**Zod schemas**:
```typescript
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  age: z.number().min(18, 'Must be at least 18 years old').max(120),
  preferences: z.object({
    newsletter: z.boolean().default(false),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
  }),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
```

**Form handling**:
```typescript
function UserForm({ onSubmit }: UserFormProps) {
  const [formData, setFormData] = useState<CreateUserInput>({
    email: '',
    name: '',
    age: 18,
    preferences: {
      newsletter: false,
      theme: 'system',
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    try {
      const validatedData = createUserSchema.parse(formData)
      onSubmit(validatedData)
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Handle validation errors
        setErrors(error.format())
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  )
}
```

## Security Standards

### Environment Variables

**Never commit secrets**:
```typescript
// ❌ Never do this
const apiKey = 'sk-1234567890abcdef'

// ✅ Use environment variables
const apiKey = process.env.NEXT_PUBLIC_API_KEY
```

**Validate environment variables**:
```typescript
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']),
})

export const env = envSchema.parse(process.env)
```

### Input Sanitization

**Sanitize user inputs**:
```typescript
function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 1000) // Limit length
}
```

**Use proper validation**:
```typescript
// Validate and sanitize email
const emailSchema = z.string()
  .email()
  .transform(email => email.toLowerCase().trim())

// Validate file uploads
const fileSchema = z.object({
  type: z.enum(['image/png', 'image/jpeg', 'image/gif']),
  size: z.number().max(5 * 1024 * 1024), // 5MB max
})
```

## Performance Standards

### Code Splitting

**Dynamic imports for large components**:
```typescript
import dynamic from 'next/dynamic'

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <div>Loading...</div>,
  ssr: false,
})
```

**Route-based code splitting**:
```typescript
// Automatic with Next.js App Router
// Each page.tsx creates a separate bundle
```

### Optimization Techniques

**Memoization**:
```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return items.reduce((acc, item) => acc + item.complexCalculation(), 0)
}, [items])

// Memoize callback functions
const handleClick = useCallback((id: string) => {
  onItemClick(id)
}, [onItemClick])

// Memoize components
const MemoizedComponent = memo(({ data }: Props) => {
  return <div>{data.name}</div>
})
```

**Image optimization**:
```typescript
import Image from 'next/image'

// Use Next.js Image component
<Image
  src="/user-avatar.jpg"
  alt="User avatar"
  width={64}
  height={64}
  className="rounded-full"
  priority={false} // Only for above-the-fold images
/>
```

## Testing Standards

### Test Organization

**File naming**:
```
src/
├── components/
│   ├── UserProfile.tsx
│   └── UserProfile.test.tsx
└── __tests__/
    ├── unit/
    ├── integration/
    └── e2e/
```

**Test structure**:
```typescript
describe('UserProfile Component', () => {
  beforeEach(() => {
    // Setup before each test
  })

  afterEach(() => {
    // Cleanup after each test
  })

  describe('when user is loaded', () => {
    it('displays user information correctly', () => {
      // Test implementation
    })

    it('handles user update actions', () => {
      // Test implementation
    })
  })

  describe('when user is loading', () => {
    it('shows loading state', () => {
      // Test implementation
    })
  })
})
```

### Assertion Guidelines

**Use descriptive assertions**:
```typescript
// ❌ Vague assertion
expect(result).toBeTruthy()

// ✅ Specific assertion
expect(result.status).toBe('success')
expect(result.data).toHaveLength(3)
expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
```

## Documentation Standards

### Code Comments

**When to comment**:
```typescript
// ✅ Complex business logic
function calculateTaxRate(income: number, state: string): number {
  // Tax rates vary by state and income bracket
  // Using 2024 federal tax tables
  if (state === 'CA' && income > 100000) {
    return 0.37 // California high earner rate
  }
  // ... more logic
}

// ✅ Non-obvious solutions
function debounce<T extends (...args: any[]) => any>(func: T, delay: number) {
  let timeoutId: NodeJS.Timeout

  // Return a function that delays execution until after delay milliseconds
  // have passed since the last invocation
  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

// ❌ Obvious comments
const user = getUser() // Get the user
```

### JSDoc for Public APIs

```typescript
/**
 * Formats a currency value with proper locale and currency code
 *
 * @param amount - The numeric amount to format
 * @param currency - ISO currency code (default: 'USD')
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 *
 * @example
 * ```typescript
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1234.56, 'EUR', 'de-DE') // "1.234,56 €"
 * ```
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}
```

## Git Commit Standards

### Commit Message Format

**Structure**:
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples**:
```
feat(auth): add password reset functionality

fix(ui): resolve button alignment issue in mobile view

docs(api): update authentication endpoint documentation

test(components): add unit tests for UserProfile component

refactor(hooks): extract common logic to custom hook
```

### Branch Naming

**Format**: `<type>/<description>`

**Examples**:
- `feat/user-profile-page`
- `fix/login-validation-error`
- `docs/update-readme`
- `refactor/extract-api-client`

## Code Review Guidelines

### Review Checklist

**Functionality**:
- [ ] Code works as intended
- [ ] Edge cases are handled
- [ ] Error handling is appropriate
- [ ] Performance considerations addressed

**Code Quality**:
- [ ] Follows project conventions
- [ ] Code is readable and maintainable
- [ ] No code duplication
- [ ] Proper abstractions used

**Security**:
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] Proper error messages (no sensitive data)
- [ ] Authentication/authorization checks

**Testing**:
- [ ] Tests cover new functionality
- [ ] Tests are meaningful and not brittle
- [ ] Test coverage maintained or improved

### Review Comments

**Constructive feedback**:
```
// ✅ Helpful suggestion
Consider using a Map instead of an object for better performance with
frequent lookups. Here's an example: [code example]

// ✅ Question for clarification
Why did you choose this approach over using the existing utility function?

// ❌ Unhelpful criticism
This is wrong.
```

## Enforcement

### Automated Tools

**Pre-commit Hooks**:
- ESLint for code quality
- Prettier for formatting
- TypeScript compilation check
- Test execution

**CI/CD Pipeline**:
- All linting rules must pass
- Type checking must pass
- Tests must pass with minimum coverage
- Build must succeed

### Manual Review

**Required for**:
- All pull requests
- Changes to critical paths
- New features or major refactors
- Documentation updates

**Reviewers should check**:
- Code follows these standards
- Architecture decisions are sound
- Security implications considered
- Performance impact assessed

## Resources

### Tools and Extensions

**VS Code Extensions**:
- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- Auto Rename Tag

**Browser Extensions**:
- React Developer Tools
- TanStack Query DevTools

### Documentation

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TanStack Query Documentation](https://tanstack.com/query/latest)

### Internal Resources

- Architecture documentation: `/docs/architecture/`
- Component library: `/docs/components/`
- API documentation: `/docs/api/`
- Testing guide: `/docs/quality/testing-guide.md`