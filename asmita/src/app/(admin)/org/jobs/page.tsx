import { deniedFor } from "../../page-permission";
import { ORG_JOB_STATUSES, ORG_JOB_TYPES } from "@/lib/org-jobs";
import { JobsManager } from "./JobsManager";

// Job openings admin (docs/org/spec.md, 56.5). The manager owns the list and
// talks to /api/admin/org/jobs directly: create and edit as drafts, then
// open or close the listing. People apply by email; nothing is stored.
export default async function OrgJobsPage() {
  const denied = await deniedFor("content:manage");
  if (denied) return denied;

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Org jobs</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        Open roles on the careers page. A job starts as a draft; open it when the listing should accept applications by
        email, close it when the role is filled.
      </p>
      <div className="mt-6">
        <JobsManager statuses={[...ORG_JOB_STATUSES]} types={[...ORG_JOB_TYPES]} />
      </div>
    </section>
  );
}
