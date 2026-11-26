import type { AdminPermission } from "@/lib/auth/admin-permissions";

/**
 * One menu entry. `also` lists other pages that belong to it, so the entry
 * stays highlighted there (the Inbox's list tabs).
 */
export type AdminNavItem = { href: string; label: string; permission: AdminPermission | null; also?: string[] };
export type AdminNavGroup = { heading: string | null; items: AdminNavItem[] };

// The console's sections and what each needs. Pages check the same
// permission, so a link is hidden exactly when its page would refuse.
// Five groups (owner audit, 2026-11-26): the daily work first, then the
// directory, the organization pages, reports, and settings.
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    heading: null,
    items: [
      { href: "/admin", label: "Needs action", permission: null },
      // Every admin role can see at least one queue (the page filters rows
      // by queue), so the link carries no single permission. The Inbox's
      // tabs (InboxTabs.tsx) lead to the full lists.
      {
        href: "/admin/review",
        label: "Inbox",
        permission: null,
        also: ["/admin/queue", "/admin/new-links", "/admin/hashes", "/admin/findings"],
      },
      { href: "/admin/cases", label: "Cases", permission: "cases:read" },
    ],
  },
  {
    heading: "Directory",
    items: [
      { href: "/admin/platforms", label: "Platforms", permission: "platforms:edit" },
      { href: "/admin/partners", label: "Platform partners", permission: "platforms:edit" },
      { href: "/admin/templates", label: "Templates", permission: "templates:edit" },
      { href: "/admin/crawler", label: "Crawler", permission: "findings:review" },
      { href: "/admin/crawl-sources", label: "Crawler sites", permission: "crawler:manage" },
    ],
  },
  {
    heading: "Organization",
    items: [
      { href: "/admin/org/posts", label: "Posts", permission: "content:manage" },
      { href: "/admin/org/submissions", label: "Outreach inbox", permission: "outreach:manage" },
      { href: "/admin/org/jobs", label: "Jobs", permission: "content:manage" },
      { href: "/admin/org/events", label: "Events", permission: "content:manage" },
      { href: "/admin/org/partners", label: "Partners", permission: "content:manage" },
      { href: "/admin/org/newsletter", label: "Newsletter", permission: "outreach:manage" },
      { href: "/admin/org/scorecard", label: "Scorecard", permission: "content:manage" },
    ],
  },
  {
    heading: "Reports",
    items: [
      { href: "/admin/metrics", label: "Response rates", permission: "metrics:read" },
      { href: "/admin/analytics", label: "Analytics", permission: "metrics:read" },
      { href: "/admin/milestones", label: "Milestones", permission: "metrics:read" },
      // WP145: review metrics (metrics:read) and the decisions log (audit:read).
      { href: "/admin/review/metrics", label: "Review metrics", permission: "metrics:read" },
      { href: "/admin/review/decisions", label: "Decisions log", permission: "audit:read" },
      { href: "/admin/audit", label: "Audit log", permission: "audit:read" },
    ],
  },
  {
    heading: "Settings",
    items: [
      // Admins and queue access (WP144): users:manage, the owner alone today.
      { href: "/admin/admins", label: "Admins", permission: "users:manage" },
      // Routing rules and custom queues (WP143) and reasons (WP142): review:manage.
      { href: "/admin/review/rules", label: "Routing rules", permission: "review:manage" },
      { href: "/admin/review/settings", label: "Review settings", permission: "review:manage" },
      { href: "/admin/lab", label: "AI Lab", permission: "lab:manage" },
      { href: "/admin/lab/registry", label: "Lab services", permission: "lab:manage" },
      { href: "/admin/lab/providers", label: "Lab providers", permission: "lab:manage" },
    ],
  },
];
