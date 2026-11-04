"use client";

import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

export function AdminLogoutButton() {
  const router = useRouter();

  async function logout() {
    await csrfFetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <button
      className="text-sm text-[var(--text-muted)] hover:text-[var(--ink)] transition-colors"
      onClick={logout}
      type="button"
    >
      Sign out
    </button>
  );
}
