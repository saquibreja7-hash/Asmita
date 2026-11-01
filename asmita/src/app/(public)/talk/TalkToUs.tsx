"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ConversationAgent } from "sarvam-conv-ai-sdk/browser";
import { HELPLINE, VOICE_AGENT } from "@/lib/helpline";
import type { TalkCopy } from "./talk-copy";

/*
 * Browser voice call with the helpline agent. Nothing from Sarvam loads until
 * the person reads the notice and taps Continue: the SDK is imported then,
 * the session route hands back a signed URL, and only after that does the
 * browser ask for the microphone. Asmita keeps no audio or transcript.
 */

type Phase = "notice" | "connecting" | "listening" | "speaking" | "ended" | "error";
type ErrorKey = "talk.error.busy" | "talk.error.microphone" | "talk.error.unavailable";

const STATUS: Partial<Record<Phase, keyof TalkCopy>> = {
  connecting: "talk.status.connecting",
  listening: "talk.status.listening",
  speaking: "talk.status.speaking",
  ended: "talk.status.ended",
};

function isMicrophoneError(error: unknown) {
  return (
    error instanceof DOMException &&
    ["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"].includes(error.name)
  );
}

// Turns the first occurrence of `token` in a translated sentence into a link,
// so the number stays tappable whatever the word order.
function linkify(text: string, token: string, href: string, className: string): ReactNode {
  const at = text.indexOf(token);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <a className={className} href={href}>
        {token}
      </a>
      {text.slice(at + token.length)}
    </>
  );
}

export function TalkToUs({ copy }: { copy: TalkCopy }) {
  const [phase, setPhase] = useState<Phase>("notice");
  const [error, setError] = useState<ErrorKey>("talk.error.unavailable");
  const [muted, setMuted] = useState(false);
  const agentRef = useRef<ConversationAgent | null>(null);

  useEffect(() => {
    return () => {
      void agentRef.current?.stop();
    };
  }, []);

  async function endCall() {
    const agent = agentRef.current;
    agentRef.current = null;
    await agent?.stop().catch(() => undefined);
  }

  async function start() {
    setPhase("connecting");
    setMuted(false);
    try {
      const sdk = await import("sarvam-conv-ai-sdk/browser");
      const csrf = (await (await fetch("/api/csrf", { cache: "no-store" })).json()) as { token: string };
      const agent = new sdk.ConversationAgent({
        apiKey: "",
        baseUrl: "/api/voice/",
        customHeaders: { "x-csrf-token": csrf.token },
        config: {
          org_id: VOICE_AGENT.orgId,
          workspace_id: VOICE_AGENT.workspaceId,
          app_id: VOICE_AGENT.appId,
          version: VOICE_AGENT.version,
          // A random id per call, so nothing identifies the person to Sarvam.
          user_identifier: crypto.randomUUID(),
          user_identifier_type: "unknown",
          interaction_type: sdk.InteractionType.CALL,
          input_sample_rate: 16000,
          output_sample_rate: 16000,
          agent_variables: { user_name: "" },
        },
        audioInterface: new sdk.BrowserAudioInterface(16000),
        stateCallback: (state) => {
          if (state === sdk.AgentState.LISTENING) setPhase("listening");
          else if (state === sdk.AgentState.SPEAKING) setPhase("speaking");
          else if (state === sdk.AgentState.ERROR) {
            setError("talk.error.unavailable");
            setPhase("error");
          }
        },
        endCallback: async () => {
          agentRef.current = null;
          setPhase("ended");
        },
      });
      agentRef.current = agent;
      try {
        await agent.start();
      } catch (err) {
        await endCall();
        setError(
          err instanceof sdk.RateLimitError
            ? "talk.error.busy"
            : isMicrophoneError(err)
              ? "talk.error.microphone"
              : "talk.error.unavailable",
        );
        setPhase("error");
      }
    } catch {
      await endCall();
      setError("talk.error.unavailable");
      setPhase("error");
    }
  }

  function toggleMute() {
    const agent = agentRef.current;
    if (!agent) return;
    if (agent.isMuted()) agent.unmute();
    else agent.mute();
    setMuted(agent.isMuted());
  }

  const inCall = phase === "connecting" || phase === "listening" || phase === "speaking";
  const status = STATUS[phase];
  const inlineLink = "link-underline font-medium";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8" style={{ boxShadow: "var(--shadow-soft)" }}>
      {phase === "notice" && (
        <div>
          <h2 className="text-[22px] font-medium leading-tight text-[var(--foreground)]">{copy["talk.notice.heading"]}</h2>
          <ul className="mt-5 space-y-3 text-base leading-[1.7] text-[var(--foreground)]">
            <li>{copy["talk.notice.ai"]}</li>
            <li>{copy["talk.notice.recording"]}</li>
            <li>{copy["talk.notice.noImages"]}</li>
            <li>{linkify(copy["talk.notice.minors"], "1098", "tel:1098", inlineLink)}</li>
            <li>{linkify(copy["talk.notice.danger"], "112", "tel:112", inlineLink)}</li>
          </ul>
          <p className="muted mt-5 text-sm leading-[1.7]">{copy["talk.notice.mic"]}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={start}>
              {copy["talk.start"]}
            </button>
          </div>
        </div>
      )}

      {phase !== "notice" && (
        <div>
          <p role="status" aria-live="polite" className="text-[20px] font-medium leading-tight text-[var(--foreground)]">
            {status ? copy[status] : ""}
          </p>
          {phase === "error" && (
            <p role="alert" className="text-base leading-[1.7] text-[var(--foreground)]">
              {copy[error]}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {inCall && (
              <>
                <button type="button" className="btn btn-secondary" onClick={toggleMute} disabled={phase === "connecting"} aria-pressed={muted}>
                  {muted ? copy["talk.unmute"] : copy["talk.mute"]}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await endCall();
                    setPhase("ended");
                  }}
                >
                  {copy["talk.end"]}
                </button>
              </>
            )}
            {(phase === "ended" || phase === "error") && (
              <button type="button" className="btn btn-secondary" onClick={() => setPhase("notice")}>
                {copy["talk.again"]}
              </button>
            )}
          </div>
        </div>
      )}

      <p className="muted mt-8 border-t border-[var(--hairline)] pt-5 text-sm leading-[1.7]">
        {linkify(copy["talk.phone"], HELPLINE.display, `tel:${HELPLINE.tel}`, "link-underline font-medium text-[var(--foreground)]")}
      </p>
    </div>
  );
}
