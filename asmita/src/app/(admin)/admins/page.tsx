import { requireAdminPermission } from "@/lib/auth/require-admin";
import { hasAdminPermission, ALL_ADMIN_PERMISSIONS, ALL_ADMIN_ROLES } from "@/lib/auth/admin-permissions";
import { anyAdminEmailByHash } from "@/lib/auth/admin-allowlist";
import { listAdminDirectory, maskAdminEmail } from "@/lib/admin-directory";
import { listReviewQueueAccess, listReviewQueues } from "@/lib/review-jobs";
import { formatIst } from "../cases/case-format";
import { AddAdminForm, AdminResetButton, AdminRoleControls, GrantAccessForm, RevokeAccessButton } from "./AdminsPanel";

export const dynamic = "force-dynamic";

// The Admins page (review-console-spec.md WP144), for users:manage admins.
// One row per allowlisted admin: masked address (a full email is never
// shown), the role as configured in ADMIN_ROLES (read-only — roles come
// from the environment, and this page deliberately does not invent a
// second source of truth), the MFA enrolment, the last sign-in from the
// audit trail, and the review queues the admin can reach. The MFA reset
// issues the same one-time enrolment code the existing reset route does,
// and queue access narrows who sees which queue. Nothing here touches a
// survivor or a case.

const KIND_LABELS: Record<string, string> = {
  FLAGGED_LINK: "Flagged links",
  FINGERPRINT: "Fingerprints",
  FINDING: "Crawler findings",
  PARTNER_APPLICATION: "Partner applications",
  LAB_REPORT: "Lab reports",
};

