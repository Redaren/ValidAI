import type { Metadata } from "next"
import { QueryProvider } from "@/components/providers/query-provider"
import { ToastContainer } from "@/components/ui/toast-container"
import "./globals.css"

export const metadata: Metadata = {
  title: "ValidAI Admin Portal",
  description: "Admin portal for managing ValidAI platform organizations, users, and subscriptions",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <QueryProvider>
          {children}
          <ToastContainer />
        </QueryProvider>
      </body>
    </html>
  )
}
