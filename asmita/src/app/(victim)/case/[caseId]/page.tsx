import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { cases, deactivatedUsers } from "@/lib/store";

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const record = cases.get(caseId);
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Case dashboard</p>
        {!record ? (
          <div className="panel mt-8 max-w-2xl p-6">
            <h1 className="text-3xl font-black">We could not find this case.</h1>
            <p className="muted mt-3 leading-7">
              Check the dashboard link from your email or verify your email again to list your cases.
            </p>
            <Link className="btn btn-primary mt-6" href="/register">
              Verify email
            </Link>
          </div>
        ) : deactivatedUsers.has(record.userId) ? (
          <div className="panel mt-8 max-w-2xl p-6">
            <h1 className="text-3xl font-black">Deletion is scheduled for this case.</h1>
            <p className="muted mt-3 leading-7">
              Case access is paused while the 30-day hard deletion window is active.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-3 text-4xl font-black">{record.referenceNumber}</h1>
            <p className="muted mt-3">
              Created {new Date(record.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            </p>
            {record.urls.length === 0 ? (
              <div className="panel mt-8 max-w-2xl p-6">
                <h2 className="text-2xl font-black">No URLs have been added yet.</h2>
                <p className="muted mt-3">Add links as text when you are ready. The app will not open them.</p>
              </div>
            ) : (
              <div className="mt-8 overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-[var(--teal-soft)]">
                    <tr>
                      <th className="p-4">Platform</th>
                      <th className="p-4">Domain</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.urls.map((url) => (
                      <tr className="border-t border-[var(--border)]" key={url.id}>
                        <td className="p-4 font-bold">
                          <Link href={`/case/${record.id}/url/${url.id}`}>{url.platformName}</Link>
                        </td>
                        <td className="p-4">{url.domain}</td>
                        <td className="p-4">{url.status.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn btn-primary" href="/submit">
                Add more URLs
              </Link>
              <Link className="btn btn-secondary" href={`/api/cases/${record.id}/audit-trail`}>
                View audit trail
              </Link>
              <Link className="btn btn-secondary" href={`/api/cases/${record.id}/export`}>
                Download case PDF
              </Link>
              <Link className="btn btn-secondary" href="/delete-account">
                Request deletion
              </Link>
              <Link className="btn btn-secondary" href="/resources">
                Support resources
              </Link>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
