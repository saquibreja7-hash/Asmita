"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { RoutingFieldDef, RoutingLeaf } from "@/lib/review-routing";
import { useStepUpPost, type StepUpPostResult } from "../../step-up-mfa";

/*
 * The routing rules builder (review-console-spec.md WP143). Everything it
 * shows is console configuration: field names, operators, queue names and
 * fixed code values — never a subject's data. A rule only ever chooses a
 * queue and a priority; the server re-validates the condition against the
 * kind's allowlist and the destination queue's kind on every save.
 *
 * Saving a rule needs a fresh authenticator proof (WP144 step-up MFA): the
 * shared hook answers the server's mfa_step_up_required with a code dialog
 * and retries the save once.
 */

/** What the components below post with; the step-up hook provides it. */
type Post = (path: string, body: Record<string, unknown>) => Promise<StepUpPostResult>;

export type RuleView = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "LIVE" | "DISABLED";
  sequence: number;
  version: number;
  priority: number;
  destinationQueueId: string;
  /** The raw leaves, for the edit builder. */
  leaves: RoutingLeaf[];
  /** One display line per leaf, shared with the Test panel's wording. */
  conditionTexts: string[];
  conditionJoin: "all" | "any";
  updatedBy: string;
  updatedAt: string;
  versions: Array<{ version: number; status: string; savedBy: string; savedAt: string }>;
};

export type KindRulesView = {
  kind: string;
  label: string;
  fields: readonly RoutingFieldDef[];
  rules: RuleView[];
  queues: Array<{ id: string; name: string; key: string }>;
  defaultQueueId: string;
  defaultQueueName: string;
};

const OP_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  lt: "is less than",
  lte: "is at most",
  gt: "is greater than",
  gte: "is at least",
  in: "is one of",
  is_empty: "is empty",
};

const OUTCOME_TEXT: Record<string, string> = {
  routed: "Would take this item",
  would_have_matched: "Would have matched — draft, no effect",
  invalid_destination: "Matched, but its destination queue is no longer valid",
  no_match: "No match",
  not_reached: "Would match, but an earlier rule wins",
};

const ERRORS: Record<string, string> = {
  invalid_payload: "That change was not understood. Check the fields and try again.",
  unknown_field: "That field cannot be used in a rule.",
  invalid_op: "That operator does not fit the field.",
  invalid_value: "That value does not fit the field.",
  invalid_condition: "A rule needs between one and ten conditions.",
  links_not_allowed: "Names and descriptions cannot contain an address.",
  invalid_name: "Give the rule a name.",
  invalid_description: "Keep the description shorter.",
  invalid_priority: "Priority is a whole number from -100 to 100.",
  queue_not_found: "That queue no longer exists. Reload and choose again.",
  protected_queue: "The protected queue cannot be a rule destination.",
  queue_archived: "An archived queue cannot be a rule destination.",
  queue_kind_mismatch: "A rule can only choose a queue of its own kind.",
  rule_not_found: "That rule no longer exists. Reload the page.",
  rate_limited: "Too many changes in a short time. Wait a moment, then try again.",
  csrf_failed: "Your session timed out. Reload the page and try again.",
  mfa_step_up_required: "Nothing was changed: this needs a fresh authenticator code.",
  request_failed: "Not saved. Reload the page and try again.",
};

type TestResult = {
  ruleId: string;
  name: string;
  status: string;
  conditions: Array<{ text: string; matched: boolean }>;
  matched: boolean;
  outcome: string;
  destinationQueueName: string | null;
};

type TestResponse = {
  ok?: boolean;
  error?: string;
  results?: TestResult[];
  chosenQueue?: { id: string; name: string; viaRuleId: string | null };
};

function inWords(code: string | undefined): string {
  return ERRORS[code ?? ""] ?? "Not saved. Reload the page and try again.";
}

// ---------------------------------------------------------------------------
// The structured condition builder

