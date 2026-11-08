"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

// Marks one link as removed. Each link has its own button, so the survivor
// never marks a different link than the one she is looking at. Marking a link
// removed stops follow-ups on it, so she confirms first.
export function MarkRemovedButton({ caseId, urlId, platformName, locale }: { caseId: string; urlId: string; platformName: string; locale: Locale }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "working" | "error">("idle");
  const linkClass = "!text-sm underline underline-offset-4 transition-colors disabled:opacity-50";

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

  if (state === "confirm" || state === "working") {
    return (
      <span className="flex max-w-[16rem] flex-col items-end gap-1.5 text-right">
        <span className="text-xs leading-[1.5] text-[var(--text-muted)]">{t(locale, "case.link.confirmRemoved")}</span>
        <span className="flex gap-4">
          <button
            type="button"
            className={`${linkClass} text-[var(--text-muted)] decoration-[var(--line)] hover:text-[var(--ink)]`}
            disabled={state === "working"}
            onClick={() => setState("idle")}
          >
            {t(locale, "case.link.cancel")}
          </button>
          <button
            type="button"
            className={`${linkClass} font-medium text-[var(--brand-strong)] decoration-current`}
            disabled={state === "working"}
            onClick={markRemoved}
            aria-label={`${t(locale, "case.link.confirmYes")}: ${platformName}`}
          >
            {state === "working" ? t(locale, "case.actions.working") : t(locale, "case.link.confirmYes")}
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={`${linkClass} text-[var(--text-muted)] decoration-[var(--line)] hover:text-[var(--ink)] hover:decoration-current`}
        onClick={() => setState("confirm")}
        aria-label={`${t(locale, "case.link.markRemoved")}: ${platformName}`}
      >
        {t(locale, "case.link.markRemoved")}
      </button>
      {state === "error" && <span role="alert" className="text-xs text-[var(--danger)]">{t(locale, "case.actions.resolveError")}</span>}
    </span>
  );
}
