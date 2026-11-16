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
 * if it were not on her case (survivorMayActOnLink below). On, she may
 * mark a crawler link removed or filed; she never signs one. Admin views and her own
 * data export are not affected: the export is her right of access.
 */
export function crawlerFindingsVisibleToSurvivor(env: Record<string, string | undefined> = process.env) {
  return env.CRAWLER_SHOW_FINDINGS_TO_SURVIVOR !== "false";
}

/**
 * Which of her case's links a survivor may act on. With crawler findings
 * hidden from her a crawler-found link behaves exactly as if it did not exist:
 * the same "url_not_found" as an id from another case. With them shown she
 * may mark one removed or filed (she never signs one).
 */
export function survivorMayActOnLink(url: { source?: string | null }): boolean {
  return crawlerFindingsVisibleToSurvivor() || url.source !== "CRAWLER";
}

/** The Prisma filter for survivorMayActOnLink. */
export function survivorActableLinkWhere(): { source?: "SURVIVOR" } {
  return crawlerFindingsVisibleToSurvivor() ? {} : { source: "SURVIVOR" };
}
