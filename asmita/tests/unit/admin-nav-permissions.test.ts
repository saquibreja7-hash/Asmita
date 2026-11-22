import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_NAV } from "@/app/(admin)/admin-nav";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";

// Where each nav link's page lives under src/app. Console pages live in the
// (admin) group with a same-path re-export under src/app/admin; the Lab
// pages are the exception (a (admin)/lab page would collide with the public
// /lab route), so they live directly under src/app/admin/lab.
const PAGE_FILES: Record<string, string> = {
  "/admin/cases": "(admin)/cases/page.tsx",
  "/admin/new-links": "(admin)/new-links/page.tsx",
  "/admin/queue": "(admin)/flagged/page.tsx",
  "/admin/hashes": "(admin)/hashes/page.tsx",
  "/admin/findings": "(admin)/findings/page.tsx",
  "/admin/crawler": "(admin)/crawler/page.tsx",
  "/admin/crawl-sources": "(admin)/crawl-sources/page.tsx",
  "/admin/platforms": "(admin)/platforms/page.tsx",
  // Renamed to platform-partners on this branch (WP57); master's re-export
  // under src/app/admin/partners points at the same file.
  "/admin/partners": "(admin)/platform-partners/page.tsx",
  "/admin/templates": "(admin)/templates/page.tsx",
  "/admin/org/posts": "(admin)/org/posts/page.tsx",
  "/admin/org/submissions": "(admin)/org/submissions/page.tsx",
  "/admin/org/jobs": "(admin)/org/jobs/page.tsx",
  "/admin/org/events": "(admin)/org/events/page.tsx",
  "/admin/org/partners": "(admin)/org/partners/page.tsx",
  "/admin/org/newsletter": "(admin)/org/newsletter/page.tsx",
  "/admin/org/scorecard": "(admin)/org/scorecard/page.tsx",
  "/admin/metrics": "(admin)/response-rates/page.tsx",
  "/admin/analytics": "(admin)/analytics/page.tsx",
  "/admin/milestones": "(admin)/milestones/page.tsx",
  "/admin/audit": "(admin)/audit/page.tsx",
  "/admin/lab": "admin/lab/page.tsx",
  "/admin/lab/registry": "admin/lab/registry/page.tsx",
  "/admin/lab/providers": "admin/lab/providers/page.tsx",
};

const items = ADMIN_NAV.flatMap((group) => group.items);

function visibleFor(role: AdminRole) {
  return items.filter((item) => !item.permission || hasAdminPermission(role, item.permission)).map((item) => item.label);
}

describe("admin nav and page permissions", () => {
  it("hides a link exactly when its page refuses the role", () => {
    for (const item of items.filter((entry) => entry.permission)) {
      const source = readFileSync(join(process.cwd(), "src/app", PAGE_FILES[item.href]), "utf8");
      const required = source.match(/(?:deniedFor|adminFor|requireAdminPermission)\("([a-z:]+)"\)/)?.[1];
      expect(required, item.href).toBe(item.permission);
    }
  });

  it("shows each role only its own work", () => {
    expect(visibleFor("SUPER_ADMIN")).toHaveLength(items.length);
    expect(visibleFor("GO_EDITOR")).toEqual(["Needs action", "Platforms", "Platform partners", "Response rates", "Analytics", "Milestones", "Audit"]);
    expect(visibleFor("SUPPORT_AGENT")).toEqual(["Needs action", "Cases", "New links", "Flagged links", "Fingerprints"]);
    expect(visibleFor("LEGAL_ADVISOR")).toEqual(["Needs action", "Cases", "New links", "Flagged links", "Fingerprints", "Templates", "Audit"]);
  });
});
