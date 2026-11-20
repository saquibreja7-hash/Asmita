import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";

/*
 * The organization section's index (docs/org/spec.md, WP56). Each target
 * page checks its own permission, so this page lists only what the
 * signed-in role may open; a role with neither content nor outreach sees
 * the refusal instead. There is deliberately no nav entry for /admin/org.
 */

type IndexLink = { href: string; label: string; line: string; outreach?: boolean };

const INDEX_LINKS: IndexLink[] = [
  {
    href: "/admin/org/posts",
    label: "Org posts",
    line: "News, case studies, policy papers, campaigns, research, lab notes and press releases.",
  },
  {
    href: "/admin/org/submissions",
    label: "Outreach inbox",
    line: "Volunteer applications, training requests and partner inquiries.",
    outreach: true,
  },
  { href: "/admin/org/jobs", label: "Org jobs", line: "Open roles; people apply by email, and no applications are stored." },
  { href: "/admin/org/events", label: "Org events", line: "Training and workshop sessions, online and in person." },
  {
    href: "/admin/org/partners",
    label: "Org partners",
    line: "The partner list on /partners; partners appear once they are marked public.",
  },
  {
    href: "/admin/org/newsletter",
    label: "Newsletter",
    line: "The subscriber list and its CSV export. Newsletters are sent from an external tool for now; this page only manages the list.",
    outreach: true,
  },
];

export default async function OrgIndexPage() {
  const [content, outreach] = await Promise.all([
    requireAdminPermission("content:manage"),
    requireAdminPermission("outreach:manage"),
  ]);
  const allowed = INDEX_LINKS.filter((link) => (link.outreach ? outreach.ok : content.ok));
  if (allowed.length === 0) {
    return (
      <section>
        <p className="eyebrow">Console</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot manage org content or outreach.</p>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Organization pages</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        The public organization pages and the forms that reach us. Each page below keeps its own list, and every change
        is recorded.
      </p>
      <ul className="mt-6 grid gap-4">
        {allowed.map((link) => (
          <li className="a-card p-5" key={link.href}>
            <h2 className="text-[17px] font-semibold">
              <Link href={link.href}>{link.label}</Link>
            </h2>
            <p className="muted mt-2 text-sm">{link.line}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
