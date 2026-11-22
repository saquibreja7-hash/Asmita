"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * The queue list's rows, with counts that refresh themselves every 15 s
 * while the tab is visible (WP141). Everything a row shows is counts and
 * ages; no subject data ever reaches this component.
 */

export type ReviewQueueRowView = {
  key: string;
  name: string;
  description: string | null;
  pending: number;
  oldestCreatedAt: string | null;
  heldByMe: number;
};

const DAY_MS = 24 * 60 * 60_000;
const FOUR_HOURS_MS = 4 * 60 * 60_000;

/** "3h 10m", "2d 4h", "45m" — the console's age wording. */
export function ageText(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

/**
 * The oldest item's age as text plus a tone. The tone is colour, never the
 * only signal: over a day says so in words, and the age value is always
 * text (spec WP141).
 */
export function oldestAge(
  oldestCreatedAt: string | null,
  pending: number,
  now = new Date(),
): { text: string; tone: "fresh" | "aging" | "over-day" } | null {
  if (!oldestCreatedAt || pending === 0) return null;
  const age = now.getTime() - new Date(oldestCreatedAt).getTime();
  if (age > DAY_MS) return { text: `over a day (${ageText(age)})`, tone: "over-day" };
  if (age >= FOUR_HOURS_MS) return { text: ageText(age), tone: "aging" };
  return { text: ageText(age), tone: "fresh" };
}

export function QueueList({ initial }: { initial: ReviewQueueRowView[] }) {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/admin/review/summary", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as { queues?: ReviewQueueRowView[] } | null;
        if (Array.isArray(body?.queues)) setRows(body.queues);
      } catch {
        // A missed poll is fine; the next one is 15 seconds away.
      }
    };
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, []);

  if (rows.length === 0) {
    return <p className="muted mt-6 text-sm">Your admin role has no queues.</p>;
  }

  return (
    <ul aria-label="Review queues" className="a-card mt-6 divide-y divide-[var(--line)]">
      {rows.map((queue) => {
        const oldest = oldestAge(queue.oldestCreatedAt, queue.pending);
        return (
          <li
            className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
            key={queue.key}
          >
            <div className="min-w-0">
              <p className="font-medium">{queue.name}</p>
              {queue.description && <p className="muted mt-0.5 text-xs">{queue.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="a-nowrap">
                <span className="eyebrow block">Waiting</span>
                <span className="text-base font-semibold tabular-nums" data-empty={queue.pending === 0}>
                  {queue.pending === 0 ? "Clear" : queue.pending}
                </span>
              </span>
              <span className="a-nowrap min-w-[10ch]">
                <span className="eyebrow block">Oldest</span>
                {oldest ? (
                  <span
                    className={`text-sm tabular-nums ${
                      oldest.tone === "over-day"
                        ? "font-semibold text-[var(--danger)]"
                        : oldest.tone === "aging"
                          ? "text-[var(--coral)]"
                          : "muted"
                    }`}
                  >
                    {oldest.tone === "over-day" && <span aria-hidden="true">! </span>}
                    {oldest.text}
                  </span>
                ) : (
                  <span className="muted text-sm">-</span>
                )}
              </span>
              <span className="a-nowrap">
                <span className="eyebrow block">Held</span>
                <span className={`text-sm tabular-nums ${queue.heldByMe === 0 ? "muted" : ""}`}>
                  {queue.heldByMe === 0 ? "None held by you" : `${queue.heldByMe} held by you`}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                {queue.pending > 0 ? (
                  <Link className="btn btn-primary" href={`/admin/review/${queue.key}`} prefetch={false}>
                    Start reviewing
                  </Link>
                ) : (
                  <>
                    <button className="btn btn-primary" disabled title="Nothing to review" type="button">
                      Start reviewing
                    </button>
                    <span className="muted text-xs">Nothing to review</span>
                  </>
                )}
                <Link className="link-underline text-sm" href={`/admin/review/${queue.key}/preview`}>
                  Preview
                </Link>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
