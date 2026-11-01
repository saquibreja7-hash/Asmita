import type { MessageKey } from "@/lib/i18n";

// The strings the call component shows. The page reads them in the visitor's
// language and passes them down, so the client bundle carries no dictionary.
export const TALK_COPY_KEYS = [
  "talk.notice.heading", "talk.notice.ai", "talk.notice.recording", "talk.notice.noImages",
  "talk.notice.minors", "talk.notice.danger", "talk.notice.mic", "talk.start",
  "talk.status.connecting", "talk.status.listening", "talk.status.speaking", "talk.status.ended",
  "talk.error.busy", "talk.error.microphone", "talk.error.unavailable",
  "talk.mute", "talk.unmute", "talk.end", "talk.again", "talk.phone",
] as const satisfies readonly MessageKey[];

export type TalkCopy = Record<(typeof TALK_COPY_KEYS)[number], string>;
