import { createAdminIdentity, listAllowlistedAdminEmails, resolveAdminRole } from "@/lib/auth/admin-allowlist";
import type { AdminRole } from "@/lib/auth/admin-permissions";
import { getAdminMfaEnrolment } from "@/lib/auth/admin-mfa-store";
import { readAuditTrailForEntities } from "@/lib/audit";
import {
  canSeeReviewQueueWithRows,
  listReviewQueueAccess,
  listReviewQueues,
} from "@/lib/review-jobs";

/*
 * The Admins page's directory (review-console-spec.md WP144). The one source
 * of admins is the allowlist (ADMIN_EMAILS): an admin who is not on it
 * cannot sign in, and the schema's AdminProfile rows are never written by
 * any code path (ADR 005), so they carry nothing to list. Roles come from
 * ADMIN_ROLES and are shown read-only; there is deliberately no role-change
 * action, because no database source of roles exists to change (the decision
 * is recorded in the WP144 progress entry).
 *
 * No full email address ever leaves this module: the page renders the masked
 * form and the email hash, and the MFA reset route resolves the hash back
 * to the address on the server.
 */

export type AdminDirectoryRow = {
  /** The admin's email hash: the id every console row already uses. */
  emailHash: string;
  /** Short handle from the hash, so two admins with the same mask differ. */
  handle: string;
  /** Masked address for display: "o*****@example.org", never the full one. */
  maskedEmail: string;
  role: AdminRole | null;
  /** Why the role could not be resolved, when it cannot be (config problem). */
  roleProblem: "role_missing" | "role_unknown" | null;
  mfaEnrolled: boolean;
  /** Last successful sign-in, from the audit trail; null when none is recorded. */
  lastSignInAt: string | null;
  /** The review queues this admin can reach, by name. */
  queueNames: string[];
};

/** Masks an email for display: first character, stars, the domain. */
export function maskAdminEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "(address not understood)";
  const shown = local[0]!;
  return `${shown}${"*".repeat(5)}@${domain}`;
}

/**
 * One row per allowlisted admin. Each row carries only the hash, the masked
 * address, the role, the MFA state, the last sign-in and the reachable
 * queue names — no address, nothing about a survivor.
 */
export async function listAdminDirectory(): Promise<AdminDirectoryRow[]> {
  const emails = listAllowlistedAdminEmails();
  const identities = emails.map((email) => ({ email, ...createAdminIdentity(email) }));

  const [queues, accessRows, signIns] = await Promise.all([
    listReviewQueues(),
    listReviewQueueAccess(),
    readAuditTrailForEntities(identities.map((identity) => identity.id), 500),
  ]);
  const visibleQueues = queues.filter((queue) => queue.archivedAt === null);

  const rows: AdminDirectoryRow[] = [];
  for (const identity of identities) {
    const resolution = resolveAdminRole(identity.email);
    const role = resolution.ok ? resolution.role : null;
    const roleProblem = resolution.ok ? null : resolution.reason === "role_missing" ? "role_missing" : "role_unknown";
    const enrolment = await getAdminMfaEnrolment(identity.emailHash);
    const lastSignIn = signIns
      .filter((event) => event.eventType === "ADMIN_ACTION" && (event.data as { action?: string } | undefined)?.action === "ADMIN_LOGIN")
      .filter((event) => event.actorId === identity.id)
      .at(-1);
    const viewer = { role: role ?? "SUPPORT_AGENT", emailHash: identity.emailHash };
    const queueNames = role
      ? visibleQueues
          .filter((queue) =>
            canSeeReviewQueueWithRows(viewer, queue, accessRows.filter((row) => row.queueId === queue.id)),
          )
          .map((queue) => queue.name)
      : [];
    rows.push({
      emailHash: identity.emailHash,
      handle: identity.emailHash.slice(0, 4),
      maskedEmail: maskAdminEmail(identity.email),
      role,
      roleProblem,
      mfaEnrolled: enrolment !== null,
      lastSignInAt: lastSignIn ? new Date(lastSignIn.createdAt).toISOString() : null,
      queueNames,
    });
  }
  return rows;
}
