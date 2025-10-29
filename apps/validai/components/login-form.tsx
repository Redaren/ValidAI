"use client";

import { cn } from "@/lib/utils";
import { createBrowserClient } from "@playze/shared-auth/client";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@playze/shared-ui";
import { useToastStore } from "@/stores";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      setEmailSent(true);
      addToast({
        variant: "success",
        title: "Check your email",
        description: "We sent you a login link. Be sure to check your spam folder.",
        duration: 8000,
      });
    } catch (error) {
      addToast({
        variant: "destructive",
        title: "Error sending login link",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        duration: 8000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendAnother = () => {
    setEmailSent(false);
    setEmail("");
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        {!emailSent ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">ValidAI</CardTitle>
              <CardDescription>
                Sign in with your email to access ValidAI
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                    You must be invited to an organization to access ValidAI
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? "Sending Magic Link..." : "Send Magic Link"}
                </Button>

                <div className="pt-4 border-t text-center">
                  <p className="text-xs text-muted-foreground">
                    A magic link will be sent to your email. Click the link to sign in.
                  </p>
                </div>
              </form>
            </CardContent>
          </>
        ) : (
          <CardContent className="pt-6">
            {/* Success State */}
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
                  <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Check your email</h2>
                <p className="text-muted-foreground">
                  We&apos;ve sent a login link to:
                </p>
                <p className="font-medium">{email}</p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Next steps:</p>
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
          </CardContent>
        )}
      </Card>
    </div>
  );
}
