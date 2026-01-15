'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Button, Input, Label, Card } from '@playze/shared-ui'
import { Loader2, Mail, CheckCircle2, AlertCircle, Building2 } from 'lucide-react'

/**
 * Error messages for specific error codes from the callback
 */
const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  no_organization: {
    title: 'No Organization Access',
    description: 'You are not a member of any organization. Please contact your administrator to be invited to an organization.',
  },
}

/**
 * Login Form Component
 *
 * This component handles magic link authentication for TestApp.
 * It is dynamically imported with ssr:false to prevent hydration issues.
 *
 * Features:
 * - Magic link email authentication
 * - Error display from URL parameters (including no_organization)
 * - Success state with instructions
 * - Resend functionality
 */
export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState<string | null>(null)

  // Read error from URL params (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam) {
      const decodedError = decodeURIComponent(errorParam)
      setErrorCode(decodedError)
      // Check if it's a known error code
      if (ERROR_MESSAGES[decodedError]) {
        setError(ERROR_MESSAGES[decodedError].description)
      } else {
        setError(decodedError)
      }
    }
  }, [])

  // Store return URL in cookie for post-login redirect
  // This preserves the redirect destination across the magic link flow
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    if (next) {
      // Set cookie that expires in 10 minutes (enough time to complete login)
      document.cookie = `auth_redirect_url=${encodeURIComponent(next)}; path=/; max-age=600; SameSite=Lax`
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setErrorCode(null)

    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      setEmailSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSendAnother = () => {
    setEmailSent(false)
    setEmail('')
    setError('')
    setErrorCode(null)
  }

  // Get the appropriate error display
  const getErrorDisplay = () => {
    const knownError = errorCode ? ERROR_MESSAGES[errorCode] : null

    if (knownError) {
      return (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {knownError.title}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {knownError.description}
              </p>
            </div>
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        {!emailSent ? (
          <>
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                TestApp
              </h1>
              <p className="text-muted-foreground">
                Sign in to access your dashboard
              </p>
            </div>

            {/* Error Display */}
            {getErrorDisplay()}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your email to receive a magic link
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Sending Magic Link...' : 'Send Magic Link'}
              </Button>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-6 border-t text-center">
              <p className="text-xs text-muted-foreground">
                A magic link will be sent to your email. Click the link to sign in.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Success State */}
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
                  <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
                <p className="text-muted-foreground">
                  We&apos;ve sent a login link to:
                </p>
                <p className="font-medium text-foreground">{email}</p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">Next steps:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Check your email inbox (and spam folder)</li>
                    <li>Click the magic link in the email</li>
                    <li>You&apos;ll be automatically signed in</li>
                  </ol>
                </div>

                <Button onClick={handleSendAnother} variant="outline" className="w-full">
                  Send Another Link
                </Button>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  The link will expire in 60 minutes for security reasons.
                </p>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
