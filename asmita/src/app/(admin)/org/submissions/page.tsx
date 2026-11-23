import { deniedFor } from "../../page-permission";
import { ORG_FORMS, ORG_SUBMISSION_KINDS, ORG_SUBMISSION_STATUSES, listOrgSubmissions } from "@/lib/org-submissions";
import { SubmissionsManager, type SubmissionItem } from "./SubmissionsManager";

/*
 * The outreach inbox (docs/org/spec.md, 56.2). The page reads every
 * submission through the store and hands each one to the manager with its
 * detail rows already computed: the form registry lives in a server module,
 * so the client only ever sees plain rows. The manager filters by tab and
 * status, and notes and status changes go through the API with a refresh.
 */

export default async function OrgSubmissionsPage() {
  const denied = await deniedFor("outreach:manage");
  if (denied) return denied;

  const rows = await listOrgSubmissions();
  const items: SubmissionItem[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    contact: String(row.payload.name ?? row.payload.contactName ?? row.payload.organizationName ?? ""),
    email: row.email,
    internalNotes: row.internalNotes,
    detailRows: ORG_FORMS[row.kind].detailRows(row.payload),
  }));

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Outreach inbox</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        Volunteer applications, training requests and partner inquiries, newest first. Replies go out from the team
        inbox; closing a record starts its retention clock.
      </p>
      <div className="mt-6">
        <SubmissionsManager
          items={items}
          statuses={[...ORG_SUBMISSION_STATUSES]}
          tabs={ORG_SUBMISSION_KINDS.map((kind) => ({ kind, title: ORG_FORMS[kind].adminTitle }))}
        />
      </div>
    </section>
  );
}
