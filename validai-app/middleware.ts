import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Apply auth middleware only to:
     * - /dashboard routes (authenticated app routes)
     * Exclude:
     * - Public routes (homepage, etc.)
     * - Payload admin (/admin)
     * - All /api routes (handled by Payload CMS)
     * - Static files and assets
     */
    "/dashboard/:path*",
  ],
};
