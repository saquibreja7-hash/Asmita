// On-device C2PA Content Credentials reader (WP38, part 1).
//
// This module runs ONLY in the browser. It reads signed C2PA Content
// Credentials (contentauth/c2pa-js, the Content Authenticity Initiative's
// maintained web library; MIT licence) with the CAI's own WebAssembly engine,
// without the image ever leaving her device:
//
// - The WASM engine and its worker script are served from OUR OWN origin
//   (public/c2pa/, copied from node_modules at install time). No third-party
//   CDN is involved, and the engine makes no other network request.
// - The image bytes are handed to a dedicated in-page worker; they are never
//   uploaded, never fetched remotely, never put in any request body.
// - The library is imported lazily on first use: nothing is downloaded until
//   she actually picks an image to check.
//
// What it reports is only what the file states about itself: the tool that
// signed it, whether the manifest says AI was used (IPTC digitalSourceType,
// e.g. trainedAlgorithmicMedia, inside the C2PA assertions), the signer, and
// whether the signature validated. It never verdicts an image; "no Content
// Credentials found" is only the absence of a credential (the page's wording
// says so), because apps and screenshots strip them.

// First-party engine files (see scripts/copy-c2pa-assets.mjs).
export const C2PA_WASM_PATH = "/c2pa/c2pa.wasm";
export const C2PA_WORKER_PATH = "/c2pa/c2pa_worker.js";

// Type-only import of the engine handle: erased at build time, so the runtime
// code below still loads nothing until the dynamic import in readC2paCredentials.
import type { C2pa } from "@contentauth/c2pa-web";

/** IPTC digital source types that mean "made with generative AI". */
const AI_SOURCE_TYPES = [
  "trainedalgorithmicmedia",
  "compositewithtrainedalgorithmicmedia",
  "trainedalgorithmicdata",
  "algorithmicmedia",
];

export type C2paStatus = "found" | "none" | "unavailable";

export type C2paSummary = {
  status: C2paStatus;
  /** The claim generator, e.g. "Adobe Firefly" or "make_test_images/0.12.0". */
  tool?: string;
  /** The manifest says the image was made or edited with an AI tool. */
  aiUsed?: boolean;
  /** The digital source type the manifest states (any kind, AI or not). */
  digitalSourceType?: string;
  /** The signer named in the signature (common name, else issuer). */
  signer?: string;
  /** Whether the signature validated cryptographically (Valid or Trusted). */
  signatureValidated?: boolean;
  /** The first validation failure code, e.g. "signingCredential.untrusted". */
  validationNote?: string;
  /** Raw values kept for the "technical details" disclosure. */
  raw: Record<string, string>;
};

function looksAiSourceType(value: string): boolean {
  const v = value.toLowerCase();
  return AI_SOURCE_TYPES.some((t) => v.includes(t));
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type AssertionShape = { label?: unknown; data?: unknown };
type ActionShape = { digitalSourceType?: unknown; action?: unknown };
type IngredientShape = { digital_source_type?: unknown };

/** Collects every digital source type the manifest states, from the assertions (c2pa.actions.v2
 * carries digitalSourceType on each action, and the claim's own field), from any
 * assertion data, and from ingredients. */
function collectDigitalSourceTypes(manifest: {
  assertions?: unknown;
  ingredients?: unknown;
}): string[] {
  const found: string[] = [];
  const push = (value: unknown) => {
    const s = str(value);
    if (s && !found.includes(s)) found.push(s);
  };

  const assertions = Array.isArray(manifest.assertions) ? (manifest.assertions as AssertionShape[]) : [];
  for (const assertion of assertions) {
    const data = assertion?.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") continue;
    push(data.digitalSourceType);
    if (Array.isArray(data.actions)) {
      for (const action of data.actions as ActionShape[]) push(action?.digitalSourceType);
    }
  }
  const ingredients = Array.isArray(manifest.ingredients) ? (manifest.ingredients as IngredientShape[]) : [];
  for (const ingredient of ingredients) push(ingredient?.digital_source_type);
  return found;
}

function activeManifestOf(store: Record<string, unknown>): Record<string, unknown> | undefined {
  const manifests = store.manifests as Record<string, Record<string, unknown>> | undefined;
  if (!manifests || typeof manifests !== "object") return undefined;
  const label = str(store.active_manifest);
  if (label && manifests[label]) return manifests[label];
  const first = Object.values(manifests)[0];
  return first && typeof first === "object" ? first : undefined;
}

/**
 * Maps a c2pa-rs ManifestStore (the exact structure Reader.manifestStore()
 * returns; see @contentauth/c2pa-types) to the plain facts the page shows.
 * Pure and defensive: any unexpected shape yields "none", never a throw.
 */
export function summarizeManifestStore(store: unknown): C2paSummary {
  const result: C2paSummary = { status: "none", raw: {} };
  if (!store || typeof store !== "object") return result;
  const record = store as Record<string, unknown>;

  const manifest = activeManifestOf(record);
  if (!manifest) return result;
  result.status = "found";

  // Tool: the claim generator string, else the named claim generator info.
  const claimGenerator = str(manifest.claim_generator);
  if (claimGenerator) result.tool = claimGenerator;
  else if (Array.isArray(manifest.claim_generator_info)) {
    const info = (manifest.claim_generator_info as Record<string, unknown>[])[0];
    const name = str(info?.name);
    if (name) result.tool = name;
  }

  // Digital source type: any stated value; AI types also set aiUsed.
  const types = collectDigitalSourceTypes(manifest);
  if (types.length > 0) {
    result.digitalSourceType = types[0];
    result.aiUsed = types.some(looksAiSourceType);
    result.raw.digitalSourceTypes = types.join(", ");
  }

  // Signer: the signature's common name, else its issuer.
  const signatureInfo = manifest.signature_info as Record<string, unknown> | undefined;
  if (signatureInfo && typeof signatureInfo === "object") {
    result.signer = str(signatureInfo.common_name) ?? str(signatureInfo.issuer);
  }

  // Whether the signature validated: Valid and Trusted both mean the
  // signature checked out (Trusted additionally reached a known trust list).
  const validationState = str(record.validation_state);
  if (validationState) {
    result.signatureValidated = validationState === "Valid" || validationState === "Trusted";
    result.raw.validationState = validationState;
  }

  // Validation notes: failure codes first (e.g. signingCredential.untrusted),
  // else informational codes. Only fixed codes, never free text, are shown.
  const codes: string[] = [];
  const collect = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list as Record<string, unknown>[]) {
      const code = str(entry?.code);
      if (code && !codes.includes(code)) codes.push(code);
    }
  };
  const validationResults = record.validation_results as Record<string, unknown> | undefined;
  const activeResults = validationResults?.activeManifest as Record<string, unknown> | undefined;
  collect(activeResults?.failure);
  collect(record.validation_status);
  collect(activeResults?.informational);
  collect(activeResults?.success);
  if (validationState) result.raw.validationCodes = codes.join(", ");
  const failure = Array.isArray(activeResults?.failure) ? (activeResults?.failure as Record<string, unknown>[]) : [];
  if (failure.length > 0) result.validationNote = str(failure[0]?.code);

  return result;
}

