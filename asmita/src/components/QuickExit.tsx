"use client";

import { useEffect, useRef } from "react";
import { t, type Locale } from "@/lib/i18n";

/*
 * Quick Exit — the safety hatch for a survivor browsing with someone nearby
 * (survivor-security roadmap, Phase 1 item 2: "Safe access + Quick Exit").
 *
 * Triggers: the always-visible button, or pressing Escape twice within
 * ESCAPE_WINDOW_MS. The sequence is ordered so safety comes before tidiness:
 *
 *   1. Instantly blank the page and neutralise the tab title — synchronous
 *      DOM work, no round trip, so nothing sensitive is on screen even
 *      before navigation starts.
 *   2. Sign out (CSRF POST /api/auth/logout — the session cookie is
 *      httpOnly, so only the server can clear it). The wait is bounded so
 *      navigation is never delayed more than LOGOUT_WAIT_MS.
 *   3. location.replace() the neutral destination — replace keeps this page
 *      out of the current history slot.
 *
 * The idle timer signs the survivor out after inactivity and returns to the
 * public home page: an unattended machine must not keep a live case open.
 */

const QUICK_EXIT_URL = process.env.NEXT_PUBLIC_QUICK_EXIT_URL || "https://www.google.co.in";

/** Two Escape presses inside this window count as "get me out". */
export const ESCAPE_WINDOW_MS = 800;

/** Sign-out is given at most this long before navigation proceeds anyway. */
export const LOGOUT_WAIT_MS = 500;

export function isDoubleEscape(now: number, previousAt: number, windowMs = ESCAPE_WINDOW_MS) {
  return previousAt > 0 && now - previousAt <= windowMs;
}

export function idleTimeoutMs() {
  const raw = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 15_000 && raw <= 12 * 60 * 60_000 ? raw : 20 * 60 * 1_000;
}

export function QuickExit({ locale, enableIdle = true }: { locale: Locale; enableIdle?: boolean }) {
  const actionsRef = useRef<{ exit: () => void } | null>(null);

  useEffect(() => {
    let disposed = false;

    async function signOut() {
      try {
        const { csrfFetch } = await import("@/lib/client-csrf");
        await Promise.race([
          csrfFetch("/api/auth/logout", { method: "POST" }),
          new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
        ]);
      } catch {
        // Navigation must happen even if sign-out could not complete; the
        // survivor's next /case visit redirects to /start without a session.
      }
    }

    function neutraliseScreen() {
      // The title a passer-by reads matters more than the network call.
      document.title = "Google";
      const overlay = document.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#fff;";
      document.body.appendChild(overlay);
    }

    async function quickExit() {
      neutraliseScreen();
      await signOut();
      if (!disposed) window.location.replace(QUICK_EXIT_URL);
    }

    async function idleExit() {
      await signOut();
      if (!disposed) window.location.replace("/");
    }

    let lastEscapeAt = 0;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const now = Date.now();
      if (isDoubleEscape(now, lastEscapeAt)) {
        lastEscapeAt = 0;
        void quickExit();
      } else {
        lastEscapeAt = now;
      }
    }

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => void idleExit(), idleTimeoutMs());
    }

    const activityTypes = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    document.addEventListener("keydown", onKeyDown);
    if (enableIdle) {
      // Idle sign-out protects a live session; on pre-session screens it
      // would only throw away half-typed form input.
      activityTypes.forEach((type) => document.addEventListener(type, resetIdle, { passive: true }));
      resetIdle();
    }

    actionsRef.current = { exit: () => void quickExit() };

    return () => {
      disposed = true;
      actionsRef.current = null;
      document.removeEventListener("keydown", onKeyDown);
      activityTypes.forEach((type) => document.removeEventListener(type, resetIdle));
      clearTimeout(idleTimer);
    };
  }, [enableIdle]);

  return (
    <button
      type="button"
      className="btn quick-exit"
      onClick={() => actionsRef.current?.exit()}
      aria-label={t(locale, "quickexit.buttonAria")}
      title={t(locale, "quickexit.buttonAria")}
    >
      {t(locale, "quickexit.button")}
    </button>
  );
}
