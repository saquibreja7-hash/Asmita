"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import {
  quizImageUrl,
  quizManifestSchema,
  SPOT_THE_FAKE_MANIFEST_URL,
  type QuizAnswer,
  type QuizRound,
} from "@/lib/lab/spot-the-fake/quiz";

type Phase = "loading" | "ready" | "playing" | "done" | "error";

/**
 * WP95 (docs/lab/beta-spec.md): the "Spot the fake" quiz itself. Everything
 * happens in this browser tab: the rounds come from the static manifest
 * public/lab/spot-the-fake/quiz.json (validated with the same schema the
 * unit test uses before anything from it renders), the answers never leave
 * the component, and "Play again" is the only place state ever goes.
 *
 * Accessibility follows the site's A5 pattern (MessageCheckForm): the
 * reveal is announced through a screen-reader-only role="status" line and
 * focus moves to the reveal heading, the round heading on Next, and the
 * score heading at the end — a keyboard player is never dropped on the
 * body. Answer buttons are two equal choices, so both are btn-secondary;
 * the one primary button per view is the single forward action (Start,
 * Next, See your score, Play again).
 */
export function SpotTheFakeQuiz({ locale }: { locale: Locale }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rounds, setRounds] = useState<QuizRound[]>([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<QuizAnswer | null>(null);
  const [correct, setCorrect] = useState(0);

  const roundHeadingRef = useRef<HTMLHeadingElement>(null);
  const revealHeadingRef = useRef<HTMLHeadingElement>(null);
  const scoreHeadingRef = useRef<HTMLHeadingElement>(null);

  // Load the rounds once. The manifest is a static file; anything that does
  // not validate is treated as a load failure, never rendered.
  useEffect(() => {
    let cancelled = false;
    fetch(SPOT_THE_FAKE_MANIFEST_URL)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("manifest unavailable"))))
      .then((payload: unknown) => {
        const parsed = quizManifestSchema.safeParse(payload);
        if (!parsed.success) throw new Error("manifest invalid");
        if (!cancelled) {
          setRounds(parsed.data.rounds);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus follows the flow: the reveal after an answer, the next round's
  // heading after Next, the score heading at the end.
  useEffect(() => {
    if (phase === "done") scoreHeadingRef.current?.focus();
    else if (phase === "playing" && answered !== null) revealHeadingRef.current?.focus();
    else if (phase === "playing") roundHeadingRef.current?.focus();
  }, [phase, answered, index]);

  const round = rounds[index];
  const last = index === rounds.length - 1;
  const answerWord = (value: QuizAnswer) => t(locale, value === "real" ? "lab.spot-the-fake.quiz.answer.real" : "lab.spot-the-fake.quiz.answer.ai");
  const answerLine = (value: QuizAnswer) =>
    t(locale, "lab.spot-the-fake.quiz.reveal.answer").replace("{answer}", answerWord(value));

  function respond(value: QuizAnswer) {
    if (!round || answered !== null) return;
    setAnswered(value);
    if (round.answer === value) setCorrect((count) => count + 1);
  }

  function next() {
    if (answered === null) return;
    if (last) {
      setPhase("done");
      return;
    }
    setAnswered(null);
    setIndex((current) => current + 1);
  }

  function restart() {
    setIndex(0);
    setAnswered(null);
    setCorrect(0);
    setPhase("playing");
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6 text-center">
          <p className="muted text-sm">{t(locale, "lab.spot-the-fake.quiz.loading")}</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" role="alert">
          <p className="muted text-sm leading-[1.75]">{t(locale, "lab.spot-the-fake.quiz.error")}</p>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6 text-center">
          <p className="text-sm leading-[1.7] text-[var(--text)]">{t(locale, "lab.spot-the-fake.quiz.choose")}</p>
          <button type="button" className="btn btn-primary mt-5" onClick={() => setPhase("playing")}>
            {t(locale, "lab.spot-the-fake.quiz.start")}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" role="status">
          <h2
            ref={scoreHeadingRef}
            tabIndex={-1}
            className="font-display text-[22px] font-normal leading-[1.3] tracking-tight text-[var(--ink)] outline-none"
          >
            {t(locale, "lab.spot-the-fake.quiz.score.title")}
          </h2>
          <p className="mt-3 text-3xl font-medium tabular-nums text-[var(--ink)]">
            {t(locale, "lab.spot-the-fake.quiz.score.line").replace("{n}", String(correct)).replace("{total}", String(rounds.length))}
          </p>
          <p className="muted mt-4 text-sm leading-[1.75]">{t(locale, "lab.spot-the-fake.quiz.score.body")}</p>
          <button type="button" className="btn btn-primary mt-6" onClick={restart}>
            {t(locale, "lab.spot-the-fake.quiz.again")}
          </button>
        </div>
      </div>
    );
  }

  // phase === "playing"
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
        <p className="text-xs font-medium uppercase tracking-[-0.033em] text-[var(--text-muted)]">
          {t(locale, "lab.spot-the-fake.quiz.round").replace("{n}", String(index + 1)).replace("{total}", String(rounds.length))}
        </p>
        <h2
          ref={roundHeadingRef}
          tabIndex={-1}
          className="font-display text-[20px] font-normal leading-[1.3] tracking-tight text-[var(--ink)] outline-none"
        >
          {t(locale, "lab.spot-the-fake.quiz.choose")}
        </h2>

        {/* The picture being judged. A small static WebP: next/image adds
            nothing here. The alt text names the scene, never the answer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={quizImageUrl(round.file)}
          alt={round.scene[locale]}
          width={960}
          height={600}
          className="mt-4 w-full rounded-[var(--radius-box)] border border-[var(--line)]"
          decoding="async"
        />

        {answered === null ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn btn-secondary flex-1" onClick={() => respond("real")}>
              {answerWord("real")}
            </button>
            <button type="button" className="btn btn-secondary flex-1" onClick={() => respond("ai")}>
              {answerWord("ai")}
            </button>
          </div>
        ) : (
          <div className="mt-5 border-t border-[var(--line)] pt-5">
            {/* Announced to screen readers; the visible reveal below carries
                the same content and takes focus. */}
            <p className="sr-only" role="status">
              {`${t(locale, round.answer === answered ? "lab.spot-the-fake.quiz.reveal.correct" : "lab.spot-the-fake.quiz.reveal.incorrect")} ${answerLine(round.answer)}`}
            </p>
            <h3
              ref={revealHeadingRef}
              tabIndex={-1}
              className="font-display text-[18px] font-normal leading-[1.3] tracking-tight text-[var(--ink)] outline-none"
            >
              {t(locale, round.answer === answered ? "lab.spot-the-fake.quiz.reveal.correct" : "lab.spot-the-fake.quiz.reveal.incorrect")}
            </h3>
            <p className="mt-2 text-sm leading-[1.75] text-[var(--text)]">{answerLine(round.answer)}</p>
            <p className="mt-3 text-sm font-medium text-[var(--ink)]">
              {t(locale, round.answer === "ai" ? "lab.spot-the-fake.quiz.reveal.tell.ai" : "lab.spot-the-fake.quiz.reveal.tell.real")}
            </p>
            <p className="mt-1 text-sm leading-[1.75] text-[var(--text)]">{round.tell[locale]}</p>
            <button type="button" className="btn btn-primary mt-5" onClick={next}>
              {t(locale, last ? "lab.spot-the-fake.quiz.finish" : "lab.spot-the-fake.quiz.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
