import { redirect } from "next/navigation"

/**
 * Root Page
 *
 * Redirects to admin dashboard (which then redirects to /organizations)
 */
export default function HomePage() {
  redirect("/organizations")
}
