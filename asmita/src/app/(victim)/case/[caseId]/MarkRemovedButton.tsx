"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

// Marks one link as removed. Each link has its own button, so the survivor
// never marks a different link than the one she is looking at.
export function MarkRemovedButton({ caseId, urlId, platformName, locale }: { caseId: string; urlId: string; platformName: string; locale: Locale }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function markRemoved() {
    setState("working");
    try {
      const response = await csrfFetch(`/api/cases/${caseId}/mark-resolved`, {
        method: "POST",
        body: JSON.stringify({ urlId }),
      });
      if (!response.ok) { setState("error"); return; }
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="!text-sm text-[var(--text-muted)] underline decoration-[var(--line)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:decoration-current disabled:opacity-50"
        disabled={state === "working"}
        onClick={markRemoved}
        aria-label={`${t(locale, "case.link.markRemoved")}: ${platformName}`}
      >
        {state === "working" ? t(locale, "case.actions.working") : t(locale, "case.link.markRemoved")}
      </button>
      {state === "error" && <span role="alert" className="text-xs text-[var(--danger)]">{t(locale, "case.actions.resolveError")}</span>}
    </span>
  );
}
