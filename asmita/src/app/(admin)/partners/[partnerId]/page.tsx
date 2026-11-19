import Link from "next/link";
import { notFound } from "next/navigation";
import { deniedFor } from "../../page-permission";
import { getPlatformPartner, listPlatformPartnerKeys } from "@/lib/partner-admin";
import { PartnerManager } from "./PartnerManager";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

// One platform partner from the programme. Business contact data only — this
// page never reads anything survivor-related.
export default async function PartnerDetailPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const denied = await deniedFor("platforms:edit");
  if (denied) return denied;
  const { partnerId } = await params;
  const partner = await getPlatformPartner(partnerId);
  if (!partner) notFound();
  const keys = await listPlatformPartnerKeys(partnerId);

  return (
    <section>
      <Link className="link-underline text-sm" href="/admin/partners">
        Back to platform partners
      </Link>
      <div className="mt-6">
        <p className="eyebrow">Console · Platform partners</p>
        <h1 className="mt-3">{partner.name}</h1>
      </div>

      <dl className="a-card mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-4 text-sm">
        <dt className="muted">Status</dt>
        <dd>{partner.status === "ACTIVE" ? "Active" : <span className="text-[var(--danger)]">Suspended</span>}</dd>
        <dt className="muted">Created</dt>
        <dd className="tabular-nums">{when(partner.createdAt)}</dd>
        {partner.createdFromApplicationId && (
          <>
            <dt className="muted">From application</dt>
            <dd className="break-all font-mono">{partner.createdFromApplicationId}</dd>
          </>
        )}
        <dt className="muted">Channel email</dt>
        <dd className="break-all font-mono">{partner.channelEmail ?? "Not set"}</dd>
        <dt className="muted">Crawl permission</dt>
        <dd>
          {partner.crawlPermissionRecordedAt
            ? `Recorded ${partner.crawlPermissionRecordedAt.slice(0, 10)} by ${partner.crawlPermissionRecordedById}${
                partner.crawlPermissionNote ? ` — ${partner.crawlPermissionNote}` : ""
              }`
            : "Not recorded"}
        </dd>
      </dl>

      <div className="mt-6">
        <PartnerManager keys={keys} partner={partner} />
      </div>
    </section>
  );
}
