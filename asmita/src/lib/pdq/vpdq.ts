/**
 * vPDQ video fingerprinting (Meta ThreatExchange method), built on our PDQ.
 *
 * A video is fingerprinted by sampling one frame per second of playback,
 * computing the existing PDQ hash of each frame and keeping a deduplicated
 * list of frame hashes (spec: docs/product/video-fingerprints-spec.md,
 * "The method"; ADR 007).
 *
 * The video never leaves the survivor's device. The browser sampler decodes
 * frames into a canvas in the page, hands each drawn frame to the hashing
 * Web Worker as an ImageBitmap and throws it away (WP42 P2); only the
 * 64-hex PDQ hash, its quality and the whole-second timestamp of each kept
 * frame are ever returned, stored or sent. No frame pixels, data URL or
 * media bytes exist anywhere in this module's output.
 *
 * Sampling decisions, dedup and capping are pure functions (unit-tested
 * without a browser); the sampler itself needs the DOM and is only used from
 * the survivor's own browser.
 */

import { computePdqHash, hammingDistance } from "./pdq";
import { hashBitmapInWorker, hashWorkerSupported, HashWorkerError } from "./hash-client";

/** Bumped when the sampling, dedup or capping behaviour changes. */
export const VPDQ_CLIENT_VERSION = "vpdq-ts-0.1.0";

/** "The method": videos up to 60 minutes. */
export const VPDQ_MAX_DURATION_SEC = 3600;
/** "The method": at most 1,000 kept frames per video. */
export const VPDQ_MAX_FRAMES = 1000;
/** Frames with PDQ quality below this are dropped. */
export const VPDQ_MIN_FRAME_QUALITY = 50;
/** A frame within this Hamming distance of the previous kept frame is dropped. */
export const VPDQ_DEDUP_DISTANCE = 10;

export type VideoFrameHash = {
  /** 64 lowercase hex chars, the PDQ hash of the frame. */
  hash: string;
  /** PDQ quality 0..100 of that frame. */
  quality: number;
  /** Whole seconds into the video (0..3599). */
  t: number;
};

export type VideoFingerprint = {
  frames: VideoFrameHash[];
  /** Whole seconds, 1..3600, as the WP17 video item requires. */
  durationSec: number;
};

/** One item of a WP17 video submission: hashes and timestamps only. */
export type VideoHashItem = {
  kind: "video";
  frames: VideoFrameHash[];
  durationSec: number;
  clientVersion: string;
};

export type VpdqErrorCode =
  | "video_too_long"
  | "video_cannot_read"
  | "video_no_frames"
  | "video_cancelled";

export class VpdqError extends Error {
  readonly code: VpdqErrorCode;

