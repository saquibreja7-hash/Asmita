import { beforeEach, describe, expect, it } from "vitest";
import { registerCaseWithUrls } from "@/lib/case-ops";
import { cases } from "@/lib/store";

describe("URL-only case registration", () => {
  beforeEach(() => cases.clear());

  it("does not create a case when one of the submitted links is unsafe", async () => {
    const result = await registerCaseWithUrls("test-user", [
      "https://example.invalid/post/1",
      "file:///private/image",
    ]);
    expect(result).toMatchObject({
      ok: false,
      errors: [{ index: 1, error: "blocked_scheme" }],
    });
    expect(cases.size).toBe(0);
  });

  it("creates one case with each unique safe URL", async () => {
    const result = await registerCaseWithUrls("test-user", [
      "https://example.invalid/post/1",
      "https://example.invalid/post/1",
      "https://example.invalid/post/2",
    ]);
    expect(result).toMatchObject({ ok: true, accepted: 2 });
    if (!result.ok) throw new Error("registration_failed");
    expect(cases.get(result.id)?.urls).toHaveLength(2);
  });

  it("reuses the same case for a repeated registration key", async () => {
    const options = { registrationKeyHash: "synthetic-registration-key-hash" };
    const first = await registerCaseWithUrls("test-user", ["https://example.invalid/post/1"], options);
    const replay = await registerCaseWithUrls("test-user", ["https://example.invalid/post/1"], options);
    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: true, replayed: true });
    if (!first.ok || !replay.ok) throw new Error("registration_failed");
    expect(replay.id).toBe(first.id);
    expect(cases.size).toBe(1);
  });
});