export default async function AdminsPage() {
  const auth = await requireAdminPermission("users:manage");
  if (!auth.ok) {
    return (
      <section>
        <p className="eyebrow">Console · Admins</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot manage admins.</p>
      </section>
    );
  }
  const canManageAccess = hasAdminPermission(auth.session.adminRole, "review:manage");

  const [admins, queues, accessRows] = await Promise.all([
    listAdminDirectory(),
    canManageAccess ? listReviewQueues() : Promise.resolve([]),
    canManageAccess ? listReviewQueueAccess() : Promise.resolve([]),
  ]);

  // Addresses for the access rows, from both admin sources (server side only).
  const emailByHash = new Map<string, string>();
  for (const row of accessRows) {
    const hash = row.adminEmailHash ?? "";
    if (hash && !emailByHash.has(hash)) {
      const email = await anyAdminEmailByHash(hash);
      if (email) emailByHash.set(hash, email);
    }
  }

  const accessQueues = queues
    .filter((queue) => queue.archivedAt === null && !queue.protected && queue.subjectKind !== null)
    .map((queue) => ({
      id: queue.id,
      name: queue.name,
      kindLabel: KIND_LABELS[queue.subjectKind ?? ""] ?? "Any kind",
      rows: accessRows
        .filter((row) => row.queueId === queue.id)
        .map((row) => ({
          id: row.id,
          label: row.role
            ? `Role: ${row.role.replaceAll("_", " ").toLowerCase()}`
            : emailByHash.get(row.adminEmailHash ?? "")
              ? `${maskAdminEmail(emailByHash.get(row.adminEmailHash ?? "")!)} (${(row.adminEmailHash ?? "").slice(0, 4)})`
              : `Reviewer ${(row.adminEmailHash ?? "").slice(0, 4)}`,
        })),
    }));

  const superAdmins = admins.filter((admin) => admin.role === "SUPER_ADMIN").length;

  // The grant form offers the allowlisted admins who can actually sign in.
  const adminOptions = admins
    .filter((admin) => admin.role !== null)
    .map((admin) => ({
      targetKey: admin.targetKey,
      maskedEmail: admin.maskedEmail,
      handle: admin.handle,
    }));

  return (
    <section>
      <p className="eyebrow">Console · Admins</p>
      <h1 className="mt-3">Admins</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        Add people here and give each one a role. Owners set in the server environment (ADMIN_EMAILS) are marked
        &quot;Owner&quot; and can only be changed there. Addresses are masked; a full address is never shown.
      </p>
      {superAdmins < 2 && (
        <p className="a-card mt-4 p-4 text-sm" role="note">
          <strong>Only one super admin.</strong> If they lose their authenticator, nobody can reset it from the
          console. Add a second super admin below, so either can reset the other. The last-resort recovery is the
          server script described in docs/ops/admin-recovery.md.
        </p>
      )}

      <div className="mt-6">
        <h2>Add an admin</h2>
        <AddAdminForm />
      </div>

      <div className="mt-10">
        <h2>Admins</h2>
        <ul className="a-card mt-4">
          {admins.map((admin) => (
            <li className="border-b border-[var(--line)] p-4 last:border-b-0" key={admin.targetKey}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono font-medium">
                  {admin.maskedEmail} <span className="muted text-xs">({admin.handle})</span>
                  {admin.source === "environment" && <span className="muted ml-2 text-xs">· Owner</span>}
                  {admin.emailHash === auth.session.emailHash && <span className="muted ml-2 text-xs">· You</span>}
                </p>
                <p className="muted text-xs">
                  {admin.role
                    ? admin.role.replaceAll("_", " ").toLowerCase()
                    : `no valid role (fix in ADMIN_ROLES: ${admin.roleProblem})`}
                </p>
              </div>
              <p className="muted mt-1 text-xs">
                MFA {admin.mfaEnrolled ? "enrolled" : "not enrolled"}
                {admin.lastSignInAt ? ` · last signed in ${formatIst(admin.lastSignInAt)} IST` : " · no sign-in recorded"}
              </p>
              <p className="muted mt-1 text-xs">
                {admin.role
                  ? admin.queueNames.length > 0
                    ? `Queues: ${admin.queueNames.join(", ")}`
                    : "No review queues"
                  : ""}
              </p>
              {admin.role && <AdminResetButton targetKey={admin.targetKey} maskedEmail={admin.maskedEmail} />}
              {admin.role && admin.source === "console" && admin.emailHash !== auth.session.emailHash && (
                <AdminRoleControls targetKey={admin.targetKey} maskedEmail={admin.maskedEmail} role={admin.role} />
              )}
            </li>
          ))}
          {admins.length === 0 && <li className="muted p-6 text-sm">No admins yet.</li>}
        </ul>
      </div>

      {canManageAccess && (
        <div className="mt-12">
          <h2 id="queue-access">Queue access</h2>
          <p className="muted mt-2 max-w-2xl text-sm">
            A queue with no rows is visible to every role with its kind&apos;s permission. Adding a row narrows it:
            only the listed roles and admins see the queue, can claim its items or act on them. The protected Possible
            minor queue ignores rows and stays SUPER_ADMIN only, and nothing here can ever widen it.
          </p>
          <div className="mt-4 grid gap-4" id="queue-access-list">
            {accessQueues.map((queue) => (
              <div className="a-card p-4" key={queue.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3>{queue.name}</h3>
                  <p className="muted text-xs">{queue.kindLabel}</p>
                </div>
                {queue.rows.length === 0 ? (
                  <p className="muted mt-2 text-sm">Everyone with the queue&apos;s permission. No rows.</p>
                ) : (
                  <ul className="mt-2 grid gap-1 text-sm">
                    {queue.rows.map((row) => (
                      <li className="flex flex-wrap items-baseline justify-between gap-2" key={row.id}>
                        <span>{row.label}</span>
                        <RevokeAccessButton accessId={row.id} queueId={queue.id} />
                      </li>
                    ))}
                  </ul>
                )}
                <GrantAccessForm
                  adminOptions={adminOptions.map((admin) => ({
                    targetKey: admin.targetKey,
                    maskedEmail: `${admin.maskedEmail} (${admin.handle})`,
                  }))}
                  queueId={queue.id}
                  queueName={queue.name}
                  roleOptions={[...ALL_ADMIN_ROLES]}
                />
              </div>
            ))}
            {accessQueues.length === 0 && <p className="muted text-sm">No queues.</p>}
          </div>
        </div>
      )}

      <div className="mt-12">
        <h2 id="permissions">Permissions</h2>
        <p className="muted mt-2 max-w-2xl text-sm">
          What each role can do, generated from the console&apos;s permission map (admin-permissions.ts). Read-only.
        </p>
        <div className="a-card mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Each admin role&apos;s permissions, from the permission map</caption>
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="eyebrow p-4" scope="col">
                  Permission
                </th>
                {ALL_ADMIN_ROLES.map((role) => (
                  <th className="eyebrow p-4" key={role} scope="col">
                    {role.replaceAll("_", " ").toLowerCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_ADMIN_PERMISSIONS.map((permission) => (
                <tr className="border-t border-[var(--line)]" key={permission}>
                  <td className="font-mono p-4 text-xs">{permission}</td>
                  {ALL_ADMIN_ROLES.map((role) => {
                    const allowed = hasAdminPermission(role, permission);
                    return (
                      <td className="p-4" key={role}>
                        {allowed ? (
                          "Yes"
                        ) : (
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">no</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
