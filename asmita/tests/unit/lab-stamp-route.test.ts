/*
 * The /api/lab/stamp route (WP94, docs/lab/beta-spec.md): the gate, CSRF,
 * the body cap, strict multipart validation, magic-byte type checks, both
 * rate limits, the not-configured refusal — and a real stamp answered with
 * the real engine and a throwaway self-signed key generated at runtime
 * (lab-stamp-testcert.ts; no key is ever committed). The image bytes are
 * synthetic; nothing here reaches any network (fetch is stubbed everywhere
 * the engine's first-party file is needed).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import jpeg from "jpeg-js";
import { POST as stamp } from "@/app/api/lab/stamp/route";
import { createCsrfPair } from "@/lib/csrf";
import { securityEvents } from "@/lib/security-log";
import { generateTestSigningPair } from "./lab-stamp-testcert";

const require = createRequire(import.meta.url);
const engineWasm = readFileSync(
  path.join(path.dirname(require.resolve("@contentauth/c2pa-wasm/package.json")), "pkg", "c2pa_bg.wasm"),
);

let ipCounter = 10;

/** A small synthetic JPEG: a plain machine-made colour gradient, no person. */
function syntheticJpeg(): Uint8Array<ArrayBuffer> {
  const width = 96;
  const height = 96;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = (i * 7) % 255;
    pixels[i * 4 + 1] = (i * 13) % 255;
    pixels[i * 4 + 2] = (i * 29) % 255;
    pixels[i * 4 + 3] = 255;
  }
  // A fresh copy into its own ArrayBuffer: File() wants an ArrayBuffer-backed view.
  return new Uint8Array(jpeg.encode({ data: pixels, width, height }, 90).data);
}

function stampRequest(
  file: { bytes: Uint8Array<ArrayBuffer>; name?: string; type?: string } | null,
  options: { csrf?: boolean; ip?: string; creator?: string; extraPart?: [string, string]; secondImage?: boolean } = {},
) {
  const csrf = createCsrfPair();
  ipCounter += 1;
  const form = new FormData();
  if (file) form.append("image", new File([file.bytes], file.name ?? "photo.jpg", { type: file.type ?? "image/jpeg" }));
  if (options.secondImage) form.append("image", new File([syntheticJpeg()], "second.jpg", { type: "image/jpeg" }));
  if (options.creator !== undefined) form.append("creator", options.creator);
  if (options.extraPart) form.append(options.extraPart[0], options.extraPart[1]);
  return new Request("https://asmita.test/api/lab/stamp", {
    method: "POST",
    headers: {
      ...(options.csrf === false ? {} : { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token }),
      "cf-connecting-ip": options.ip ?? `198.51.100.${ipCounter}`,
    },
    body: form,
  });
}

