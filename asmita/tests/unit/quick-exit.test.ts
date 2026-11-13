import { afterEach, describe, expect, it } from "vitest";
import { idleTimeoutMs, isDoubleEscape } from "@/components/QuickExit";

describe("isDoubleEscape", () => {
  it("counts a second Escape inside the window as the exit trigger", () => {
    expect(isDoubleEscape(Date.now(), Date.now() - 100)).toBe(true);
  });

  it("ignores a second Escape after the window has passed", () => {
    expect(isDoubleEscape(10_000, 0)).toBe(false);
    expect(isDoubleEscape(10_000, 10_000 - 801)).toBe(false);
  });

  it("ignores the first Escape press (nothing before it)", () => {
    // previousAt = 0 means "no previous press", not "a press at epoch 0".
    expect(isDoubleEscape(Date.now(), 0)).toBe(false);
  });

  it("honours a custom window", () => {
    const now = 50_000;
    expect(isDoubleEscape(now, now - 3_000, 5_000)).toBe(true);
    expect(isDoubleEscape(now, now - 6_000, 5_000)).toBe(false);
  });
});

describe("idleTimeoutMs", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS;
  });

  it("defaults to 20 minutes", () => {
    expect(idleTimeoutMs()).toBe(20 * 60 * 1_000);
  });

  it("accepts a configured value within the safe range", () => {
    process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS = "90000";
    expect(idleTimeoutMs()).toBe(90_000);
  });

  it("rejects values that would trap or log out a user mid-flow", () => {
    // Under 15s a slow reader gets bounced; over 12h the timeout is pointless.
    process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS = "1000";
    expect(idleTimeoutMs()).toBe(20 * 60 * 1_000);
    process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS = "999999999";
    expect(idleTimeoutMs()).toBe(20 * 60 * 1_000);
    process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS = "not-a-number";
    expect(idleTimeoutMs()).toBe(20 * 60 * 1_000);
  });
});
