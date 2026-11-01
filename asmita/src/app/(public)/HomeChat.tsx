"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { linkify } from "@/components/linkify";
import { containsUrlLikeText } from "@/lib/feedback";
import { HELPLINE } from "@/lib/helpline";
import type { ChatCopy } from "./chat-copy";

/*
 * The home page chat with the Asmita Saathi assistant. The hero's message box
 * opens it; whatever the person typed there is sent once they have read the
 * notice and tapped Continue. The conversation lives only in this component:
 * it is sent to /api/chat with each message and is gone when the chat closes.
 * Asmita stores none of it.
 *
 * The panel is rendered into <body>, not inside the hero: an ancestor with a
 * filter or backdrop-filter would otherwise pin a "fixed" panel to itself and
 * clip it, and the sticky site header would cover its close button.
 */

type Phase = "closed" | "notice" | "open" | "error";
type Message = { role: "user" | "assistant"; content: string };
type ErrorKey = "chat.error.busy" | "chat.error.unavailable";
type WarningKey = "chat.linkWarning" | "chat.tooLong" | "";

const MAX_LENGTH = 500;
// The server accepts the last 20 messages; older ones are dropped from what is sent.
const MAX_HISTORY = 20;

function subscribeNever() {
  return () => {};
}

function checkDraft(text: string): WarningKey {
  if (text.length > MAX_LENGTH) return "chat.tooLong";
  if (containsUrlLikeText(text)) return "chat.linkWarning";
  return "";
}

export function HomeChat({ copy, locale }: { copy: ChatCopy; locale: "en" | "hi" }) {
  // True in the browser, false while rendering on the server (no document for the portal).
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [phase, setPhase] = useState<Phase>("closed");
  const [error, setError] = useState<ErrorKey>("chat.error.unavailable");
  const [messages, setMessages] = useState<Message[]>([]);
  const [heroDraft, setHeroDraft] = useState("");
  const [heroWarning, setHeroWarning] = useState<WarningKey>("");
  const [pending, setPending] = useState("");
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState<WarningKey>("");
  const [waiting, setWaiting] = useState(false);
  const csrfToken = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  // Scroll only the message list, never the page behind the panel.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, waiting, phase]);

  useEffect(() => {
    if (phase === "notice") titleRef.current?.focus();
    if (phase === "open") inputRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function close() {
    setMessages([]);
    setDraft("");
    setPending("");
    setWarning("");
    setPhase("closed");
    heroInputRef.current?.focus();
  }

  function openFromHero(event: FormEvent) {
    event.preventDefault();
    const text = heroDraft.trim();
    const problem = checkDraft(text);
    setHeroWarning(problem);
    if (problem) return;
    setPending(text);
    setMessages([]);
    setPhase("notice");
  }

  async function sendText(text: string, history: Message[]) {
    const next = [...history, { role: "user" as const, content: text }];
    setMessages(next);
    setWaiting(true);
    try {
      if (!csrfToken.current) {
        csrfToken.current = ((await (await fetch("/api/csrf", { cache: "no-store" })).json()) as { token: string }).token;
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken.current },
        body: JSON.stringify({ locale, messages: next.slice(-MAX_HISTORY) }),
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

  function start() {
    setPhase("open");
    setHeroDraft("");
    if (pending) {
      const text = pending;
      setPending("");
      void sendText(text, []);
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || waiting) return;
    const problem = checkDraft(text);
    setWarning(problem);
    if (problem) return;
    setDraft("");
    void sendText(text, messages);
  }

  const inlineLink = "link-underline font-medium";

  const panel = (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="home-chat-title"
      className="home-chat-panel"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3">
        <h2 id="home-chat-title" ref={titleRef} tabIndex={-1} className="text-[17px] font-medium leading-tight text-[var(--foreground)] outline-none">
          {copy["chat.title"]}
        </h2>
        <button type="button" className="home-chat-close" onClick={close} aria-label={copy["chat.close"]}>
          <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
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
          <ol role="log" aria-live="polite" className="space-y-3">
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
              ref={inputRef}
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
  );

  return (
    <>
      <form onSubmit={openFromHero} className="home-ask">
        <svg aria-hidden className="shrink-0 text-[var(--color-brand-teal)]" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        <label htmlFor="home-ask-input" className="sr-only">
          {copy["chat.askLabel"]}
        </label>
        <input
          id="home-ask-input"
          ref={heroInputRef}
          value={heroDraft}
          onChange={(event) => {
            setHeroDraft(event.target.value);
            if (heroWarning) setHeroWarning("");
          }}
          maxLength={MAX_LENGTH}
          placeholder={copy["chat.askPlaceholder"]}
          autoComplete="off"
          className="home-ask-input"
        />
        <button type="submit" className="btn btn-primary home-ask-button" aria-expanded={phase !== "closed"}>
          {copy["chat.ask"]}
        </button>
      </form>
      {heroWarning && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {copy[heroWarning]}
        </p>
      )}
      {mounted && phase !== "closed" && createPortal(panel, document.body)}
    </>
  );
}
