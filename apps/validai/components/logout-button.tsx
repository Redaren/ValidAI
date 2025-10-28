"use client";

import { createBrowserClient } from "@playze/shared-auth/client";
import { Button } from "@playze/shared-ui";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return <Button onClick={logout}>Logout</Button>;
}
