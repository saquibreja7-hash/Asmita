import { buildLadder, GRIEVANCE_RESOLUTION_DAYS, type LadderStep } from "@/lib/escalation-ladder";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { CopyDraft } from "./CopyDraft";

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));

const when = (date: Date) =>
  date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const day = (date: Date) => date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

const DOT: Record<LadderStep["state"], string> = {
  done: "border-[var(--brand)] bg-[var(--brand)]",
  current: "border-[var(--brand)] bg-[var(--card)] ring-4 ring-[var(--brand-soft)]",
  upcoming: "border-[var(--line)] bg-[var(--card)]",
};

// The ladder under one link: what has happened, what comes next and when, and
// the survivor's own steps once they open. Both routes come from the MeitY NCII
// SOP: report on cybercrime.gov.in, and with no response from the grievance
// officer in time (or a refusal) appeal to the GAC under Rule 3A at gac.gov.in.
// Plan: docs/product/escalation-ladder.md
export function EscalationLadder({
  locale,
  platform,
  route,
  startedAt,
  status,
  responseType,
  responseAt,
  reference,
  draftsEnabled,
  now = new Date(),
}: {
  locale: Locale;
  platform: string;
  route: "EMAIL" | "FORM";
  startedAt: string;
  status: string;
  responseType?: string | null;
  responseAt?: string | null;
  reference: string;
  /** Prepared wording is legal text: shown only after a human legal review. */
  draftsEnabled: boolean;
  now?: Date;
}) {
  const ladder = buildLadder({
    startedAt: new Date(startedAt),
    status,
    responseType,
    responseAt: responseAt ? new Date(responseAt) : null,
    now,
  });
  if (!ladder || ladder.finished) return null;

  const say = (key: MessageKey, vars: Record<string, string | number> = {}) => fill(t(locale, key), { platform, ...vars });
  const reported = day(new Date(startedAt));
  const label: Record<LadderStep["key"], string> = {
    sent: say(route === "FORM" ? "ladder.sent.form" : "ladder.sent.email"),
    deadline: say(ladder.rejected ? "ladder.deadline.rejected" : "ladder.deadline"),
    complaint: say("ladder.complaint"),
    appeal: say("ladder.appeal"),
  };
  const draft = (key: MessageKey, outcome = "") =>
    say(key, { date: reported, ref: reference, link: t(locale, "ladder.draft.pasteLink"), outcome });

  return (
    <div className="mt-4 w-full border-t border-[var(--line)] pt-4">
      <p className="eyebrow">{say("ladder.title")}</p>
      <ol className="mt-3 space-y-2.5">
        {ladder.steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3 text-sm">
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${DOT[step.state]}`} />
            <span className="min-w-0 flex-1">
              <span className={step.state === "upcoming" ? "text-[var(--text-muted)]" : "font-medium text-[var(--ink)]"}>
                {label[step.key]}
              </span>
              {step.at && (
                <span className="muted block text-xs">
                  {step.key === "complaint" || step.key === "appeal"
                    ? step.state === "upcoming" ? say("ladder.opens", { date: when(step.at) }) : say("ladder.openNow")
                    : step.key === "deadline" && ladder.rejected ? null : when(step.at)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {ladder.complaintOpen && (
        <details className="group mt-4 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] px-4 py-3" open>
          <summary className="cursor-pointer list-none text-sm font-medium text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            {say("ladder.complaint.title")}
          </summary>
          <div className="mt-3 space-y-3 text-sm leading-[1.7]">
            <p className="muted">{say("ladder.complaint.why")}</p>
            <ReadyList items={[say("ladder.ready.link"), say("ladder.ready.date", { date: reported }), say("ladder.ready.reference", { ref: reference }), say("ladder.ready.reply")]} heading={say("ladder.ready")} />
            <p className="muted">{say("ladder.complaint.helpline")}</p>
            {draftsEnabled && <CopyDraft label={say("ladder.draft.label")} copy={say("ladder.draft.copy")} copied={say("ladder.draft.copied")} text={draft("ladder.draft.complaint")} />}
            <a className="btn btn-secondary btn-arrow !m-0" href="https://cybercrime.gov.in/" target="_blank" rel="noopener noreferrer">
              {say("ladder.complaint.cta")}
            </a>
          </div>
        </details>
      )}

      {ladder.appealOpen && (
        <details className="group mt-3 rounded-[var(--radius-box)] border border-[var(--brand)] bg-[var(--page)] px-4 py-3" open>
          <summary className="cursor-pointer list-none text-sm font-medium text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            {say("ladder.appeal")}
          </summary>
          <div className="mt-3 space-y-3 text-sm leading-[1.7]">
            <p className="muted">{say(ladder.rejected ? "ladder.appeal.why.rejected" : "ladder.appeal.why.late", { days: GRIEVANCE_RESOLUTION_DAYS })}</p>
            <ReadyList items={[say("ladder.ready.date", { date: reported }), say("ladder.ready.reply"), say("ladder.ready.reference", { ref: reference }), say("ladder.ready.mobile")]} heading={say("ladder.ready")} />
            <p className="font-medium text-[var(--ink)]">{say("ladder.appeal.soon")}</p>
            {draftsEnabled && (
              <CopyDraft
                label={say("ladder.draft.label")}
                copy={say("ladder.draft.copy")}
                copied={say("ladder.draft.copied")}
                text={draft("ladder.draft.appeal", say(ladder.rejected ? "ladder.draft.outcome.rejected" : "ladder.draft.outcome.late"))}
              />
            )}
            <a className="btn btn-primary btn-arrow !m-0" href="https://gac.gov.in/" target="_blank" rel="noopener noreferrer">
              {say("ladder.appeal.cta")}
            </a>
          </div>
        </details>
      )}
    </div>
  );
}

function ReadyList({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-[var(--ink)]">{heading}</p>
      <ul className="muted mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
