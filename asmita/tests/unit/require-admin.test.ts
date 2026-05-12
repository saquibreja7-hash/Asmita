import { describe, expect, it } from "vitest";
import { isAdminRole } from "@/lib/auth/require-admin";

describe("isAdminRole", () => {
  it("allows only administrator sessions", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("VICTIM")).toBe(false);
    expect(isAdminRole("SUPPORTER")).toBe(false);
    expect(isAdminRole("NGO_WORKER")).toBe(false);
  });
});
