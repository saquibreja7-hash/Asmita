import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/auth/jwt";

describe("jwt session", () => {
  it("round trips session claims", async () => {
    const token = await signSession({
      sub: "user-1",
      role: "VICTIM",
      ageOver18: true,
      emailHash: "hash",
    });
    await expect(verifySession(token)).resolves.toMatchObject({
      sub: "user-1",
      role: "VICTIM",
      ageOver18: true,
      emailHash: "hash",
    });
  });

  it("returns null for a tampered token", async () => {
    await expect(verifySession("bad.token.value")).resolves.toBeNull();
  });
});
