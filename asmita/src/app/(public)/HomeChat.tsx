"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { linkify } from "@/components/linkify";
import { containsUrlLikeText } from "@/lib/feedback";
import { HELPLINE } from "@/lib/helpline";
import type { ChatCopy } from "./chat-copy";

/*
 * Text chat with the Asmita Saathi assistant, opened from the home page.
 * The notice comes first; nothing is sent until the person taps Continue.
 * The conversation lives only in this component: it is sent to /api/chat
 * with each message and is gone when the panel closes. Asmita stores none.
 */

type Phase = "closed" | "notice" | "open" | "error";
type Message = { role: "user" | "assistant"; content: string };
type ErrorKey = "chat.error.busy" | "chat.error.unavailable";

const MAX_LENGTH = 500;
// The server accepts the last 20 messages; older ones are dropped from what is sent.
const MAX_HISTORY = 20;

export function HomeChat({
  copy,
  locale,
  triggerClassName,
  children,
}: {
  copy: ChatCopy;
  locale: "en" | "hi";
  triggerClassName: string;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [error, setError] = useState<ErrorKey>("chat.error.unavailable");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState<"chat.linkWarning" | "chat.tooLong" | "">("");
  const [waiting, setWaiting] = useState(false);
  const csrfToken = useRef<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages, waiting]);

  function start() {
    setMessages([]);
    setWarning("");
    setPhase("open");
  }

  function close() {
    setMessages([]);
    setDraft("");
    setPhase("closed");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || waiting) return;
    if (text.length > MAX_LENGTH) return setWarning("chat.tooLong");
    if (containsUrlLikeText(text)) return setWarning("chat.linkWarning");
    setWarning("");
    setDraft("");
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setWaiting(true);
    try {
      if (!csrfToken.current) {
        csrfToken.current = ((await (await fetch("/api/csrf", { cache: "no-store" })).json()) as { token: string }).token;
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken.current },
        body: JSON.stringify({ locale, messages: history.slice(-MAX_HISTORY) }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "chat.error.busy" : "chat.error.unavailable");
        setPhase("error");
        return;
      }
      const { reply } = (await response.json()) as { reply: string };
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setError("chat.error.unavailable");
      setPhase("error");
    } finally {
      setWaiting(false);
    }
  }

  const inlineLink = "link-underline font-medium";

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setPhase("notice")} aria-expanded={phase !== "closed"}>
        {children}
      </button>

      {phase !== "closed" && (
        <section
          role="dialog"
          aria-labelledby="home-chat-title"
          className="fixed inset-x-4 bottom-4 z-50 flex max-h-[min(640px,calc(100dvh-32px))] flex-col rounded-2xl border border-[var(--border)] bg-white text-left shadow-2xl sm:left-auto sm:w-[400px]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
            <h2 id="home-chat-title" className="text-[17px] font-medium leading-tight text-[var(--foreground)]">
              {copy["chat.title"]}
            </h2>
            <button type="button" className="text-sm font-medium text-[var(--foreground)] underline underline-offset-4" onClick={close}>
              {copy["chat.close"]}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {phase === "notice" && (
              <div>
                <p className="font-medium text-[var(--foreground)]">{copy["chat.notice.heading"]}</p>
                <ul className="mt-3 space-y-2 text-sm leading-[1.6] text-[var(--foreground)]">
                  <li>{copy["chat.notice.ai"]}</li>
                  <li>{copy["chat.notice.logs"]}</li>
                  <li>{copy["chat.notice.noImages"]}</li>
                  <li>{linkify(copy["chat.notice.minors"], "1098", "tel:1098", inlineLink)}</li>
                  <li>{linkify(copy["chat.notice.danger"], "112", "tel:112", inlineLink)}</li>
                </ul>
                <button type="button" className="btn btn-primary mt-5" onClick={start}>
                  {copy["chat.start"]}
                </button>
              </div>
            )}

            {(phase === "open" || phase === "error") && (
              <ol ref={logRef} role="log" aria-live="polite" className="space-y-3">
                <li>
                  <span className="sr-only">{copy["chat.assistant"]}: </span>
                  <span className="inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[var(--surface-muted)] px-4 py-2 text-sm leading-[1.55] text-[var(--foreground)]">
                    {copy["chat.greeting"]}
                  </span>
                </li>
                {messages.map((m, i) => (
                  <li key={i} className={m.role === "user" ? "text-right" : ""}>
                    <span className="sr-only">{m.role === "user" ? copy["chat.you"] : copy["chat.assistant"]}: </span>
                    <span
                      className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-left text-sm leading-[1.55] text-[var(--foreground)] ${
                        m.role === "user" ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-muted)]"
                      }`}
                    >
                      {m.content}
                    </span>
                  </li>
                ))}
                {waiting && (
                  <li className="text-sm text-[var(--color-graphite)]" role="status">
                    {copy["chat.typing"]}
                  </li>
                )}
              </ol>
            )}

            {phase === "error" && (
              <div className="mt-4">
                <p role="alert" className="text-sm leading-[1.6] text-[var(--foreground)]">
                  {copy[error]}
                </p>
                <button type="button" className="btn btn-secondary mt-3" onClick={() => setPhase("notice")}>
                  {copy["chat.again"]}
                </button>
              </div>
            )}
          </div>

          {phase === "open" && (
            <form onSubmit={send} className="border-t border-[var(--hairline)] px-5 py-3">
              {warning && (
                <p role="alert" className="mb-2 text-sm text-[var(--danger)]">
                  {copy[warning]}
                </p>
              )}
              <div className="flex items-end gap-2">
                <label htmlFor="home-chat-input" className="sr-only">
                  {copy["chat.placeholder"]}
                </label>
                <textarea
                  id="home-chat-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  maxLength={MAX_LENGTH}
                  rows={2}
                  placeholder={copy["chat.placeholder"]}
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                />
                <button type="submit" className="btn btn-primary" disabled={waiting}>
                  {copy["chat.send"]}
                </button>
              </div>
            </form>
          )}

          <p className="muted border-t border-[var(--hairline)] px-5 py-3 text-xs leading-[1.6]">
            {linkify(copy["chat.phone"], HELPLINE.display, `tel:${HELPLINE.tel}`, "link-underline font-medium text-[var(--foreground)]")}
          </p>
        </section>
      )}
    </>
  );
}
