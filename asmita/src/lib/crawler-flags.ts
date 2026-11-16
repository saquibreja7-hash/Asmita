/*
 * The one place CRAWLER_SHOW_FINDINGS_TO_SURVIVOR is read. A deployment
 * switch, not a dev bypass (like ENABLE_CRAWLER in crawler-auth.ts), and
 * deliberately free of imports so client-safe modules can use it.
 *
 * On unless set to "false": whether the survivor sees the websites where
 * Asmita's search found copies is an open owner decision (ADR 006). Off, the
 * survivor-facing case reads (getCaseForUser, listCasesForUser, the link
 * report echo) omit crawler-found links entirely, and her link actions
 * (mark removed, platform filed, sign, preview) answer a crawler link's id as
 * if it were not on her case (case-ops survivorMayActOnLink). On, she may
 * mark a crawler link removed or filed; she never signs one. Admin views and her own
 * data export are not affected: the export is her right of access.
 */
export function crawlerFindingsVisibleToSurvivor(env: Record<string, string | undefined> = process.env) {
  return env.CRAWLER_SHOW_FINDINGS_TO_SURVIVOR !== "false";
}
