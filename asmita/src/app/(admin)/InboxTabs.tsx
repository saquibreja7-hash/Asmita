import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { hasAdminPermission, type AdminPermission } from "@/lib/auth/admin-permissions";

/*
 * The Inbox: one place for everything that waits on a person. "Review one at
 * a time" is the queue console (/admin/review); the other tabs are the full
 * lists, for searching and bulk work. Each list keeps its own address so
 * links and bookmarks still work; the menu shows only "Inbox".
 */

const TABS: { key: string; href: string; label: string; permission: AdminPermission | null }[] = [
  { key: "review", href: "/admin/review", label: "Review one at a time", permission: null },
  { key: "flagged", href: "/admin/queue", label: "Flagged links", permission: "cases:read" },
  { key: "new-links", href: "/admin/new-links", label: "New links", permission: "cases:read" },
  { key: "hashes", href: "/admin/hashes", label: "Fingerprints", permission: "cases:read" },
  { key: "findings", href: "/admin/findings", label: "Crawler findings", permission: "findings:review" },
];

export async function InboxTabs({ current }: { current: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) return null;
  const tabs = TABS.filter((tab) => !tab.permission || hasAdminPermission(auth.session.adminRole, tab.permission));
  return (
    <nav aria-label="Inbox" className="a-tabs">
      <p className="eyebrow">Inbox</p>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={tab.key === current ? "page" : undefined}
              className={tab.key === current ? "a-tab a-tab-current" : "a-tab"}
              prefetch={false}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
