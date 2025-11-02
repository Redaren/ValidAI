"use client";

import { createBrowserClient } from "@playze/shared-auth/client";
import { Button } from "@playze/shared-ui";
import { useRouter } from "@/lib/i18n/navigation";
import { useTranslations } from 'next-intl';

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslations('nav');

  const logout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return <Button onClick={logout}>{t('logout')}</Button>;
}
