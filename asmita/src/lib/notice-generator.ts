import { sha256 } from "@/lib/hash";

export type NoticeDraftInput = {
  referenceNumber: string;
  platformName: string;
  domain: string;
  submittedAt: string;
};

export type NoticeTemplateInput = Record<
  string,
  string | number | boolean | null | undefined
>;

const forbiddenNoticeVariables = new Set([
  "phone",
  "aadhaar",
  "aadhaarNumber",
  "victimPhone",
]);

const MAX_TEMPLATE_LENGTH = 20_000;
const MAX_VARIABLE_LENGTH = 2_000;
const MAX_RENDERED_LENGTH = 40_000;

// Strips ASCII control characters that would break SMTP headers, PDF
// rendering, or terminal output. Allows tab, LF, and CR.
const FORBIDDEN_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// Old notices describe a portal that is no longer available. They must be
// reviewed and signed again; silently rewriting an approved notice is unsafe.
export function hasRetiredPortalInstructions(template: string) {
  return /secure content locator|one[ -]time secure portal|secure portal link/i.test(template);
}

export function renderNoticeTemplate(
  template: string,
  variables: NoticeTemplateInput
) {
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new Error("notice_template_too_long");
  }

  const missing = new Set<string>();
  const rendered = template.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_match, key: string) => {
      if (forbiddenNoticeVariables.has(key)) {
        throw new Error(`forbidden_notice_variable:${key}`);
      }
      const value = variables[key];
      if (value === null || value === undefined || value === "") {
        missing.add(key);
        return "";
      }
      const asString = String(value);
      if (asString.length > MAX_VARIABLE_LENGTH) {
        throw new Error(`notice_variable_too_long:${key}`);
      }
      if (FORBIDDEN_CONTROL_CHARS.test(asString)) {
        throw new Error(`notice_variable_control_chars:${key}`);
      }
      return asString;
    }
  );

  if (missing.size > 0) {
    throw new Error(
      `missing_notice_variables:${Array.from(missing).sort().join(",")}`
    );
  }

  if (rendered.length > MAX_RENDERED_LENGTH) {
    throw new Error("notice_rendered_too_long");
  }

  return rendered;
}

export function assertNoticeBodySafe(body: string) {
  const forbiddenPatterns = [/\baadhaar\b/i, /\bphone\b/i, /\bmobile\b/i];
  if (forbiddenPatterns.some((pattern) => pattern.test(body))) {
    throw new Error("forbidden_pii_in_notice_body");
  }
  if (FORBIDDEN_CONTROL_CHARS.test(body)) {
    throw new Error("forbidden_control_chars_in_notice_body");
  }
}

/**
 * Subjects are sent in SMTP headers. CR or LF in a subject would let an
 * attacker inject additional headers (BCC, X-Custom, etc.). Reject any
 * subject containing newline characters or other control bytes.
 */
export function assertNoticeSubjectSafe(subject: string) {
  if (subject.length === 0 || subject.length > 998) {
    throw new Error("notice_subject_length");
  }
  if (/[\r\n]/.test(subject) || FORBIDDEN_CONTROL_CHARS.test(subject)) {
    throw new Error("notice_subject_control_chars");
  }
}

export function generateNoticeDraft(input: NoticeDraftInput) {
  const subject = `NCII takedown request ${input.referenceNumber}`;
  const body = [
    `Case reference: ${input.referenceNumber}`,
    `Platform: ${input.platformName}`,
    `Domain: ${input.domain}`,
    `Submitted at: ${input.submittedAt}`,
    "",
    "The complainant reports non-consensual intimate content. Please route to the verified grievance process and act under applicable law.",
  ].join("\n");

  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(body);

  return {
    subject,
    body,
    payloadHash: sha256(body),
    reviewedByLegal: false,
  };
}

export function verifyNoticePayload(body: string, expectedHash: string) {
  return sha256(body) === expectedHash;
}

/**
 * A video fingerprint in the annex (video-fingerprints spec WP19): one entry
 * "Video fingerprint (vPDQ, N frames)" followed by its frame hashes.
 */
export type HashAnnexVideo = {
  /** Kept frame count of the whole video, as the submission row stores it. */
  frameCount: number;
  /** Frame hashes (64-hex) in sampling order; the annex lists at most MAX_ANNEX_VIDEO_FRAMES of them. */
  frames: string[];
};

export type HashAnnexInput = {
  algorithm: "PDQ";
  hashes: Array<{ value: string; quality: number }>;
  /** Video fingerprints: one annex entry each, after the image hashes. */
  videos?: HashAnnexVideo[];
  clientVersion?: string | null;
};