describe("/api/lab/stamp", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ENABLE_LAB", "true");
    vi.stubEnv("LAB_C2PA_CERT", "");
    vi.stubEnv("LAB_C2PA_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    securityEvents.splice(0, securityEvents.length);
  });

  it("answers 503 lab_disabled while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const response = await stamp(stampRequest({ bytes: syntheticJpeg() }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "lab_disabled" });
  });

  it("refuses a request without a CSRF token", async () => {
    const response = await stamp(stampRequest({ bytes: syntheticJpeg() }, { csrf: false }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "csrf_failed" });
  });

  it("refuses an oversized envelope before reading it", async () => {
    const csrf = createCsrfPair();
    const declared = new Request("https://asmita.test/api/lab/stamp", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data",
        "content-length": "20971520",
        cookie: `asmita_csrf=${csrf.nonce}`,
        "x-csrf-token": csrf.token,
      },
      body: "x",
    });
    expect((await stamp(declared)).status).toBe(413);
  });

  it("validates the multipart payload strictly", async () => {
    expect((await stamp(stampRequest(null))).status).toBe(400); // no image part
    expect((await stamp(stampRequest({ bytes: syntheticJpeg() }, { secondImage: true }))).status).toBe(400); // two images
    expect((await stamp(stampRequest({ bytes: syntheticJpeg() }, { extraPart: ["sneaky", "1"] }))).status).toBe(400);
    expect((await stamp(stampRequest({ bytes: syntheticJpeg() }, { creator: "a".repeat(101) }))).status).toBe(400);
  });

  it("checks the type from the file's own bytes, never from its label", async () => {
    const textBytes = new TextEncoder().encode("certainly not a photograph, just text with a jpeg name");
    expect((await stamp(stampRequest({ bytes: textBytes, name: "photo.jpg", type: "image/jpeg" }))).status).toBe(400);
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 1, 1, 0x00]);
    expect((await stamp(stampRequest({ bytes: gifBytes, name: "photo.jpg", type: "image/jpeg" }))).status).toBe(400);
    expect((await stamp(stampRequest({ bytes: new Uint8Array(0) }))).status).toBe(400);
  });

  it("refuses a photo over the 10 MB cap after reading it", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1024);
    big.set([0xff, 0xd8, 0xff]);
    const response = await stamp(stampRequest({ bytes: big }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
  });

  it("refuses with signing_not_configured when the environment has no key", async () => {
    const response = await stamp(stampRequest({ bytes: syntheticJpeg() }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "signing_not_configured" });
  });

  describe("with a throwaway signing pair and the real engine", () => {
    beforeEach(() => {
      const pair = generateTestSigningPair("Asmita Lab Route Test Signer");
      vi.stubEnv("LAB_C2PA_CERT", pair.certPem);
      vi.stubEnv("LAB_C2PA_KEY", pair.keyPem);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(engineWasm, { headers: { "content-type": "application/wasm" } })));
    });

    it("stamps the photo and returns it for download", async () => {
      const response = await stamp(stampRequest({ bytes: syntheticJpeg() }, { creator: "Route Test Creator" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("cache-control")).toBe("no-store");
      // An invented file name: the visitor's own never comes back.
      expect(response.headers.get("content-disposition")).toBe('attachment; filename="content-credentials.jpg"');
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.byteLength).toBeGreaterThan(syntheticJpeg().byteLength);
      expect(Buffer.from(bytes).includes(Buffer.from("c2pa", "ascii"))).toBe(true);
      // The typed name is inside the manifest by design — that is the tool.
      expect(Buffer.from(bytes).includes(Buffer.from("Route Test Creator"))).toBe(true);
    });

    it("stores and logs nothing about the photo or the typed name", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const sentinelName = "sentinel-mango-tree-94";
      const response = await stamp(stampRequest({ bytes: syntheticJpeg(), name: "sentinel-file-94.jpg" }, { creator: sentinelName }));
      expect(response.status).toBe(200);
      const logged = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join(" ");
      expect(logged).not.toContain(sentinelName);
      expect(logged).not.toContain("sentinel-file-94");
      expect(JSON.stringify(securityEvents)).not.toContain(sentinelName);
    });

    it("caps stamps per IP", async () => {
      const ip = "198.51.100.202";
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        statuses.push((await stamp(stampRequest({ bytes: syntheticJpeg() }, { ip }))).status);
      }
      expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it("enforces the site-wide daily cap from LAB_STAMP_DAILY_LIMIT", async () => {
      // Memory rate-limit buckets are shared across the tests in this file,
      // so move time past every window first and give each request its own
      // IP: only the site-wide daily cap can refuse.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000));
      try {
        vi.stubEnv("LAB_STAMP_DAILY_LIMIT", "2");
        const statuses = [
          (await stamp(stampRequest({ bytes: syntheticJpeg() }))).status,
          (await stamp(stampRequest({ bytes: syntheticJpeg() }))).status,
          (await stamp(stampRequest({ bytes: syntheticJpeg() }))).status,
        ];
        expect(statuses.slice(0, 2).every((status) => status === 200)).toBe(true);
        expect(statuses[2]).toBe(429);
      } finally {
        vi.useRealTimers();
      }
    });

    it("answers 503 without storing anything when the engine cannot load", async () => {
      vi.resetModules();
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("network unavailable");
      }));
      const { POST: freshStamp } = await import("@/app/api/lab/stamp/route");
      const response = await freshStamp(stampRequest({ bytes: syntheticJpeg() }));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "service_unavailable" });
    });
  });
});
