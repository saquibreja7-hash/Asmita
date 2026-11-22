import Link from "next/link";
import { deniedFor } from "../page-permission";
import { listPartnerApplications } from "@/lib/platform-partners";
import { listPlatformPartners } from "@/lib/partner-admin";
import { PARTNER_INTERESTS, PLATFORM_TYPES, USER_BASES } from "@/lib/platform-partners-shared";
import { ApplicationsManager } from "./ApplicationsManager";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  ONBOARDED: "Onboarded",
  DECLINED: "Declined",
};

// Requests to join the platform partner programme, from /for-platforms.
// Business contacts only; reply to them from the team inbox.
export default async function PartnersPage() {
  const denied = await deniedFor("platforms:edit");
  if (denied) return denied;
  const rows = await listPartnerApplications();
  const partners = await listPlatformPartners();
  const fresh = rows.filter((row) => row.status === "NEW").length;

  return (
    <section>
      <p className="eyebrow">Console · Platform partners</p>
      <h1 className="mt-3">Requests to join the partner programme</h1>
      <p className="muted mt-3 text-sm">
        Platforms that asked to join from the public &ldquo;For platforms&rdquo; page, newest first
        {fresh > 0 ? `; ${fresh} not yet contacted` : ""}. Verify that the person speaks for the platform before sharing anything.
      </p>

      {rows.length === 0 ? (
        <p className="a-card mt-6 p-6 text-sm">No requests yet.</p>
      ) : (
        <>
          <ul className="mt-6 space-y-4">
            {rows.map((row) => (
              <li className="a-card p-5" key={row.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-semibold">
                    {row.platformName} <span className="muted font-mono text-sm font-normal">{row.websiteDomain}</span>
                  </h2>
                  <span className="text-sm">
                    {row.status === "NEW" ? <span className="a-count">New</span> : STATUS_LABEL[row.status] ?? row.status}
                    <span className="muted ml-3">{when(row.createdAt)}</span>
                  </span>
                </div>
                <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <Row label="Organisation" value={row.organisationName} />
                  <Row label="Kind" value={PLATFORM_TYPES[row.platformType] ?? row.platformType} />
                  <Row label="Users in India" value={USER_BASES[row.userBase] ?? row.userBase} />
                  <Row label="Contact" value={`${row.contactName}, ${row.contactRole}`} />
                  <Row label="Email" value={row.contactEmail} mono />
                  <Row label="Phone" value={row.contactPhone ?? "Not given"} />
                  <Row label="Wants" value={row.interests.map((key) => PARTNER_INTERESTS[key] ?? key).join("; ")} wide />
                  {row.message && <Row label="Message" value={row.message} wide />}
                </dl>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ApplicationsManager
              applications={rows.map((row) => ({
                id: row.id,
                platformName: row.platformName,
                websiteDomain: row.websiteDomain,
                status: row.status,
              }))}
            />
          </div>
        </>
      )}

      <h2 className="mt-12">Platform partners</h2>
      <p className="muted mt-2 max-w-2xl text-sm">
        Platforms onboarded into the programme, with the domains treated as theirs. A partner API key is issued on the
        partner&apos;s page and authenticates the future partner API; crawler monitoring of a partner&apos;s public
        pages starts only after its written permission is recorded there.
      </p>
      {partners.length === 0 ? (
        <p className="a-card mt-4 p-6 text-sm">No platform partners yet. Approving a request creates one.</p>
      ) : (
        <div className="a-card mt-4 overflow-hidden">
          <table className="a-table w-full text-left text-sm">
            <caption className="sr-only">Platform partners</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">Name</th>
                <th className="eyebrow" scope="col">Primary domain</th>
                <th className="eyebrow" scope="col">Extra domains</th>
                <th className="eyebrow" scope="col">Status</th>
                <th className="eyebrow" scope="col">Channel email</th>
                <th className="eyebrow" scope="col">Crawl permission</th>
                <th className="eyebrow" scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id}>
                  <td>{partner.name}</td>
                  <td className="font-mono">{partner.primaryDomain}</td>
                  <td className="tabular-nums">{partner.extraDomains.length}</td>
                  <td className="a-nowrap">
                    <span className={partner.status === "SUSPENDED" ? "text-[var(--danger)]" : undefined}>
                      {partner.status === "ACTIVE" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="break-all font-mono">{partner.channelEmail ?? "Not set"}</td>
                  <td className="a-nowrap tabular-nums">
                    {partner.crawlPermissionRecordedAt ? partner.crawlPermissionRecordedAt.slice(0, 10) : "Not recorded"}
                  </td>
                  <td className="a-nowrap">
                    <Link className="link-underline" href={`/admin/partners/${partner.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 whitespace-pre-wrap break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
