"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const pageMinutes = () => {
  const text = document.querySelector("main")?.textContent ?? "";
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
};

// "· 6 min read", counted from the words on the rendered page at 200 a minute.
// Counted in the browser so it works for any page, translated or not; the
// server renders nothing. `label` holds "{n}" for the number.
export function ReadingTime({ label }: { label: string }) {
  const minutes = useSyncExternalStore(noSubscribe, pageMinutes, () => null);
  if (minutes === null) return null;
  return <> · {label.replace("{n}", String(minutes))}</>;
}
