import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/check-image/route";

const keys = ["ENABLE_PROVENANCE_CHECK"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("server-side provenance feature flag", () => {
  it("rejects requests when the provenance check is disabled", async () => {
    process.env.ENABLE_PROVENANCE_CHECK = "false";

    const response = await POST(new Request("https://asmita.test/api/check-image", {
      method: "POST",
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });

  it("enforces CSRF when the provenance check is enabled", async () => {
    process.env.ENABLE_PROVENANCE_CHECK = "true";
    const response = await POST(new Request("https://asmita.test/api/check-image", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "csrf_failed" });
  });
});
