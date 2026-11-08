"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

// Form-only platforms (Meta, X, LinkedIn) take reports only through their own
// form, so Asmita cannot send the notice. Once the survivor says she filed it,
// the link gets the same escalation ladder as an emailed notice.
export function PlatformFiledButton({ caseId, urlId, platform, formUrl, locale }: {
  caseId: string;
  urlId: string;
  platform: string;
  formUrl: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "working" | "error">("idle");
  const say = (key: MessageKey) => t(locale, key).replaceAll("{platform}", platform);

  async function markFiled() {
    setState("working");
    try {
      const response = await csrfFetch(`/api/cases/${caseId}/platform-filed`, {
        method: "POST",
        body: JSON.stringify({ urlId }),
      });
      if (!response.ok) { setState("error"); return; }
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-4 w-full border-t border-[var(--line)] pt-4 text-sm leading-[1.7]">
      <p className="muted">{say("ladder.filed.prompt")}</p>
      {state === "confirm" || state === "working" ? (
        <div className="mt-3">
          <p className="text-[var(--ink)]">{say("ladder.filed.confirm")}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <button type="button" className="!text-sm text-[var(--text-muted)] underline underline-offset-4" disabled={state === "working"} onClick={() => setState("idle")}>
              {t(locale, "case.link.cancel")}
            </button>
            <button type="button" className="!text-sm font-medium text-[var(--brand-strong)] underline underline-offset-4" disabled={state === "working"} onClick={markFiled}>
              {state === "working" ? t(locale, "case.actions.working") : say("ladder.filed.yes")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <a className="btn btn-secondary btn-arrow !m-0" href={formUrl} target="_blank" rel="noopener noreferrer">{say("ladder.filed.open")}</a>
          <button type="button" className="!text-sm font-medium text-[var(--brand-strong)] underline underline-offset-4" onClick={() => setState("confirm")}>
            {say("ladder.filed.cta")}
          </button>
        </div>
      )}
      {state === "error" && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{say("ladder.filed.error")}</p>}
    </div>
  );
}
