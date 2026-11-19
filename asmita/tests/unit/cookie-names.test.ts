import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_BASE_NAMES,
  adminSessionCookieName,
  csrfCookieName,
  readCookieWithFallback,
  sessionCookieName,
  withLegacyFallback,
} from "@/lib/cookie-names";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cookie names", () => {
  it("keeps the plain names in dev and test", () => {
    expect(sessionCookieName()).toBe("asmita_session");
    expect(adminSessionCookieName()).toBe("asmita_admin_session");
    expect(csrfCookieName()).toBe("asmita_csrf");
  });

  it("prefixes the session and CSRF cookies with __Host- in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieName()).toBe("__Host-asmita_session");
    expect(adminSessionCookieName()).toBe("__Host-asmita_admin_session");
    expect(csrfCookieName()).toBe("__Host-asmita_csrf");
  });

  it("leaves the non-auth cookies plain in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(COOKIE_BASE_NAMES.language).toBe("asmita_lang");
    expect(COOKIE_BASE_NAMES.eligibleAdult).toBe("asmita_eligible");
    expect(COOKIE_BASE_NAMES.adminLinksSeen).toBe("asmita_admin_links_seen");
  });

  it("looks a cookie up under a single name in dev and test", () => {
    expect(withLegacyFallback(sessionCookieName())).toEqual(["asmita_session"]);
  });

  it("accepts the pre-__Host- name as well in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(withLegacyFallback(sessionCookieName())).toEqual(["__Host-asmita_session", "asmita_session"]);
    expect(withLegacyFallback(csrfCookieName())).toEqual(["__Host-asmita_csrf", "asmita_csrf"]);
    expect(withLegacyFallback(adminSessionCookieName())).toEqual([
      "__Host-asmita_admin_session",
      "asmita_admin_session",
    ]);
  });

  it("reads the current name first and only falls back when it is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    const reads: string[] = [];
    const get = (name: string) => {
      reads.push(name);
      return name === "__Host-asmita_session"
        ? { value: "current-session" }
        : name === "asmita_session"
          ? { value: "legacy-session" }
          : undefined;
    };
    expect(readCookieWithFallback(get, sessionCookieName())).toBe("current-session");
    expect(reads).toEqual(["__Host-asmita_session"]);
  });

  it("falls back to the legacy name for one release", () => {
    vi.stubEnv("NODE_ENV", "production");
    const get = (name: string) => (name === "asmita_session" ? { value: "legacy-session" } : undefined);
    expect(readCookieWithFallback(get, sessionCookieName())).toBe("legacy-session");
  });

  it("returns nothing when no name matches", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(readCookieWithFallback(() => undefined, sessionCookieName())).toBeUndefined();
  });
});
