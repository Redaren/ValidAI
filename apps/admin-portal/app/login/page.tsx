'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Button, Input, Label, Card } from '@playze/shared-ui'
import { useToastStore } from '@/stores'
import { Loader2, Mail, CheckCircle2 } from 'lucide-react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const addToast = useToastStore((state) => state.addToast)
  const searchParams = useSearchParams()

  // Show error from URL params (e.g., from callback route)
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      addToast({
        title: 'Authentication error',
        description: decodeURIComponent(error),
        variant: 'destructive',
        duration: 8000, // Show longer for errors
      })
    }
  }, [searchParams, addToast])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

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
      addToast({
        title: 'Check your email',
        description: 'We sent you a login link. Be sure to check your spam folder.',
        variant: 'success',
      })
    } catch (error) {
      addToast({
        title: 'Error sending login link',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSendAnother = () => {
    setEmailSent(false)
    setEmail('')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        {!emailSent ? (
          <>
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Playze Admin Portal
              </h1>
              <p className="text-muted-foreground">
                Sign in with your admin email to access the portal
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@playze.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  You must be registered as an admin to access this portal
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
