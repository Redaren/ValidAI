import { updateSession } from "@playze/shared-auth/middleware";
import { createServerClient } from "@playze/shared-auth/server";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // First, update session (handles auth)
  const response = await updateSession(request);

  // Skip access check for auth routes (including callback) and no-access page
  // Callback route needs to complete auth exchange BEFORE middleware checks session
  if (
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname === '/no-access'
  ) {
    return response;
  }

  // Check if user has ValidAI access
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Get user's current organization ID from JWT
    const { data: { user: userWithMetadata } } = await supabase.auth.getUser();
    const orgId = userWithMetadata?.app_metadata?.organization_id;

    if (orgId) {
      // Check if organization has active ValidAI subscription
      // Uses SECURITY DEFINER function to bypass RLS (like is_playze_admin)
      // This avoids circular dependency where RLS on subscription table requires auth.uid()
      const { data: hasAccess, error } = await supabase
        .rpc('check_validai_access' as any, { p_org_id: orgId })
        .single();

      if (error || !hasAccess) {
        // User's organization doesn't have ValidAI access
        const url = request.nextUrl.clone();
        url.pathname = '/no-access';
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - no-access page (to avoid redirect loop)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|no-access|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