  constructor(code: VpdqErrorCode) {
    super(code);
    this.name = "VpdqError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Pure sampling decisions, dedup and capping (no DOM, unit-tested directly).
// ---------------------------------------------------------------------------

/** Videos longer than 60 minutes are refused before any frame is read. */
export function videoTooLong(durationSec: number): boolean {
  return !Number.isFinite(durationSec) || durationSec > VPDQ_MAX_DURATION_SEC;
}

/**
 * The whole seconds at which a frame is sampled: every integer second inside
 * the video, starting at 0 ("one frame per second of playback").
 */
export function sampleTimes(durationSec: number): number[] {
  const times: number[] = [];
  for (let t = 0; t < durationSec && t < VPDQ_MAX_DURATION_SEC; t++) times.push(t);
  return times;
}

/**
 * The duration the WP17 video item carries: a whole second, 1..3600, covering
 * every sampled timestamp (it equals the number of seconds sampled).
 */
export function submittedDurationSec(durationSec: number): number {
  return Math.min(VPDQ_MAX_DURATION_SEC, Math.max(1, Math.ceil(durationSec)));
}

/** The highest frame quality of a fingerprint (0 when there are no frames). */
export function bestFrameQuality(frames: Pick<VideoFrameHash, "quality">[]): number {
  return frames.reduce((best, frame) => Math.max(best, frame.quality), 0);
}

/**
 * The "keep" pipeline applied to one frame per second, in sampling order:
 *
 * 1. drop frames whose PDQ quality is below `VPDQ_MIN_FRAME_QUALITY`;
 * 2. drop a frame whose hash is within `VPDQ_DEDUP_DISTANCE` of the previous
 *    kept frame (still scenes collapse to one hash);
 * 3. if more than `VPDQ_MAX_FRAMES` survive, keep an evenly spaced
 *    `VPDQ_MAX_FRAMES` of them.
 */
export function finalizeFrames(frames: VideoFrameHash[]): VideoFrameHash[] {
  const kept: VideoFrameHash[] = [];
  for (const frame of frames) {
    if (frame.quality < VPDQ_MIN_FRAME_QUALITY) continue;
    const previous = kept[kept.length - 1];
    if (previous && hammingDistance(previous.hash, frame.hash) <= VPDQ_DEDUP_DISTANCE) continue;
    kept.push(frame);
  }
  return capFrames(kept, VPDQ_MAX_FRAMES);
}

function capFrames(frames: VideoFrameHash[], cap: number): VideoFrameHash[] {
  if (frames.length <= cap) return frames;
  // Evenly spaced picks including the first and last, computed with exact
  // integer arithmetic (a float stride can round two picks onto one index).
  const last = frames.length - 1;
  const span = cap - 1;
  const out: VideoFrameHash[] = [];
  for (let i = 0; i < cap; i++) {
    out.push(frames[Math.floor((i * last) / span)]);
  }
  return out;
}

/** The WP17 video item sent to the server: hashes and timestamps only. */
export function toVideoHashItem(fingerprint: VideoFingerprint): VideoHashItem {
  return {
    kind: "video",
    frames: fingerprint.frames,
    durationSec: fingerprint.durationSec,
    clientVersion: VPDQ_CLIENT_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Browser sampler (DOM only; never imported by server or test code paths).
// ---------------------------------------------------------------------------

const METADATA_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 10_000;

export type SampleVideoOptions = {
  /** Abort sampling; the sampler stops and releases everything. */
  signal?: AbortSignal;
  /** Called with 0..100 as frames are read. */
  onProgress?: (percent: number) => void;
};

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new VpdqError("video_cancelled");
}

function waitForVideoEvent(video: HTMLVideoElement, event: "loadedmetadata" | "seeked" | "durationchange", timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new VpdqError("video_cannot_read"));
    }, timeoutMs);
    const onWanted = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new VpdqError("video_cannot_read"));
    };
    function cleanup() {
      window.clearTimeout(timer);
      video.removeEventListener(event, onWanted);
      video.removeEventListener("error", onError);
    }
    video.addEventListener(event, onWanted, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

/**
 * Loads her chosen file through an object URL into a hidden <video> and yields
 * `{ hash, quality, t }` for each sampled second, in playback order. The
 * object URL, video element and canvas are released when the generator
 * finishes, is closed or fails — whichever happens first.
 */

// One drawn frame is fingerprinted off the main thread (WP42 P2): the frame
// becomes an ImageBitmap (transferable) and the worker posts back only
// { hash, quality }. Where no worker can run, the frame is hashed where it
// was drawn — the exact path this module used before the worker — so hashes
// stay bit-identical either way and frame selection is untouched.
async function hashFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<{ hash: string; quality: number }> {
  if (hashWorkerSupported()) {
    try {
      const bitmap = await createImageBitmap(ctx.canvas);
      try {
        return await hashBitmapInWorker(bitmap);
      } finally {
        // After a successful transfer this is a no-op (the worker freed it);
        // if the post never happened, the bitmap is released here.
        bitmap.close();
      }
    } catch (err) {
      if (!(err instanceof HashWorkerError)) throw err;
      // The worker cannot be used; fall through to the main-thread path.
    }
  }
  return computePdqHash(ctx.getImageData(0, 0, width, height));
}

export async function* sampleVideoFrames(
  file: File,
  options: SampleVideoOptions = {},
): AsyncGenerator<VideoFrameHash, void, void> {
  if (typeof document === "undefined") throw new Error("vpdq_browser_only");
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  let canvas: HTMLCanvasElement | null = null;
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    video.tabIndex = -1;
    // Hidden but still in the document, so every seeked frame can be drawn.
    video.style.position = "fixed";
    video.style.left = "-10000px";
    video.style.top = "0";
    video.style.width = "2px";
    video.style.height = "2px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.src = objectUrl;
    document.body.appendChild(video);

    throwIfAborted(options.signal);
    await waitForVideoEvent(video, "loadedmetadata", METADATA_TIMEOUT_MS);
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Some WebM files report an unknown duration until a seek near the end
      // resolves it; one bounded attempt, then the video is refused.
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await waitForVideoEvent(video, "durationchange", METADATA_TIMEOUT_MS);
      duration = video.duration;
      video.currentTime = 0;
      await waitForVideoEvent(video, "seeked", SEEK_TIMEOUT_MS);
    }
    if (!(duration > 0) || Number.isNaN(duration)) throw new VpdqError("video_cannot_read");
    // Refused before any frame is read, with its own clear message.
    if (videoTooLong(duration)) throw new VpdqError("video_too_long");
    if (video.videoWidth < 1 || video.videoHeight < 1) throw new VpdqError("video_cannot_read");

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new VpdqError("video_cannot_read");
    ctx.imageSmoothingEnabled = false;

    const times = sampleTimes(duration);
    options.onProgress?.(0);
    for (let i = 0; i < times.length; i++) {
      throwIfAborted(options.signal);
      video.currentTime = times[i];
      await waitForVideoEvent(video, "seeked", SEEK_TIMEOUT_MS);
      throwIfAborted(options.signal);
      ctx.drawImage(video, 0, 0, width, height);
      const { hash, quality } = await hashFrame(ctx, width, height);
      options.onProgress?.(Math.round((100 * (i + 1)) / times.length));
      yield { hash, quality, t: times[i] };
    }
  } finally {
    // Free everything: the decoder, the object URL and the canvas.
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Fingerprints one chosen video end to end: samples one frame per second,
 * applies the keep pipeline and returns the frames with the whole-second
 * duration. Cancelable through `options.signal`; reports 0..100 progress.
 */
export async function fingerprintVideo(file: File, options: SampleVideoOptions = {}): Promise<VideoFingerprint> {
  const sampled: VideoFrameHash[] = [];
  const generator = sampleVideoFrames(file, options);
  try {
    for await (const frame of generator) sampled.push(frame);
  } catch (err) {
    if (options.signal?.aborted) throw new VpdqError("video_cancelled");
    throw err;
  }
  // One frame per whole second was sampled, so the sample count is the
  // whole-second duration the WP17 item carries.
  return { frames: finalizeFrames(sampled), durationSec: submittedDurationSec(sampled.length) };
}
