import { describe, expect, it } from "vitest";
import { findVerifiedUserByEmail, upsertVerifiedUser } from "@/lib/case-ops";

// Memory backend (no DATABASE_URL): the lookup Track your case relies on.
describe("findVerifiedUserByEmail", () => {
  it("finds a survivor who signed in before, and never creates one", async () => {
    expect(await findVerifiedUserByEmail("track-new@example.invalid")).toBeNull();
    // Looking up did not register the email.
    expect(await findVerifiedUserByEmail("track-new@example.invalid")).toBeNull();
    const user = await upsertVerifiedUser("track-known@example.invalid", true);
    expect(await findVerifiedUserByEmail("track-known@example.invalid")).toEqual({ id: user.id, ageOver18: true });
    // The email is matched by its hash, so case does not matter.
    expect(await findVerifiedUserByEmail("TRACK-KNOWN@example.invalid")).toEqual({ id: user.id, ageOver18: true });
  });
});
