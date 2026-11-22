"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

// The one-click action on /newsletter/confirm and /newsletter/unsubscribe.
// The token arrives in the email link; the press POSTs it to the matching
// API route, which is where the token is checked.

type Outcome = "pending" | "working" | "done" | "invalid";

export function NewsletterTokenAction({
  locale,
  token,
  action,
}: {
  locale: Locale;
  token: string;
  action: "confirm" | "unsubscribe";
}) {
  const [outcome, setOutcome] = useState<Outcome>("pending");
  const [working, setWorking] = useState(false);

  async function run() {
    setWorking(true);
    setOutcome("working");
    const response = await csrfFetch(`/api/newsletter/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    setWorking(false);
    setOutcome(response?.ok ? "done" : "invalid");
  }

  if (outcome === "done") {
    return (
      <div role="status" aria-live="polite">
        <h2 className="subsection-title">{action === "confirm" ? t(locale, "org.newsletter.confirmedTitle") : t(locale, "org.newsletter.unsubTitle")}</h2>
        <p className="mt-4 text-[16px] leading-[1.7] text-[var(--text)]">
          {action === "confirm" ? t(locale, "org.newsletter.confirmedBody") : t(locale, "org.newsletter.unsubBody")}
        </p>
      </div>
    );
  }

  if (outcome === "invalid") {
    return (
      <div role="alert">
        <h2 className="subsection-title">
          {action === "confirm" ? t(locale, "org.newsletter.tokenInvalidTitle") : t(locale, "org.newsletter.unsubInvalidTitle")}
        </h2>
        <p className="mt-4 text-[16px] leading-[1.7] text-[var(--text)]">
          {action === "confirm" ? t(locale, "org.newsletter.tokenInvalidBody") : t(locale, "org.newsletter.unsubInvalidBody")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[16px] leading-[1.7] text-[var(--text)]">
        {action === "confirm" ? t(locale, "org.newsletter.confirmBody") : t(locale, "org.newsletter.unsubTitle")}
      </p>
      <button type="button" className="btn btn-primary btn-arrow !m-0 mt-6" onClick={run} disabled={working}>
        {working
          ? action === "confirm"
            ? t(locale, "org.newsletter.confirmWorking")
            : t(locale, "org.newsletter.unsubWorking")
          : action === "confirm"
            ? t(locale, "org.newsletter.confirmButton")
            : t(locale, "org.newsletter.unsubButton")}
      </button>
    </div>
  );
}
