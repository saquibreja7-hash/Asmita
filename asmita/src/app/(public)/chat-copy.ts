import type { MessageKey } from "@/lib/i18n";

// The strings the home page chat shows. The page reads them in the visitor's
// language and passes them down, so the client bundle carries no dictionary.
export const CHAT_COPY_KEYS = [
  "chat.open", "chat.title", "chat.close",
  "chat.notice.heading", "chat.notice.ai", "chat.notice.logs", "chat.notice.noImages",
  "chat.notice.minors", "chat.notice.danger", "chat.start",
  "chat.greeting", "chat.typing", "chat.placeholder", "chat.send", "chat.again",
  "chat.you", "chat.assistant", "chat.linkWarning", "chat.tooLong",
  "chat.error.busy", "chat.error.unavailable", "chat.phone",
] as const satisfies readonly MessageKey[];

export type ChatCopy = Record<(typeof CHAT_COPY_KEYS)[number], string>;