type Draft = {
  name: string;
  description: string;
  join: "all" | "any";
  leaves: RoutingLeaf[];
  destinationQueueId: string;
  priority: number;
};

function leafValueToString(leaf: RoutingLeaf): string {
  if (Array.isArray(leaf.value)) return leaf.value.join(", ");
  return leaf.value === null || leaf.value === undefined ? "" : String(leaf.value);
}

function draftFromRule(rule: RuleView): Draft {
  return {
    name: rule.name,
    description: rule.description ?? "",
    join: rule.conditionJoin,
    leaves: rule.leaves.map((leaf) => ({ ...leaf })),
    destinationQueueId: rule.destinationQueueId,
    priority: rule.priority,
  };
}

function emptyLeaves(fields: readonly RoutingFieldDef[]): RoutingLeaf[] {
  const first = fields[0];
  return first ? [{ field: first.key, op: first.ops[0]!, value: first.type === "number" ? 0 : first.values?.[0] ?? "" }] : [];
}

/** The value control for one leaf, typed by the field's definition. */
function LeafValueControl({
  field,
  leaf,
  onChange,
  idPrefix,
}: {
  field: RoutingFieldDef;
  leaf: RoutingLeaf;
  onChange: (value: RoutingLeaf["value"]) => void;
  idPrefix: string;
}) {
  if (leaf.op === "is_empty") {
    return <span className="muted text-xs">—</span>;
  }
  const knownValues = field.values;
  if (knownValues && knownValues.length > 0) {
    if (leaf.op === "in") {
      return (
        <fieldset className="grid gap-1">
          <legend className="sr-only">{field.label} values</legend>
          {knownValues.map((value) => (
            <label className="flex items-center gap-2 text-xs" htmlFor={`${idPrefix}-${value}`} key={value}>
              <input
                checked={Array.isArray(leaf.value) && leaf.value.includes(value)}
                id={`${idPrefix}-${value}`}
                onChange={(event) => {
                  const current = Array.isArray(leaf.value) ? [...leaf.value] : [];
                  const at = current.indexOf(value);
                  if (event.target.checked && at === -1) current.push(value);
                  if (!event.target.checked && at !== -1) current.splice(at, 1);
                  onChange(current);
                }}
                type="checkbox"
              />
              {value}
            </label>
          ))}
        </fieldset>
      );
    }
    return (
      <select
        aria-label={`${field.label} value`}
        className="field py-1 text-xs"
        onChange={(event) => onChange(event.target.value)}
        value={typeof leaf.value === "string" ? leaf.value : ""}
      >
        {knownValues.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    );
  }
  const isNumber = field.type === "number";
  return (
    <input
      aria-label={`${field.label} value`}
      className="field py-1 text-xs"
      inputMode={isNumber ? "decimal" : undefined}
      onChange={(event) => {
        if (isNumber) onChange(event.target.value === "" ? null : Number(event.target.value));
        else if (leaf.op === "in") onChange(event.target.value.split(",").map((part) => part.trim()).filter(Boolean));
        else onChange(event.target.value);
      }}
      placeholder={isNumber ? "24" : "One value, or comma-separated for is one of"}
      type={isNumber ? "number" : "text"}
      value={leafValueToString(leaf)}
    />
  );
}

function ConditionBuilder({
  draft,
  fields,
  idPrefix,
  onChange,
}: {
  draft: Draft;
  fields: readonly RoutingFieldDef[];
  idPrefix: string;
  onChange: (next: Draft) => void;
}) {
  const updateLeaf = (index: number, leaf: RoutingLeaf) => {
    const leaves = draft.leaves.map((item, at) => (at === index ? leaf : item));
    onChange({ ...draft, leaves });
  };
  return (
    <div className="grid gap-3">
      <fieldset>
        <legend className="text-xs font-semibold">Match</legend>
        <div className="mt-1 flex gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input checked={draft.join === "all"} name={`${idPrefix}-join`} onChange={() => onChange({ ...draft, join: "all" })} type="radio" />
            All conditions
          </label>
          <label className="flex items-center gap-2">
            <input checked={draft.join === "any"} name={`${idPrefix}-join`} onChange={() => onChange({ ...draft, join: "any" })} type="radio" />
            Any condition
          </label>
        </div>
      </fieldset>
      <ul className="grid gap-2">
        {draft.leaves.map((leaf, index) => {
          const field = fields.find((entry) => entry.key === leaf.field) ?? fields[0]!;
          const id = `${idPrefix}-leaf-${index}`;
          return (
            <li className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" key={`${leaf.field}-${index}`}>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1">
                  <span className="eyebrow">Field</span>
                  <select
                    className="field py-1 text-xs"
                    onChange={(event) => {
                      const next = fields.find((entry) => entry.key === event.target.value)!;
                      const ops = next.ops;
                      updateLeaf(index, { field: next.key, op: ops[0]!, value: next.type === "number" ? 0 : next.values?.[0] ?? "" });
                    }}
                    value={field.key}
                  >
                    {fields.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="eyebrow">Operator</span>
                  <select
                    className="field py-1 text-xs"
                    onChange={(event) => updateLeaf(index, { ...leaf, op: event.target.value as RoutingLeaf["op"], value: event.target.value === "is_empty" ? null : leaf.value })}
                    value={leaf.op}
                  >
                    {field.ops.map((op) => (
                      <option key={op} value={op}>
                        {OP_LABELS[op]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-1">
                  <span className="eyebrow">Value</span>
                  <LeafValueControl field={field} idPrefix={id} leaf={leaf} onChange={(value) => updateLeaf(index, { ...leaf, value })} />
                </div>
              </div>
              <button
                className="btn btn-secondary px-3 py-1 text-xs"
                disabled={draft.leaves.length <= 1}
                onClick={() => onChange({ ...draft, leaves: draft.leaves.filter((_, at) => at !== index) })}
                type="button"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <button
          className="btn btn-secondary px-3 py-1 text-xs"
          disabled={draft.leaves.length >= 10}
          onClick={() => onChange({ ...draft, leaves: [...draft.leaves, ...emptyLeaves(fields)] })}
          type="button"
        >
          Add condition
        </button>
      </div>
    </div>
  );
}

function RuleForm({
  draft,
  fields,
  queues,
  idPrefix,
  onCancel,
  onSaved,
  savePath,
  extraBody,
  post,
}: {
  draft: Draft;
  fields: readonly RoutingFieldDef[];
  queues: Array<{ id: string; name: string }>;
  idPrefix: string;
  onCancel: () => void;
  onSaved: () => void;
  savePath: string;
  extraBody?: Record<string, unknown>;
  post: Post;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: working.name.trim(),
      description: working.description.trim() || null,
      condition: { [working.join]: working.leaves },
      destinationQueueId: working.destinationQueueId,
      priority: working.priority,
      ...extraBody,
    };
    const result = await post(savePath, body);
    setBusy(false);
    if (!result.ok) {
      setError(inWords(result.error));
      return;
    }
    router.refresh();
    onSaved();
  }

  return (
    <div className="a-card p-4">
      <div className="grid gap-3">
        <label className="grid gap-1 sm:max-w-md">
          <span className="text-xs font-semibold">Name</span>
          <input className="field py-1.5 text-xs" maxLength={80} onChange={(event) => setWorking({ ...working, name: event.target.value })} type="text" value={working.name} />
        </label>
        <label className="grid gap-1 sm:max-w-md">
          <span className="text-xs font-semibold">Description (optional)</span>
          <input className="field py-1.5 text-xs" maxLength={240} onChange={(event) => setWorking({ ...working, description: event.target.value })} type="text" value={working.description} />
        </label>
        <ConditionBuilder draft={working} fields={fields} idPrefix={idPrefix} onChange={(next) => setWorking(next)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Destination queue</span>
            <select
              className="field py-1 text-xs"
              onChange={(event) => setWorking({ ...working, destinationQueueId: event.target.value })}
              value={working.destinationQueueId}
            >
              {queues.map((queue) => (
                <option key={queue.id} value={queue.id}>
                  {queue.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1 sm:max-w-[12rem]">
            {/* The hint stays out of the label so the input's accessible
                name is exactly "Priority" — screen readers announce the
                name, and the hint belongs to aria-describedby instead. */}
            <label className="grid gap-1" htmlFor={`${idPrefix}-priority`}>
              <span className="text-xs font-semibold">Priority</span>
            </label>
            <input
              aria-describedby={`${idPrefix}-priority-hint`}
              className="field py-1 text-xs"
              id={`${idPrefix}-priority`}
              max={100}
              min={-100}
              onChange={(event) => setWorking({ ...working, priority: Number(event.target.value) })}
              type="number"
              value={working.priority}
            />
            <span className="muted text-[11px]" id={`${idPrefix}-priority-hint`}>
              Higher numbers are offered first. 0 is the default.
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy || !working.name.trim() || queues.length === 0} onClick={() => void save()} type="button">
            {busy ? "Saving…" : "Save rule"}
          </button>
          <button className="btn btn-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <span className="muted text-xs">Saved as a draft. Switch it Live when it does what you want.</span>
        </div>
        {error && (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Test panel

function TestPanel({ kind, label, fields, queues }: { kind: string; label: string; fields: readonly RoutingFieldDef[]; queues: Array<{ id: string; name: string }> }) {
  const [mode, setMode] = useState<"job" | "values">("values");
  const [jobId, setJobId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<TestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResults(null);
    const body: Record<string, unknown> = mode === "job" ? { kind, jobId: jobId.trim() } : { kind, facts: handEnteredFacts(fields, values) };
    try {
      const response = await csrfFetch("/api/admin/review/rules/test", { method: "POST", body: JSON.stringify(body) });
      const data = (await response.json().catch(() => null)) as TestResponse | null;
      setBusy(false);
      if (!response.ok || !data?.ok) {
        setError(inWords(data?.error ?? "request_failed"));
        return;
      }
      setResults(data);
    } catch {
      setBusy(false);
      setError(inWords("request_failed"));
    }
  }

  return (
    <div className="a-card p-4">
      <h4>{label}: test these rules</h4>
      <p className="muted mt-1 text-xs">A dry run. Nothing moves, nothing is logged, no one is told.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2">
          <input checked={mode === "values"} name="test-mode" onChange={() => setMode("values")} type="radio" />
          Hand-entered values
        </label>
        <label className="flex items-center gap-2">
          <input checked={mode === "job"} name="test-mode" onChange={() => setMode("job")} type="radio" />
          An open job id
        </label>
      </div>
      {mode === "job" ? (
        <label className="mt-3 grid max-w-md gap-1">
          <span className="text-xs font-semibold">Open job id</span>
          <input className="field py-1.5 font-mono text-xs" onChange={(event) => setJobId(event.target.value)} placeholder="The id in the review screen's address" type="text" value={jobId} />
        </label>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <label className="grid gap-1" key={field.key}>
              <span className="text-xs font-semibold">{field.label}</span>
              {field.values && field.values.length > 0 ? (
                <select
                  className="field py-1 text-xs"
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  value={values[field.key] ?? ""}
                >
                  <option value="">{field.emptyPossible ? field.emptyLabel || "(empty)" : "(choose one)"}</option>
                  {field.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="field py-1 text-xs"
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  placeholder={field.emptyPossible ? field.emptyLabel || "(empty)" : ""}
                  type={field.type === "number" ? "number" : "text"}
                  value={values[field.key] ?? ""}
                />
              )}
            </label>
          ))}
        </div>
      )}
      <div className="mt-3">
        <button className="btn btn-primary" disabled={busy || (mode === "job" && !jobId.trim())} onClick={() => void run()} type="button">
          {busy ? "Testing…" : "Run test"}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {results?.results && (
        <div className="mt-4 grid gap-2">
          {results.results.length === 0 && <p className="muted text-sm">No rules for this kind, so every item goes to the default queue.</p>}
          {results.results.map((result) => (
            <div className="rounded-[var(--radius-box)] border border-[var(--line)] p-3 text-xs" key={result.ruleId}>
              <p className="font-medium">
                {result.name} <span className="muted">· {result.status === "LIVE" ? "Live" : result.status === "DRAFT" ? "Draft" : "Disabled"}</span>
              </p>
              <ul className="muted mt-1 grid gap-0.5">
                {result.conditions.map((condition) => (
                  <li key={condition.text}>
                    {condition.matched ? "Matches" : "Does not match"}: {condition.text}
                  </li>
                ))}
              </ul>
              <p className="mt-1 font-medium">{OUTCOME_TEXT[result.outcome] ?? result.outcome}</p>
            </div>
          ))}
          {results.chosenQueue && (
            <p className="text-sm">
              Chosen queue: <strong>{results.chosenQueue.name}</strong>
              {results.chosenQueue.viaRuleId ? "" : " — the default queue (no rule matched)"}
            </p>
          )}
          {queues.length === 0 && <span className="sr-only">No destination queues configured.</span>}
        </div>
      )}
    </div>
  );
}

/** Hand-entered test values into the facts shape the API takes. */
function handEnteredFacts(fields: readonly RoutingFieldDef[], values: Record<string, string>): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === "") continue;
    if (field.type === "number") facts[field.key] = Number(raw);
    else if (field.type === "set") facts[field.key] = raw.split(",").map((part) => part.trim()).filter(Boolean);
    else facts[field.key] = raw;
  }
  return facts;
}

// ---------------------------------------------------------------------------
// One kind's rules

function RuleCard({
  rule,
  kindView,
  first,
  last,
  onEdit,
  onMove,
  editing,
  post,
}: {
  rule: RuleView;
  kindView: KindRulesView;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  editing: boolean;
  post: Post;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function changeStatus(status: "DRAFT" | "LIVE" | "DISABLED") {
    setError(null);
    const result = await post(`/api/admin/review/rules/${rule.id}/status`, { status });
    if (!result.ok) setError(inWords(result.error));
    else router.refresh();
  }

  return (
    <li className="a-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {rule.name}
          <span className="muted ml-2 text-xs">v{rule.version}</span>
        </p>
        <label className="flex items-center gap-2 text-xs">
          <span className="eyebrow">Status</span>
          <select className="field py-1 text-xs" onChange={(event) => void changeStatus(event.target.value as "DRAFT" | "LIVE" | "DISABLED")} value={rule.status}>
            <option value="DRAFT">Draft</option>
            <option value="LIVE">Live</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </label>
      </div>
      {rule.description && <p className="muted mt-1 text-xs">{rule.description}</p>}
      <p className="mt-2 text-xs">
        If {rule.conditionJoin === "all" ? "all" : "any"}: {rule.conditionTexts.join(" · ")}{" "}
        <span aria-hidden="true">→ </span>
        {kindView.queues.find((queue) => queue.id === rule.destinationQueueId)?.name ?? "a queue that no longer exists"}, priority {rule.priority > 0 ? `+${rule.priority}` : rule.priority}
      </p>
      <p className="muted mt-1 text-[11px]">
        Updated by {rule.updatedBy} · {new Date(rule.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-secondary px-3 py-1 text-xs" disabled={editing} onClick={onEdit} type="button">
          Edit
        </button>
        <button className="btn btn-secondary px-3 py-1 text-xs" disabled={first} onClick={() => void onMove("up")} type="button">
          Move up
        </button>
        <button className="btn btn-secondary px-3 py-1 text-xs" disabled={last} onClick={() => void onMove("down")} type="button">
          Move down
        </button>
        <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setHistoryOpen((open) => !open)} type="button">
          {historyOpen ? "Hide history" : "History"}
        </button>
      </div>
      {historyOpen && (
        <ul className="mt-3 grid gap-1 text-xs">
          {rule.versions.map((version) => (
            <li className="muted" key={version.version}>
              v{version.version} · {version.status === "LIVE" ? "Live" : version.status === "DRAFT" ? "Draft" : "Disabled"} · saved by {version.savedBy} ·{" "}
              {new Date(version.savedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function KindSection({ kindView, post }: { kindView: KindRulesView; post: Post }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(ruleId: string, direction: "up" | "down") {
    setError(null);
    const result = await post(`/api/admin/review/rules/${ruleId}/move`, { direction });
    if (!result.ok) setError(inWords(result.error));
    else router.refresh();
  }

  return (
    <section aria-labelledby={`rules-${kindView.kind}`} className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`rules-${kindView.kind}`}>{kindView.label}</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setTestOpen((open) => !open)} type="button">
            {testOpen ? "Hide test" : "Test these rules"}
          </button>
          <button className="btn btn-primary px-3 py-1 text-xs" disabled={adding || kindView.fields.length === 0} onClick={() => setAdding(true)} type="button">
            Add rule
          </button>
        </div>
      </div>
      {kindView.fields.length === 0 ? (
        <p className="muted mt-2 text-sm">This kind exposes no routing fields, so it has no rules.</p>
      ) : (
        <>
          <ol className="mt-4 grid gap-3">
            {kindView.rules.map((rule, index) => (
              <RuleCard
                editing={editingId !== null}
                first={index === 0}
                key={rule.id}
                kindView={kindView}
                last={index === kindView.rules.length - 1}
                onEdit={() => setEditingId(rule.id)}
                onMove={(direction) => void move(rule.id, direction)}
                post={post}
                rule={rule}
              />
            ))}
          </ol>
          {editingId !== null && (
            <div className="mt-3">
              {kindView.rules
                .filter((rule) => rule.id === editingId)
                .map((rule) => (
                  <RuleForm
                    draft={draftFromRule(rule)}
                    extraBody={{}}
                    fields={kindView.fields}
                    idPrefix={`edit-${rule.id}`}
                    key={rule.id}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                    post={post}
                    queues={kindView.queues}
                    savePath={`/api/admin/review/rules/${rule.id}`}
                  />
                ))}
            </div>
          )}
          {adding && (
            <div className="mt-3">
              <RuleForm
                draft={{
                  name: "",
                  description: "",
                  join: "all",
                  leaves: emptyLeaves(kindView.fields),
                  destinationQueueId: kindView.defaultQueueId,
                  priority: 0,
                }}
                extraBody={{ subjectKind: kindView.kind }}
                fields={kindView.fields}
                idPrefix={`add-${kindView.kind}`}
                onCancel={() => setAdding(false)}
                onSaved={() => setAdding(false)}
                post={post}
                queues={kindView.queues}
                savePath="/api/admin/review/rules"
              />
            </div>
          )}
          {/* The default queue is pinned last and not editable (spec WP143.5). */}
          <div className="a-card muted mt-3 p-4 text-xs" id={`${kindView.kind}-default`}>
            <p className="font-medium">
              No rule matched <span aria-hidden="true">→ </span>
              {kindView.defaultQueueName}
            </p>
            <p className="mt-1">The default queue. It is pinned last, cannot be edited and always catches what the rules do not.</p>
          </div>
          {testOpen && (
            <div className="mt-3">
              <TestPanel fields={kindView.fields} kind={kindView.kind} label={kindView.label} queues={kindView.queues} />
            </div>
          )}
        </>
      )}
      {error && (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function RulesAdmin({ kinds }: { kinds: KindRulesView[] }) {
  const { post, stepUpDialog } = useStepUpPost();
  return (
    <div>
      {kinds.map((kindView) => (
        <KindSection key={kindView.kind} kindView={kindView} post={post} />
      ))}
      {stepUpDialog}
    </div>
  );
}
