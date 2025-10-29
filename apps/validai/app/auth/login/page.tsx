'use client'

import { LoginForm } from "@/components/login-form";
import { useToastStore } from "@/stores";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const addToast = useToastStore((state) => state.addToast);

  // Show error from URL params (e.g., from callback route)
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      addToast({
        variant: 'destructive',
        title: 'Authentication error',
        description: decodeURIComponent(error),
        duration: 8000,
      });
    }
  }, [searchParams, addToast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
