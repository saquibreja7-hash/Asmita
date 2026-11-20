"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { clearTabStorage } from "@/lib/clear-tab-storage";
import { t, type Locale } from "@/lib/i18n";

// Closes her dashboard: signs her out (the session cookie is cleared) and
// leaves for the home page, replacing this page in history so Back does not
// return to the case. Quick exit is the emergency version of the same thing.
export function CloseDashboardButton({ locale }: { locale: Locale }) {
  const [closing, setClosing] = useState(false);

  async function close() {
    setClosing(true);
    // Before the navigation, not after the request: the tab must not keep
    // the draft or the eligibility answers even if sign-out never finishes.
    clearTabStorage();
    try {
      await csrfFetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/");
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-compact !min-h-[40px] !px-4 text-sm" onClick={close} disabled={closing}>
      {t(locale, closing ? "case.close.closing" : "case.close")}
    </button>
  );
}
