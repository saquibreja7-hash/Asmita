/**
 * SSCD worker child process (WP28): image bytes in, `{ vector, rss }` or an
 * error code out. Nothing else crosses the boundary — never a URL, a path
 * or a fingerprint.
 *
 * This process is started by SscdPool (sscd-pool.ts) with:
 *   - a scrubbed environment (no service key, no config, no secrets);
 *   - the model file path and the expected embedding dimension on its argv
 *     (neither is secret; the weights are downloaded at image build time
 *     from a pinned URL with a sha256 check in the Dockerfile — a runtime
 *     hash check would need node:fs here, which src/ forbids by the
 *     memory-only rule);
 *   - Node's permission model: no filesystem writes, no child processes,
 *     no worker threads, reads limited to this bundle, sharp/libvips,
 *     onnxruntime-node and the model file;
 *   - a JS heap cap, and stdout/stderr discarded by the parent.
 * It never receives the fingerprint pool, URLs or the service key through
 * its environment, argv or messages, and it has no network code. The
 * permission model is not a sandbox against native code (onnxruntime is
 * an addon, like sharp): see the README's decoder-isolation section for
 * what that does and does not protect against — the same list applies.
 *
 * The model loads lazily on the first task, so a spawned-but-idle child
 * costs nothing. onnxruntime runs single-threaded (intraOpNumThreads 1):
 * one child, one core, deterministic.
 */
import * as ort from "onnxruntime-node";
import { CrawlError, ERROR_CODES, toCrawlError } from "../errors.ts";
import { buildSscdTensor, prepareSscdInput, roundVector, SSCD_INPUT_SIZE } from "./sscd-model.ts";

type Request = { id: number; bytes: Uint8Array; minSide: number };

const ERROR_SET = new Set<string>(ERROR_CODES);

// Belt and braces: this process has no business making network requests.
for (const name of ["fetch", "WebSocket", "EventSource"]) {
  Reflect.deleteProperty(globalThis, name);
}

const [modelPath, expectedDimArg] = process.argv.slice(2);
const expectedDim = Number.parseInt(expectedDimArg ?? "", 10);

/** Lazily created, kept for the child's whole life (the parent recycles by RSS and task count). */
let session: ort.InferenceSession | null = null;

async function loadModel(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (!modelPath || !Number.isInteger(expectedDim) || expectedDim <= 0) throw new CrawlError("sscd_bad_model");
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
      executionMode: "sequential",
      intraOpNumThreads: 1,
      graphOptimizationLevel: "all",
    });
  } catch (err) {
    // The error's message can name the path; only the fixed code crosses.
    session = null;
    throw new CrawlError(err instanceof Error && /ENOENT|no such file/i.test(err.message) ? "sscd_model_missing" : "sscd_bad_model");
  }
  // The binding's inputMetadata carries only name and type in this
  // onnxruntime version (verified in the container), so the shape is
  // enforced at run time instead: the tensor we build is [1, 3, 320, 320]
  // by construction, a model that expects another shape fails the run
  // (mapped to a fixed code below), and the reply's dimension is checked
  // against the expected one before anything crosses the boundary.
  return session;
}

async function embed(bytes: Buffer, minSide: number): Promise<number[]> {
  const s = await loadModel();
  const rgb = await prepareSscdInput(bytes, { minSide });
  const tensor = buildSscdTensor(rgb, SSCD_INPUT_SIZE);
  // The type is inferred from the Float32Array ("float32"); the shape is
  // the model's fixed square input [1, 3, 320, 320].
  const input = new ort.Tensor(tensor, [1, 3, SSCD_INPUT_SIZE, SSCD_INPUT_SIZE]);
  let out: ort.InferenceSession.OnnxValueMapType;
  try {
    out = await s.run({ images: input });
  } catch {
    throw new CrawlError("sscd_inference_failed");
  }
  const embeddings = out.embeddings;
  const data = embeddings?.data;
  if (!(data instanceof Float32Array) || data.length !== expectedDim) throw new CrawlError("sscd_bad_model");
  return roundVector(Array.from(data));
}

function send(msg: unknown): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) return resolve();
    process.send(msg, undefined, {}, () => resolve());
  });
}

function isRequest(m: unknown): m is Request {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  return Number.isInteger(r.id) && r.bytes instanceof Uint8Array && Number.isInteger(r.minSide);
}

process.on("message", (m: unknown) => {
  void (async () => {
    if (!isRequest(m)) {
      // The parent only sends well-formed requests; anything else is a bug.
      process.exit(65);
    }
    let reply: Record<string, unknown>;
    try {
      const bytes = Buffer.from(m.bytes.buffer, m.bytes.byteOffset, m.bytes.byteLength);
      reply = { id: m.id, ok: true, vector: await embed(bytes, m.minSide) };
    } catch (err) {
      const code = toCrawlError(err).code;
      reply = { id: m.id, ok: false, code: ERROR_SET.has(code) ? code : "sscd_inference_failed" };
    }
    // Resident memory after this task, so the parent can recycle on it.
    reply.rss = process.memoryUsage.rss();
    await send(reply);
  })();
});

// Never print anything: no stack traces, no bytes. Exit codes only.
process.on("uncaughtException", () => process.exit(70));
process.on("unhandledRejection", () => process.exit(70));
process.on("disconnect", () => process.exit(0));
