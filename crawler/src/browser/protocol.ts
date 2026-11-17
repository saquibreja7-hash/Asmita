/**
 * The parent <-> browser-worker protocol (crawler v2 WP7), validated strictly
 * on both sides: an unexpected shape, field or id marks the worker as
 * misbehaving and the parent replaces it (the decoder child protocol applies
 * the same rule). Every message is small and fixed-shape; the only payload is
 * one image's bytes or one page's rendered HTML, each capped before sending.
 *
 * The worker never receives or sends a URL outside a render it was given, and
 * never receives the service key, the pool or any fingerprint: it sees page
 * content only. Parent -> worker messages are trusted a little more (the
 * parent is our own code), but are still schema-checked so a bug cannot send
 * the worker something half-formed.
 */
import { z } from "zod";

/** The child-side URL limit (a rendered page or an image address). */
export const MAX_WORKER_URL = 2048;

const httpUrl = z.string().min(1).max(MAX_WORKER_URL).refine((v) => /^https?:\/\//.test(v), "http(s) url");

// --- parent -> worker ---------------------------------------------------------

export const LaunchMessageSchema = z.strictObject({
  kind: z.literal("launch"),
  /** The in-process SOCKS proxy the browser must use for all traffic. */
  proxyPort: z.number().int().min(1).max(65535),
  /** The crawler's own User-Agent, appended to Chromium's. */
  userAgentSuffix: z.string().min(3).max(200),
});

export const RenderMessageSchema = z.strictObject({
  kind: z.literal("render"),
  id: z.number().int().min(1),
  url: httpUrl,
  /** Pages must stay on this host or its subdomains (crawl/url.ts inScope). */
  scopeHost: z.string().min(1).max(253),
  timeoutMs: z.number().int().min(1000).max(300_000),
  scrolls: z.number().int().min(0).max(20),
  scrollWaitMs: z.number().int().min(0).max(30_000),
  maxRequests: z.number().int().min(1).max(10_000),
  maxImages: z.number().int().min(1).max(10_000),
  maxImageBytes: z.number().int().min(1).max(50 * 1024 * 1024),
  maxHtmlBytes: z.number().int().min(1024).max(20 * 1024 * 1024),
});

export const VerdictMessageSchema = z.strictObject({
  kind: z.literal("verdict"),
  id: z.number().int().min(1),
  seq: z.number().int().min(1),
  allow: z.boolean(),
});

export const AbortMessageSchema = z.strictObject({
  kind: z.literal("abort"),
  id: z.number().int().min(1),
});

export const StopMessageSchema = z.strictObject({ kind: z.literal("stop") });

export type LaunchMessage = z.infer<typeof LaunchMessageSchema>;
export type RenderMessage = z.infer<typeof RenderMessageSchema>;
export type VerdictMessage = z.infer<typeof VerdictMessageSchema>;
export type AbortMessage = z.infer<typeof AbortMessageSchema>;

// --- worker -> parent ---------------------------------------------------------

/** The only ways a render can fail; the parent maps them to error codes. */
export const WORKER_FAIL_CODES = ["browser_failed", "browser_aborted"] as const;

export const ReadyMessageSchema = z.strictObject({ kind: z.literal("ready") });

/** Mid-render question: may the page request this URL? (robots.txt) */
export const CheckMessageSchema = z.strictObject({
  kind: z.literal("check"),
  id: z.number().int().min(1),
  seq: z.number().int().min(1),
  url: httpUrl,
  resourceType: z.string().min(1).max(32),
});

/** One intercepted image response, bytes taken in memory and size-capped. */
export const ImageMessageSchema = z.strictObject({
  kind: z.literal("image"),
  id: z.number().int().min(1),
  url: httpUrl,
  contentType: z.string().min(1).max(100),
  bytes: z.instanceof(Uint8Array),
});

export const RenderedMessageSchema = z.strictObject({
  kind: z.literal("rendered"),
  id: z.number().int().min(1),
  url: httpUrl,
  status: z.number().int().min(100).max(599),
  html: z.string(),
  truncated: z.boolean(),
  stats: z.strictObject({
    /** Requests the page made (before any was aborted by a cap). */
    requests: z.number().int().min(0),
    /** Image responses not handed over: over the per-page cap or too large. */
    imagesSkipped: z.number().int().min(0),
  }),
});

export const FailedMessageSchema = z.strictObject({
  kind: z.literal("failed"),
  /** 0 = the launch itself failed; otherwise the render id. */
  id: z.number().int().min(0),
  code: z.enum(WORKER_FAIL_CODES),
});

/** The worker's acknowledgement of a graceful stop, sent just before it exits. */
export const StoppedMessageSchema = z.strictObject({ kind: z.literal("stopped") });

export type ReadyMessage = z.infer<typeof ReadyMessageSchema>;
export type CheckMessage = z.infer<typeof CheckMessageSchema>;
export type ImageMessage = z.infer<typeof ImageMessageSchema>;
export type RenderedMessage = z.infer<typeof RenderedMessageSchema>;
export type FailedMessage = z.infer<typeof FailedMessageSchema>;

export type StoppedMessage = z.infer<typeof StoppedMessageSchema>;

export type WorkerMessage = ReadyMessage | CheckMessage | ImageMessage | RenderedMessage | FailedMessage | StoppedMessage;

/** Parse one worker -> parent message; null for anything unexpected. */
export function parseWorkerMessage(raw: unknown): WorkerMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = (raw as { kind?: unknown }).kind;
  switch (kind) {
    case "ready":
      return ReadyMessageSchema.safeParse(raw).success ? (raw as ReadyMessage) : null;
    case "check":
      return CheckMessageSchema.safeParse(raw).success ? (raw as CheckMessage) : null;
    case "image":
      return ImageMessageSchema.safeParse(raw).success ? (raw as ImageMessage) : null;
    case "rendered":
      return RenderedMessageSchema.safeParse(raw).success ? (raw as RenderedMessage) : null;
    case "failed":
      return FailedMessageSchema.safeParse(raw).success ? (raw as FailedMessage) : null;
    case "stopped":
      return StoppedMessageSchema.safeParse(raw).success ? (raw as StoppedMessage) : null;
    default:
      return null;
  }
}
