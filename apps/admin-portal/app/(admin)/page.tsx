import { redirect } from "next/navigation"

/**
 * Admin Dashboard
 *
 * For MVP, we redirect to /organizations as the default landing page.
 * In the future, this could be a dashboard with statistics and quick actions.
 */
export default function AdminDashboardPage() {
  redirect("/organizations")
}
