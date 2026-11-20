import { describe, expect, it } from "vitest";
import { labEnabled } from "@/lib/lab/flags";

// The charter's one switch (docs/lab/charter.md): on in dev and test, off in
// production until the owner turns it on in wrangler.jsonc, and an explicit
// value always wins. Pure function, no env mutation needed.

describe("labEnabled (ENABLE_LAB)", () => {
  it("is on in development and test by default", () => {
    expect(labEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(labEnabled({ NODE_ENV: "test" })).toBe(true);
  });

  it("is off in production until the owner turns it on", () => {
    expect(labEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("lets an explicit value win in both directions", () => {
    expect(labEnabled({ NODE_ENV: "production", ENABLE_LAB: "true" })).toBe(true);
    expect(labEnabled({ NODE_ENV: "development", ENABLE_LAB: "false" })).toBe(false);
    expect(labEnabled({ NODE_ENV: "test", ENABLE_LAB: "false" })).toBe(false);
  });

  it("treats an empty value as unset", () => {
    expect(labEnabled({ NODE_ENV: "development", ENABLE_LAB: "" })).toBe(true);
    expect(labEnabled({ NODE_ENV: "production", ENABLE_LAB: "" })).toBe(false);
  });
});
