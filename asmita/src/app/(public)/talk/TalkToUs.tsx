"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationAgent } from "sarvam-conv-ai-sdk/browser";
import { HELPLINE, VOICE_AGENT } from "@/lib/helpline";

/*
 * Browser voice call with the helpline agent. Nothing from Sarvam loads until
 * the person reads the notice and taps Continue: the SDK is imported then,
 * the session route hands back a signed URL, and only after that does the
 * browser ask for the microphone. Asmita keeps no audio or transcript.
 */

type Phase = "notice" | "connecting" | "listening" | "speaking" | "ended" | "error";

const ERRORS = {
  busy: "Voice calls are busy right now. Please try again later, or call the helpline.",
  microphone: "We could not use your microphone. Check that your browser allows it, or call the helpline.",
  unavailable: "Voice calls are not available right now. Please call the helpline instead.",
};

const STATUS: Partial<Record<Phase, string>> = {
  connecting: "Connecting",
  listening: "Listening. Speak whenever you are ready.",
  speaking: "The assistant is speaking.",
  ended: "The call has ended.",
};

function isMicrophoneError(error: unknown) {
  return (
    error instanceof DOMException &&
    ["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"].includes(error.name)
  );
}

export function TalkToUs() {
  const [phase, setPhase] = useState<Phase>("notice");
  const [error, setError] = useState<string>("");
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
    setError("");
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
            setError(ERRORS.unavailable);
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
        setError(err instanceof sdk.RateLimitError ? ERRORS.busy : isMicrophoneError(err) ? ERRORS.microphone : ERRORS.unavailable);
        setPhase("error");
      }
    } catch {
      await endCall();
      setError(ERRORS.unavailable);
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

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8" style={{ boxShadow: "var(--shadow-soft)" }}>
      {phase === "notice" && (
        <div>
          <h2 className="text-[22px] font-medium leading-tight text-[var(--foreground)]">Before you start</h2>
          <ul className="mt-5 space-y-3 text-base leading-[1.7] text-[var(--foreground)]">
            <li>You will talk to an AI assistant, not a person. It speaks Hindi, English and other Indian languages.</li>
            <li>
              Sarvam, the company that runs the assistant, records each call and keeps a short summary of it. Asmita does
              not keep a recording or a transcript.
            </li>
            <li>Do not share images, links or your full name on the call. The assistant never needs them.</li>
            <li>
              If you are under 18, please call CHILDLINE <a className="link-underline font-medium" href="tel:1098">1098</a> instead.
            </li>
            <li>
              If you are in danger right now, call <a className="link-underline font-medium" href="tel:112">112</a>.
            </li>
          </ul>
          <p className="muted mt-5 text-sm leading-[1.7]">Your browser will ask to use your microphone.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={start}>
              Continue and start the call
            </button>
          </div>
        </div>
      )}

      {phase !== "notice" && (
        <div>
          <p role="status" aria-live="polite" className="text-[20px] font-medium leading-tight text-[var(--foreground)]">
            {phase === "error" ? "" : STATUS[phase]}
          </p>
          {phase === "error" && (
            <p role="alert" className="text-base leading-[1.7] text-[var(--foreground)]">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {inCall && (
              <>
                <button type="button" className="btn btn-secondary" onClick={toggleMute} disabled={phase === "connecting"} aria-pressed={muted}>
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await endCall();
                    setPhase("ended");
                  }}
                >
                  End call
                </button>
              </>
            )}
            {(phase === "ended" || phase === "error") && (
              <button type="button" className="btn btn-secondary" onClick={() => setPhase("notice")}>
                Start again
              </button>
            )}
          </div>
        </div>
      )}

      <p className="muted mt-8 border-t border-[var(--hairline)] pt-5 text-sm leading-[1.7]">
        Prefer the phone? Call the same assistant on{" "}
        <a href={`tel:${HELPLINE.tel}`} className="link-underline font-medium text-[var(--foreground)]">
          {HELPLINE.display}
        </a>
        , any time of day.
      </p>
    </div>
  );
}