/** Frame hashes listed per video; a longer list is evenly spaced down to this (spec WP19: "at most 200"). */
export const MAX_ANNEX_VIDEO_FRAMES = 200;

const HASH_HEX_PATTERN = /^[0-9a-f]{64}$/i;

function frameWord(count: number) {
  return `${count} frame${count === 1 ? "" : "s"}`;
}

/** At most `max` items, evenly spaced across the list, first and last kept. */
function evenlySpaced<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

/**
 * Renders the perceptual-hash annex appended to hash advisories and to URL
 * notices on cases with approved hashes. Contains only hashes and matching
 * guidance - never victim PII, never media. Callers must only pass
 * APPROVED hash submissions.
 *
 * A video fingerprint (vPDQ) is one entry - "Video fingerprint (vPDQ, N
 * frames)" - followed by at most MAX_ANNEX_VIDEO_FRAMES evenly spaced frame
 * hashes and one plain sentence on how vPDQ is matched (spec WP19). The
 * wording is platform-facing legal text for counsel to read; it is written
 * plainly and never marked reviewed here.
 */
export function buildHashAnnex(input: HashAnnexInput) {
  const videos = input.videos ?? [];
  if (input.hashes.length === 0 && videos.length === 0) {
    throw new Error("hash_annex_empty");
  }
  const lines = input.hashes.map((entry, index) => {
    if (!HASH_HEX_PATTERN.test(entry.value)) {
      throw new Error("hash_annex_invalid_hash");
    }
    return `  ${index + 1}. ${entry.value.toLowerCase()} (quality: ${entry.quality}/100)`;
  });
  // Every frame hash gets the same validation as an image hash: the annex
  // carries 64-hex values and nothing else.
  const videoEntries = videos.map((video) => {
    const listed = evenlySpaced(
      video.frames.map((frame) => {
        if (!HASH_HEX_PATTERN.test(frame)) {
          throw new Error("hash_annex_invalid_hash");
        }
        return frame.toLowerCase();
      }),
      MAX_ANNEX_VIDEO_FRAMES,
    );
    const entry = [`Video fingerprint (vPDQ, ${frameWord(video.frameCount)})`];
    if (listed.length > 0) {
      entry.push(
        listed.length < video.frames.length
          ? `     Frame hashes (PDQ, one frame per second; ${listed.length} of ${video.frames.length} listed, evenly spaced):`
          : listed.length < video.frameCount
            ? `     Frame hashes (PDQ, one frame per second; ${listed.length} of ${video.frameCount} listed):`
            : `     Frame hashes (PDQ, one frame per second):`,
      );
      for (const frame of listed) entry.push(`       ${frame}`);
    }
    return entry;
  });
  const videoSection = videos.length === 0 ? [] : [
    "Video fingerprints (vPDQ): each video below was fingerprinted by taking",
    "the PDQ hash of one frame per second of playback; a copy of the video",
    "matches when its frames are within a small Hamming distance of the",
    "frame hashes listed for it.",
    "",
    ...videoEntries.flatMap((entry, i) => [`  ${input.hashes.length + i + 1}. ${entry[0]}`, ...entry.slice(1), ""]),
  ];
  const algorithmLine =
    videos.length === 0
      ? `Algorithm: ${input.algorithm} (Meta ThreatExchange open-source perceptual hash)`
      : input.hashes.length === 0
        ? "Algorithm: vPDQ (Meta ThreatExchange open-source perceptual hash for video)"
        : "Algorithm: PDQ for images and vPDQ for videos (Meta ThreatExchange open-source perceptual hashes)";
  const annex = [
    "--- PERCEPTUAL HASH ANNEX ---",
    "",
    algorithmLine,
    input.clientVersion ? `Generator version: ${input.clientVersion}` : null,
    "",
    "The following perceptual hashes identify the reported non-consensual",
    "intimate content. The hashes were generated on the complainant's own",
    "device; the underlying media was never transmitted to or stored by us.",
    "",
    ...(input.hashes.length > 0 ? [`Hash values (${input.algorithm}, 256-bit hex):`, ...lines, ""] : []),
    ...videoSection,
    "Matching guidance: compare against uploaded media using PDQ with a",
    "Hamming distance threshold of 31 or lower for a recommended match.",
    "We request that matching content be blocked from upload and removed",
    "where already published, per intermediary due-diligence obligations.",
    "",
    "--- END HASH ANNEX ---",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  assertNoticeBodySafe(annex);
  return annex;
}
