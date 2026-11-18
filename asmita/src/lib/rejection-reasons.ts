import { t, type Locale, type MessageKey } from "@/lib/i18n";

// Reasons an admin can give when a survivor's link is not accepted. The
// English text is what is stored and audited, so the survivor reads exactly
// what the admin picked; a Hindi reader sees the matching translation.
export const REJECTION_PRESETS = [
  { id: "not_relevant", key: "rejectReason.notRelevant" },
  { id: "already_removed", key: "rejectReason.alreadyRemoved" },
  { id: "not_specific", key: "rejectReason.notSpecific" },
  { id: "out_of_scope", key: "rejectReason.outOfScope" },
  { id: "duplicate", key: "rejectReason.duplicate" },
] as const satisfies readonly { id: string; key: MessageKey }[];

export type RejectionChoice = (typeof REJECTION_PRESETS)[number]["id"] | "other";

// Same limits as the reject API and the old free-text box.
export const REJECTION_REASON_MIN = 3;
export const REJECTION_REASON_MAX = 500;

export function presetText(id: string, locale: Locale = "en"): string | null {
  const preset = REJECTION_PRESETS.find((item) => item.id === id);
  return preset ? t(locale, preset.key) : null;
}

/** The exact text sent to the server, or null when the choice is incomplete. */
export function rejectionReasonText(choice: RejectionChoice | null, other: string): string | null {
  if (!choice) return null;
  if (choice !== "other") return presetText(choice);
  const text = other.trim();
  return text.length >= REJECTION_REASON_MIN && text.length <= REJECTION_REASON_MAX ? text : null;
}

/** A stored preset is shown in her language; anything else is shown as written. */
export function localizeRejectionReason(stored: string | null | undefined, locale: Locale): string | null {
  const text = stored?.trim();
  if (!text) return null;
  const preset = REJECTION_PRESETS.find((item) => t("en", item.key) === text);
  return preset ? t(locale, preset.key) : text;
}
