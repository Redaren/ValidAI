import { render, screen } from '@testing-library/react'
import { AuthButton } from '@/components/auth-button'

// Mock the Supabase client
vi.mock('@playze/shared-auth/server', () => ({
  createServerClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getClaims: vi.fn(() => Promise.resolve({ data: { claims: null }, error: null }))
    }
  }))
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}))

describe('AuthButton Component', () => {
  it('renders sign in link when user is not authenticated', async () => {
    render(await AuthButton())
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })
})