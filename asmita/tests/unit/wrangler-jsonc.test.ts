import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// scripts/prepare-production-wrangler.mjs reads wrangler.jsonc with strict
// JSON.parse (the deploy:production path and the CI e2e job's Worker build
// step), so the file must stay valid JSON even though its extension invites
// JSONC comments: a `//` note beside a var fails the production deploy
// preparation with a SyntaxError. The file's "no comments" rule (also
// documented by earlier fixes of this same breakage) is enforced here so the
// fast unit-test job catches it, not a later CI job.

describe("wrangler.jsonc", () => {
  const raw = readFileSync(path.join(process.cwd(), "wrangler.jsonc"), "utf8");

  it("is strict JSON, which prepare-production-wrangler.mjs parses", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("defines env.production for the production deploy config", () => {
    const config = JSON.parse(raw) as { env?: { production?: unknown } };
    expect(config.env?.production).toBeTruthy();
  });
});
