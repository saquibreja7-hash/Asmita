"use client";

import { useEffect, useRef } from "react";
import { csrfFetch } from "@/lib/client-csrf";
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
 *      httpOnly, so only the server can clear it). The screen is already
 *      blank, so we wait for sign-out to actually finish (up to
 *      LOGOUT_WAIT_MS) rather than racing it: navigating away cancels any
 *      request still in flight, which would leave the session live on a slow
 *      connection. The logout POST is sent with keepalive, so once it has
 *      left the page it completes even if the tab navigates or closes.
 *   3. location.replace() the public home page — replace keeps this page
 *      out of the current history slot.
 *
 * The idle timer signs the survivor out after inactivity and returns to the
 * same public home page: an unattended machine must not keep a live case open.
 */

/** Where both Quick Exit and the idle sign-out land: Asmita's public home page. */
export const QUICK_EXIT_URL = "/";

/** Two Escape presses inside this window count as "get me out". */
export const ESCAPE_WINDOW_MS = 800;

/**
 * Longest we wait for sign-out before navigating anyway. Long enough for the
 * two round trips (CSRF token, then logout) on a slow mobile connection; the
 * screen is blank the whole time, so the wait never exposes anything.
 */
export const LOGOUT_WAIT_MS = 5_000;

export function isDoubleEscape(now: number, previousAt: number, windowMs = ESCAPE_WINDOW_MS) {
  return previousAt > 0 && now - previousAt <= windowMs;
}

export function idleTimeoutMs() {
  const raw = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 15_000 && raw <= 12 * 60 * 60_000 ? raw : 20 * 60 * 1_000;
}

export function QuickExit({ locale, enableIdle = true }: { locale: Locale; enableIdle?: boolean }) {
  const actionsRef = useRef<{ exit: () => void } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let disposed = false;

    async function signOut() {
      try {
        await Promise.race([
          csrfFetch("/api/auth/logout", { method: "POST", keepalive: true }),
          new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
        ]);
      } catch {
        // Offline or the server refused: navigation still happens so the
        // screen never stays stuck. The session may then still be live.
      }
    }

    function neutraliseScreen() {
      // The title a passer-by reads matters more than the network call.
      document.title = "Asmita";
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
      if (!disposed) window.location.replace(QUICK_EXIT_URL);
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
    // Marks the moment the Escape shortcut is live (tests wait for it).
    buttonRef.current?.setAttribute("data-armed", "true");

    return () => {
      disposed = true;
      actionsRef.current = null;
      buttonRef.current?.removeAttribute("data-armed");
      document.removeEventListener("keydown", onKeyDown);
      activityTypes.forEach((type) => document.removeEventListener(type, resetIdle));
      clearTimeout(idleTimer);
    };
  }, [enableIdle]);

  return (
    <button
      ref={buttonRef}
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
