"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

// Marks the list as seen once it has been shown, then refreshes so the
// sidebar badge clears. The "New" tags on this view stay as rendered.
export function MarkSeen({ unseen }: { unseen: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unseen === 0) return;
    void csrfFetch("/api/admin/new-links/seen", { method: "POST" }).then((res) => {
      if (res.ok) router.refresh();
    });
  }, [unseen, router]);
  return null;
}
