import { deniedFor } from "../../page-permission";
import { ScorecardManager } from "./ScorecardManager";

// Platform scorecard admin (docs/org/spec.md, WP58): the quarterly snapshot
// of how platforms respond to our notices. A snapshot starts as a DRAFT the
// cron (or the button) computes; this page is the data-quality check before
// public numbers go out — review the table, add the methodology note, then
// publish.
export default async function OrgScorecardPage() {
  const denied = await deniedFor("content:manage");
  if (denied) return denied;

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Platform scorecard</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        Aggregate numbers about how platforms respond to our takedown notices, one snapshot per calendar quarter.
        A snapshot is a draft until you publish it; a published snapshot is the record and is never recomputed.
      </p>
      <div className="mt-6">
        <ScorecardManager />
      </div>
    </section>
  );
}
