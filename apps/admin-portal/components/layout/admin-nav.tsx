"use client"

import { Button, AppSwitcher } from "@playze/shared-ui"
import Link from "next/link"
import { useAuth } from "@playze/shared-auth"
import { createBrowserClient } from "@playze/shared-auth/client"
import { useRouter } from "next/navigation"

export function AdminNav() {
  const { data: user, isLoading } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="font-bold">ValidAI Admin</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <div className="flex items-center space-x-4">
            <AppSwitcher currentApp="admin" />
            <span className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : user?.email || "Admin User"}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
