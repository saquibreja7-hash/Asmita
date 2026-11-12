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
      className="link-underline"
      onClick={logout}
      type="button"
    >
      Sign out
    </button>
  );
}
