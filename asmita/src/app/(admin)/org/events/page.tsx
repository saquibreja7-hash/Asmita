import { deniedFor } from "../../page-permission";
import { ORG_EVENT_MODES, ORG_EVENT_STATUSES } from "@/lib/org-events";
import { EventsManager } from "./EventsManager";

// Training events admin (docs/org/spec.md, 56.6). The manager owns the list
// and talks to /api/admin/org/events directly: create and edit as drafts,
// then publish or cancel. Published sessions appear on the public pages.
export default async function OrgEventsPage() {
  const denied = await deniedFor("content:manage");
  if (denied) return denied;

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Org events</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        Training and workshop sessions. An event starts as a draft; publishing it puts it on the training page until its
        start time passes, and cancelling takes it down with its history kept.
      </p>
      <div className="mt-6">
        <EventsManager modes={[...ORG_EVENT_MODES]} statuses={[...ORG_EVENT_STATUSES]} />
      </div>
    </section>
  );
}
