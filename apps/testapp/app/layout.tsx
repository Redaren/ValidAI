import type { Metadata } from "next"
import { Providers } from "./providers"
import "./globals.css"

/**
 * Root Layout (Server Component)
 *
 * This is a server component that provides the base HTML structure.
 * Client-side providers (QueryClient) are in separate Providers component.
 *
 * Why server component?
 * - Better performance (no hydration needed for static parts)
 * - Proper Next.js metadata API usage
 * - Prevents hydration errors from <html> and <head> tags
 */

export const metadata: Metadata = {
  title: "TestApp - Playze Platform",
  description: "Minimal reference application for Playze Core platform",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
