import type { AdminPermission } from "@/lib/auth/admin-permissions";

export type AdminNavItem = { href: string; label: string; permission: AdminPermission | null };
export type AdminNavGroup = { heading: string | null; items: AdminNavItem[] };

// The console's sections and what each needs. Pages check the same
// permission, so a link is hidden exactly when its page would refuse.
export const ADMIN_NAV: AdminNavGroup[] = [
  { heading: null, items: [{ href: "/admin", label: "Needs action", permission: null }] },
  {
    heading: "Work",
    items: [
      { href: "/admin/cases", label: "Cases", permission: "cases:read" },
      { href: "/admin/new-links", label: "New links", permission: "cases:read" },
      { href: "/admin/queue", label: "Flagged links", permission: "cases:read" },
      { href: "/admin/hashes", label: "Fingerprints", permission: "cases:read" },
      { href: "/admin/findings", label: "Findings", permission: "findings:review" },
      { href: "/admin/crawler", label: "Crawler overview", permission: "findings:review" },
    ],
  },
  {
    heading: "Directory",
    items: [
      { href: "/admin/platforms", label: "Platforms", permission: "platforms:edit" },
      { href: "/admin/partners", label: "Platform partners", permission: "platforms:edit" },
      { href: "/admin/templates", label: "Templates", permission: "templates:edit" },
      { href: "/admin/crawl-sources", label: "Crawler sites", permission: "crawler:manage" },
    ],
  },
  {
    heading: "Organization",
    items: [
      { href: "/admin/org/posts", label: "Org posts", permission: "content:manage" },
      { href: "/admin/org/submissions", label: "Outreach inbox", permission: "outreach:manage" },
      { href: "/admin/org/jobs", label: "Org jobs", permission: "content:manage" },
      { href: "/admin/org/events", label: "Org events", permission: "content:manage" },
      { href: "/admin/org/partners", label: "Org partners", permission: "content:manage" },
      { href: "/admin/org/newsletter", label: "Newsletter", permission: "outreach:manage" },
    ],
  },
  {
    heading: "Insight",
    items: [
      { href: "/admin/metrics", label: "Response rates", permission: "metrics:read" },
      { href: "/admin/analytics", label: "Analytics", permission: "metrics:read" },
      { href: "/admin/milestones", label: "Milestones", permission: "metrics:read" },
    ],
  },
  { heading: "Oversight", items: [{ href: "/admin/audit", label: "Audit", permission: "audit:read" }] },
];