const EMPTY_SUMMARY: C2paSummary = { status: "none", raw: {} };

type Location = { origin: string; protocol: string };

function browserLocation(): Location | undefined {
  const loc = (globalThis as { location?: Location }).location;
  return loc && loc.origin ? loc : undefined;
}

/**
 * The engine configuration, from our own origin only. In production (https)
 * the engine's worker is loaded from our own /c2pa/c2pa_worker.js, as the
 * strict page CSP requires; over plain http (local development) the library
 * builds the same worker from an inline blob: URL instead (its workerSrc
 * validation refuses non-https URLs), which the /check-image CSP also allows.
 */
export function engineConfig(): { wasmSrc: string; workerSrc?: URL } {
  const location = browserLocation();
  const origin = location?.origin ?? "https://meriasmita.org";
  const config: { wasmSrc: string; workerSrc?: URL } = {
    wasmSrc: new URL(C2PA_WASM_PATH, origin).toString(),
  };
  if (location?.protocol === "https:") {
    config.workerSrc = new URL(C2PA_WORKER_PATH, origin);
  }
  return config;
}

/**
 * Reads the signed Content Credentials of an image file, on this device only.
 * The c2pa-web library is imported lazily on the first call; the engine (WASM
 * + worker) is fetched once from our own origin and reused.
 *
 * Any failure — including an environment without Web Workers, or an engine
 * that does not answer — resolves to status "unavailable"; it never throws
 * and never blocks the metadata (exifr) signal.
 */
export async function readC2paCredentials(file: File, timeoutMs = 30_000): Promise<C2paSummary> {
  try {
    const { createC2pa, Reader } = await import("@contentauth/c2pa-web");
    const c2pa = await withTimeout(getC2pa(createC2pa), timeoutMs);
    const reader = await withTimeout(Reader.fromBlob(c2pa, file.type || undefined, file), timeoutMs);
    if (!reader) return { ...EMPTY_SUMMARY };
    try {
      const store = await withTimeout(reader.manifestStore(), timeoutMs);
      return summarizeManifestStore(store);
    } finally {
      await reader.free().catch(() => {});
    }
  } catch {
    return { status: "unavailable", raw: {} };
  }
}

// One engine per page: the worker and the compiled WASM are reused across
// every image she checks. A failed load is retried on the next pick.
let enginePromise: Promise<C2pa> | null = null;

async function getC2pa(createC2pa: (config: { wasmSrc: string; workerSrc?: URL }) => Promise<C2pa>): Promise<C2pa> {
  if (!enginePromise) {
    enginePromise = createC2pa(engineConfig());
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

/** Bounded wait: a hung engine can never hang her check. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("c2pa_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
