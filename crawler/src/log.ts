/**
 * Structured JSON logging that can only carry counts, durations, ids and
 * error codes.
 *
 * The crawler visits pages that may host intimate images of survivors, so a
 * log line must never contain a URL, a crawled hostname, a fingerprint or any
 * body. Rather than trusting every call site, the logger enforces it:
 *   - field names come from a fixed allowlist (anything else is dropped);
 *   - numbers and booleans pass through;
 *   - strings must look like an identifier or code: no dots, slashes, colons
 *     after a scheme, spaces, and no run of 16+ hex digits. Anything else is
 *     replaced with "[redacted]".
 * tests/integration/crawl.test.ts scans the whole log of a fixture run for
 * URL-like and 64-hex strings.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_FIELDS = [
  "runId",
  "sourceId",
  "phase",
  "code",
  "reason",
  "status",
  "count",
  "durationMs",
  "depth",
  "attempt",
  "exitCode",
  "poolVersionChanged",
  "poolSize",
  "dropped",
  "pages",
  "images",
  "matches",
  "posted",
  "created",
  "duplicate",
  "rejected",
  "failed",
  "budgetPages",
  "budgetImages",
  "elapsedMs",
  "summary",
] as const;

export type LogField = (typeof LOG_FIELDS)[number];
type Scalar = string | number | boolean;
type Value = Scalar | Record<string, Scalar | Record<string, number>>;
export type LogFields = Partial<Record<LogField, Value>>;

const ALLOWED = new Set<string>(LOG_FIELDS);
const SAFE_STRING = /^[A-Za-z0-9_-]{1,80}$/;
const HEX_RUN = /[0-9a-fA-F]{16,}/;

export function sanitizeLogString(value: string): string {
  if (!SAFE_STRING.test(value) || HEX_RUN.test(value)) return "[redacted]";
  return value;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeLogString(value);
  if (value && typeof value === "object" && depth < 3 && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Nested keys are counters such as error codes or skip reasons.
      const key = sanitizeLogString(k);
      if (key === "[redacted]") continue;
      out[key] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return null;
}

export type LogSink = (line: string) => void;

export class Logger {
  private readonly sink: LogSink;
  private readonly base: LogFields;
  private readonly level: LogLevel;
  private readonly minLevel: number;

  constructor(opts: { sink?: LogSink; base?: LogFields; level?: LogLevel } = {}) {
    this.sink = opts.sink ?? ((line) => process.stdout.write(line + "\n"));
    this.base = opts.base ?? {};
    this.level = opts.level ?? "info";
    this.minLevel = LEVELS[this.level];
  }

  child(base: LogFields): Logger {
    return new Logger({ sink: this.sink, base: { ...this.base, ...base }, level: this.level });
  }

  debug(event: string, fields?: LogFields): void {
    this.write("debug", event, fields);
  }
  info(event: string, fields?: LogFields): void {
    this.write("info", event, fields);
  }
  warn(event: string, fields?: LogFields): void {
    this.write("warn", event, fields);
  }
  error(event: string, fields?: LogFields): void {
    this.write("error", event, fields);
  }

  private write(level: LogLevel, event: string, fields: LogFields = {}): void {
    if (LEVELS[level] < this.minLevel) return;
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      event: sanitizeLogString(event),
    };
    for (const [k, v] of Object.entries({ ...this.base, ...fields })) {
      if (!ALLOWED.has(k) || v === undefined) continue;
      record[k] = sanitizeValue(v, 0);
    }
    this.sink(JSON.stringify(record));
  }
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
