import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST as logoutAdmin } from "@/app/api/admin/auth/logout/route";
import { POST as logoutSurvivor } from "@/app/api/auth/logout/route";
import { createCsrfPair } from "@/lib/csrf";

// Web audit WP41, S1 + S10: sign-out must leave nothing behind on a shared
// phone. The cookies expire via Set-Cookie; everything else the origin holds
// in the browser — the submit draft and the eligibility answers in session
// storage, the admin shortcut preference in local storage, cached pages —
// goes with the Clear-Site-Data header. Quick Exit and friends also clear
// the tab's sessionStorage themselves (src/lib/clear-tab-storage.ts), so
// the header is one of two independent clears, not the only one.

function csrfPost(url: string) {
  const csrf = createCsrfPair();
  return new Request(url, {
    method: "POST",
    headers: { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token },
  });
}

function expiredCookie(response: Response, name: string) {
  const cookie = response.headers.getSetCookie().find((value: string) => value.startsWith(`${name}=`));
  expect(cookie, `${name} was not expired`).toBeDefined();
  return cookie ?? "";
}

describe("logout routes", () => {
  it("survivor logout sends Clear-Site-Data and expires both cookies", async () => {
    const response = await logoutSurvivor(csrfPost("https://asmita.test/api/auth/logout"));

    expect(response.status).toBe(200);
    expect(response.headers.get("clear-site-data")).toBe('"cache", "storage"');
    expect(expiredCookie(response, "asmita_session")).toContain("Max-Age=0");
    expect(expiredCookie(response, "asmita_eligible")).toContain("Max-Age=0");
  });

  it("admin logout sends Clear-Site-Data and expires the cookie at every path it was ever set", async () => {
    const response = await logoutAdmin(csrfPost("https://asmita.test/api/admin/auth/logout"));

    expect(response.status).toBe(200);
    expect(response.headers.get("clear-site-data")).toBe('"cache", "storage"');
    const cookies = response.headers.getSetCookie().filter((value) => value.startsWith("asmita_admin_session="));
    expect(cookies).toHaveLength(2);
    expect(cookies.join("\n")).toContain("Path=/;");
    expect(cookies.join("\n")).toContain("Path=/admin;");
    expect(cookies.every((value) => value.includes("Max-Age=0"))).toBe(true);
  });

  it("refuses a forged logout and clears nothing", async () => {
    const survivor = await logoutSurvivor(new Request("https://asmita.test/api/auth/logout", { method: "POST" }));
    expect(survivor.status).toBe(403);
    expect(survivor.headers.get("clear-site-data")).toBeNull();
    expect(survivor.headers.getSetCookie()).toEqual([]);

    const admin = await logoutAdmin(new Request("https://asmita.test/api/admin/auth/logout", { method: "POST" }));
    expect(admin.status).toBe(403);
    expect(admin.headers.get("clear-site-data")).toBeNull();
    expect(admin.headers.getSetCookie()).toEqual([]);
  });
});

describe("eligibility cookie (S10)", () => {
  it("is a session cookie with no Max-Age", () => {
    // eligibility.ts writes document.cookie in her browser, not in this Node
    // environment, so the regression check reads the source (the pattern of
    // tests/unit/flow-state.test.ts): the 24-hour Max-Age is what let a
    // shared phone reopen /submit a day later.
    const source = readFileSync(join(process.cwd(), "src/lib/eligibility.ts"), "utf8");
    const setCookie = source.split("\n").find((line: string) => line.includes("ELIGIBLE_COOKIE}=1;"));
    expect(setCookie, "the line that sets the eligible cookie").toBeDefined();
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Max-Age");
    // The deletion cookie keeps its Max-Age=0.
    const clearCookie = source.split("\n").find((line: string) => line.includes("ELIGIBLE_COOKIE}=;"));
    expect(clearCookie).toContain("Max-Age=0");
  });
});
