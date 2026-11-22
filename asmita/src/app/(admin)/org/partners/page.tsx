import { deniedFor } from "../../page-permission";
import { ORG_PARTNER_TYPES } from "@/lib/org-partners";
import { PartnersManager } from "./PartnersManager";

// Organization partners admin (docs/org/spec.md, 57.3): the 'Current
// partners' list on /partners. Partners are created here, never by the
// public; a partner shows on the site only while it is marked public.
export default async function OrgPartnersPage() {
  const denied = await deniedFor("content:manage");
  if (denied) return denied;

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Org partners</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        The partners shown on /partners. Create a partner, keep it hidden while the details are agreed, then show it
        once the partner agrees to be listed.
      </p>
      <div className="mt-6">
        <PartnersManager types={[...ORG_PARTNER_TYPES]} />
      </div>
    </section>
  );
}
