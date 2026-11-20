import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_NAV } from "@/app/(admin)/admin-nav";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";

// Where each nav link's page lives under src/app/(admin).
const PAGE_FILES: Record<string, string> = {
  "/admin/cases": "cases/page.tsx",
  "/admin/new-links": "new-links/page.tsx",
  "/admin/queue": "flagged/page.tsx",
  "/admin/hashes": "hashes/page.tsx",
  "/admin/findings": "findings/page.tsx",
  "/admin/crawler": "crawler/page.tsx",
  "/admin/crawl-sources": "crawl-sources/page.tsx",
  "/admin/platforms": "platforms/page.tsx",
  "/admin/partners": "partners/page.tsx",
  "/admin/templates": "templates/page.tsx",
  "/admin/org/posts": "org/posts/page.tsx",
  "/admin/org/submissions": "org/submissions/page.tsx",
  "/admin/org/jobs": "org/jobs/page.tsx",
  "/admin/org/events": "org/events/page.tsx",
  "/admin/org/newsletter": "org/newsletter/page.tsx",
  "/admin/metrics": "response-rates/page.tsx",
  "/admin/analytics": "analytics/page.tsx",
  "/admin/milestones": "milestones/page.tsx",
  "/admin/audit": "audit/page.tsx",
};

const items = ADMIN_NAV.flatMap((group) => group.items);

function visibleFor(role: AdminRole) {
  return items.filter((item) => !item.permission || hasAdminPermission(role, item.permission)).map((item) => item.label);
}

describe("admin nav and page permissions", () => {
  it("hides a link exactly when its page refuses the role", () => {
    for (const item of items.filter((entry) => entry.permission)) {
      const source = readFileSync(join(process.cwd(), "src/app/(admin)", PAGE_FILES[item.href]), "utf8");
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
