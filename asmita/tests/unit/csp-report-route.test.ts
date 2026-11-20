import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postCspReport } from "@/app/api/csp-report/route";
import {
  CSP_REPORTS_PER_10_MINUTES,
  MAX_CSP_REPORT_BYTES,
  summarizeCspReports,
} from "@/lib/csp-report";

/*
 * /api/csp-report (WP46 S5): browsers POST violation reports here without a
 * CSRF token, so these tests use no cookies — the route must not require
 * them. Only the logged three fields are observable; everything else about
 * the payload must be dropped.
 */

const LEGACY = "application/csp-report";
const REPORTS = "application/reports+json";

function reportRequest(contentType: string | null, body: string, ip: string) {
  const headers: Record<string, string> = { "cf-connecting-ip": ip };
  if (contentType !== null) headers["content-type"] = contentType;
  return new Request("https://asmita.test/api/csp-report", { method: "POST", headers, body });
}

const legacyBody = JSON.stringify({
  "csp-report": {
    "document-uri": "https://asmita.test/review-sign?token=SECRET#frag",
    "blocked-uri": "https://blocked.example/script.js?x=1#y",
    "violated-directive": "script-src",
    "effective-directive": "script-src-elem",
    "script-sample": "sensitive sample text",
    "original-policy": "default-src 'self'",
    "status-code": 200,
  },
});

function loggedLines() {
  return (console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((call) => call.map(String).join(" "))
    .join("\n");
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CSP report content types", () => {
  it("accepts the legacy csp-report body and returns 204 with an empty body", async () => {
    const response = await postCspReport(reportRequest(LEGACY, legacyBody, "198.51.100.1"));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("accepts the Reporting API reports+json body and skips non-CSP entries", async () => {
    const body = JSON.stringify([
      { type: "deprecation-report", body: { id: "ignored" } },
      {
        type: "csp-violation",
        url: "https://asmita.test/talk?from=home",
        user_agent: "must never be logged",
        body: { blockedURL: "https://blocked.example:8443/a.js?z=1", effectiveDirective: "script-src-elem" },
      },
    ]);
    const response = await postCspReport(reportRequest(REPORTS, body, "198.51.100.2"));
    expect(response.status).toBe(204);
    const lines = loggedLines().trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"blockedOrigin":"https://blocked.example:8443"');
    expect(lines[0]).toContain('"documentPath":"/talk"');
    expect(lines[0]).not.toContain("user_agent");
  });

  it("keeps working when the browser adds parameters to the content type", async () => {
    const response = await postCspReport(
      reportRequest(`${LEGACY}; charset=utf-8`, legacyBody, "198.51.100.3"),
    );
    expect(response.status).toBe(204);
  });

  it("refuses anything that is not a CSP report content type", async () => {
    for (const contentType of [null, "application/json", "text/plain", ""]) {
      const response = await postCspReport(
        reportRequest(contentType, legacyBody, "198.51.100.4"),
      );
      expect(response.status).toBe(415);
    }
  });

  it("refuses a body that is not a CSP report at all", async () => {
    const malformed = [
      ["{not json"],
      ['{"other": 1}'],
      [JSON.stringify({ "csp-report": "not an object" })],
      [JSON.stringify([1, 2, 3])],
    ];
    for (const [body] of malformed) {
      const legacy = await postCspReport(reportRequest(LEGACY, body, "198.51.100.5"));
      expect(legacy.status).toBe(400);
    }
    for (const body of ["not json", '{"object": true}', JSON.stringify({ type: "csp-violation" })]) {
      const batch = await postCspReport(reportRequest(REPORTS, body, "198.51.100.5"));
      expect(batch.status).toBe(400);
    }
    // A valid batch with no CSP entries is accepted; there is just nothing to log.
    const empty = await postCspReport(
      reportRequest(REPORTS, JSON.stringify([{ type: "deprecation-report", body: {} }]), "198.51.100.5"),
    );
    expect(empty.status).toBe(204);
    expect(loggedLines()).toBe("");
  });
});

describe("CSP report size cap", () => {
  it("refuses a body over 8 KB", async () => {
    const body = "a".repeat(MAX_CSP_REPORT_BYTES + 1);
    const response = await postCspReport(reportRequest(LEGACY, body, "198.51.100.6"));
    expect(response.status).toBe(413);
  });

  it("refuses a declared content-length over 8 KB without reading the body", async () => {
    const headers: Record<string, string> = {
      "content-type": LEGACY,
      "cf-connecting-ip": "198.51.100.7",
      "content-length": "999999",
    };
    const response = await postCspReport(
      new Request("https://asmita.test/api/csp-report", { method: "POST", headers, body: "x" }),
    );
    expect(response.status).toBe(413);
  });
});

describe("CSP report rate limit", () => {
  it("limits per network and leaves other networks alone", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < CSP_REPORTS_PER_10_MINUTES + 5; i += 1) {
      statuses.push((await postCspReport(reportRequest(LEGACY, legacyBody, "198.51.100.8"))).status);
    }
    expect(statuses.slice(0, CSP_REPORTS_PER_10_MINUTES).every((s) => s === 204)).toBe(true);
    expect(statuses.slice(CSP_REPORTS_PER_10_MINUTES)).toEqual(
      Array.from({ length: 5 }, () => 429),
    );
    const other = await postCspReport(reportRequest(LEGACY, legacyBody, "198.51.100.9"));
    expect(other.status).toBe(204);
  });
});

describe("CSP report log hygiene", () => {
  it("logs only directive, blocked-uri origin and document path, stripped", async () => {
    await postCspReport(reportRequest(LEGACY, legacyBody, "198.51.100.10"));
    expect(loggedLines()).toBe(
      JSON.stringify({
        cspViolation: {
          directive: "script-src-elem",
          blockedOrigin: "https://blocked.example",
          documentPath: "/review-sign",
        },
      }),
    );
  });

  it("reduces non-URL blocked-uri values to CSP's fixed tokens", () => {
    const summaries = summarizeCspReports(LEGACY, legacyBody)!;
    expect(summaries).toHaveLength(1);
    const inline = summarizeCspReports(
      LEGACY,
      JSON.stringify({ "csp-report": { "violated-directive": "style-src-attr", "blocked-uri": "inline" } }),
    )!;
    expect(inline[0].blockedOrigin).toBe("inline");
    const junk = summarizeCspReports(
      LEGACY,
      JSON.stringify({
        "csp-report": { "violated-directive": "script-src", "blocked-uri": "data:text/html,stuff", "document-uri": "javascript:alert(1)" },
      }),
    )!;
    expect(junk[0].blockedOrigin).toBe("");
    expect(junk[0].documentPath).toBe("");
  });
});
