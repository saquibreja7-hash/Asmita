import type { AdminPermission } from "@/lib/auth/admin-permissions";

export type AdminNavItem = { href: string; label: string; permission: AdminPermission | null };
export type AdminNavGroup = { heading: string | null; items: AdminNavItem[] };

// The console's sections and what each needs. Pages check the same
// permission, so a link is hidden exactly when its page would refuse.
export const ADMIN_NAV: AdminNavGroup[] = [
  { heading: null, items: [{ href: "/admin", label: "Needs action", permission: null }] },
  {
    heading: "Review",
    items: [
      // Every admin role can see at least one queue (the page filters rows
      // by queue), so the link carries no single permission.
      { href: "/admin/review", label: "Review", permission: null },
      // WP145: the decisions log (audit:read) and the metrics page
      // (metrics:read).
      { href: "/admin/review/decisions", label: "Decisions log", permission: "audit:read" },
      { href: "/admin/review/metrics", label: "Review metrics", permission: "metrics:read" },
      // Routing rules and custom queues (WP143): the owner only.
      { href: "/admin/review/rules", label: "Routing rules", permission: "review:manage" },
      // The internal reasons (WP142); review:manage from WP144 on.
      { href: "/admin/review/settings", label: "Review settings", permission: "review:manage" },
    ],
  },
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
    heading: "Insight",
    items: [
      { href: "/admin/metrics", label: "Response rates", permission: "metrics:read" },
      { href: "/admin/analytics", label: "Analytics", permission: "metrics:read" },
      { href: "/admin/milestones", label: "Milestones", permission: "metrics:read" },
    ],
  },
  {
    heading: "Lab",
    items: [{ href: "/admin/lab", label: "AI Lab", permission: "lab:manage" }],
  },
  { heading: "Oversight", items: [
    { href: "/admin/audit", label: "Audit", permission: "audit:read" },
    // Admins and queue access (WP144): users:manage, the owner alone today.
    { href: "/admin/admins", label: "Admins", permission: "users:manage" },
  ] },
];
