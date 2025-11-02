import { createServerClient } from "@playze/shared-auth/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Extract locale from pathname (e.g., /sv/auth/confirm → "sv")
  const localeMatch = pathname.match(/^\/([a-z]{2})\//);
  const locale = localeMatch ? localeMatch[1] : 'en';

  const next = searchParams.get("next") ?? `/${locale}`;

  if (token_hash && type) {
    const supabase = await createServerClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // Redirect user to specified redirect URL or root of app (locale-aware)
      return NextResponse.redirect(new URL(next, request.url));
    } else {
      // Redirect the user to an error page with some instructions (locale-aware)
      return NextResponse.redirect(
        new URL(`/${locale}/auth/error?error=${encodeURIComponent(error?.message)}`, request.url)
      );
    }
  }

  // Redirect the user to an error page with some instructions (locale-aware)
  return NextResponse.redirect(
    new URL(`/${locale}/auth/error?error=No%20token%20hash%20or%20type`, request.url)
  );
}
