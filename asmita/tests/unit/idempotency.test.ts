import { afterEach, describe, expect, it } from "vitest";
import {
  __clearIdempotencyStoreForTests,
  getCachedResponse,
  readIdempotencyKey,
  rememberResponse,
} from "@/lib/idempotency";

afterEach(() => {
  __clearIdempotencyStoreForTests();
});

describe("readIdempotencyKey", () => {
  it("returns the trimmed header when valid", () => {
    const r = new Request("https://asmita.test/x", {
      method: "POST",
      headers: { "idempotency-key": "  case-abc-12345  " },
    });
    expect(readIdempotencyKey(r)).toBe("case-abc-12345");
  });

  it("returns null when missing", () => {
    const r = new Request("https://asmita.test/x", { method: "POST" });
    expect(readIdempotencyKey(r)).toBeNull();
  });

  it("rejects keys shorter than 8 characters", () => {
    const r = new Request("https://asmita.test/x", {
      method: "POST",
      headers: { "idempotency-key": "short" },
    });
    expect(readIdempotencyKey(r)).toBeNull();
  });

  it("rejects keys longer than 128 characters", () => {
    const r = new Request("https://asmita.test/x", {
      method: "POST",
      headers: { "idempotency-key": "a".repeat(200) },
    });
    expect(readIdempotencyKey(r)).toBeNull();
  });

  it("rejects keys with control characters", () => {
    const r = new Request("https://asmita.test/x", {
      method: "POST",
      headers: { "idempotency-key": "abcdefgh" },
    });
    expect(readIdempotencyKey(r)).toBeNull();
  });
});

describe("idempotency cache", () => {
  it("returns null when nothing is stored", () => {
    expect(getCachedResponse("scope", "actor", "key-12345")).toBeNull();
  });

  it("returns the cached entry after rememberResponse", () => {
    rememberResponse("scope", "actor", "key-12345", 200, { ok: true });
    const cached = getCachedResponse("scope", "actor", "key-12345");
    expect(cached?.status).toBe(200);
    expect(cached?.body).toEqual({ ok: true });
  });

  it("isolates entries by scope", () => {
    rememberResponse("scope-a", "actor", "key-12345", 200, { from: "a" });
    rememberResponse("scope-b", "actor", "key-12345", 200, { from: "b" });
    expect(getCachedResponse("scope-a", "actor", "key-12345")?.body).toEqual({
      from: "a",
    });
    expect(getCachedResponse("scope-b", "actor", "key-12345")?.body).toEqual({
      from: "b",
    });
  });

  it("isolates entries by actor — one user's key never collides with another's", () => {
    rememberResponse("scope", "actor-a", "key-12345", 200, { from: "a" });
    expect(getCachedResponse("scope", "actor-b", "key-12345")).toBeNull();
  });
});
