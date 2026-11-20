import { deniedFor } from "../../page-permission";
import { newsletterCounts } from "@/lib/org-newsletter";

// The newsletter list (docs/org/spec.md, 56.7): counts by state and the
// confirmed-subscribers CSV for the external sending tool. Sign-ups are
// double opt-in and addresses are encrypted at rest; this page only reads.
export default async function OrgNewsletterPage() {
  const denied = await deniedFor("outreach:manage");
  if (denied) return denied;

  const counts = await newsletterCounts();

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Newsletter</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        Subscribers by state. Sign-ups confirm by email before they count as confirmed, and anyone can unsubscribe with
        the link in every issue.
      </p>

      <div className="a-card mt-6 p-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Count label="Pending confirmation" value={counts.pending} />
          <Count label="Confirmed" value={counts.confirmed} />
          <Count label="Unsubscribed" value={counts.unsubscribed} />
          <Count label="Total" value={counts.total} />
        </dl>
        {/* A download: a GET without a CSRF token, like the submissions export. */}
        <a className="btn btn-secondary mt-6" href="/api/admin/org/newsletter/export">
          Download confirmed subscribers (CSV)
        </a>
        <p className="muted mt-4 text-sm">Newsletters are sent from an external tool for now; this page only manages the list.</p>
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 tabular-nums">{value}</dd>
    </div>
  );
}
