import type { MessageKey } from "@/lib/i18n";

/*
 * WP96 (docs/lab/beta-spec.md): the Lab hub's list of beta tools, in the
 * spec's order (trace, detectors, protect, tracker, message check, stamp,
 * spot the fake). One list in one place so the /lab page, the unit test and
 * the sitemap agree on what exists: the hub renders one card per entry, and
 * tests/unit/lab-hub.test.ts checks every route against the page files, the
 * i18n dictionaries and the sitemap/nav contract.
 *
 * The card copy lives in i18n (`lab.tools.<tool>.name` / `.line`) like every
 * other user-facing string on the hub; only the routes and key names are
 * code. Nothing here is complaint-workflow code (charter's boundary).
 */

export type LabBetaTool = {
  /** The tool's page route. */
  href: string;
  /** i18n key for the card's short name (also its link text). */
  nameKey: MessageKey;
  /** i18n key for the card's one line on what the tool does. */
  lineKey: MessageKey;
};

export const LAB_BETA_TOOLS: readonly LabBetaTool[] = [
  { href: "/lab/trace", nameKey: "lab.tools.trace.name", lineKey: "lab.tools.trace.line" },
  { href: "/lab/detectors", nameKey: "lab.tools.detectors.name", lineKey: "lab.tools.detectors.line" },
  { href: "/lab/protect", nameKey: "lab.tools.protect.name", lineKey: "lab.tools.protect.line" },
  { href: "/lab/tracker", nameKey: "lab.tools.tracker.name", lineKey: "lab.tools.tracker.line" },
  { href: "/lab/message-check", nameKey: "lab.tools.message-check.name", lineKey: "lab.tools.message-check.line" },
  { href: "/lab/stamp", nameKey: "lab.tools.stamp.name", lineKey: "lab.tools.stamp.line" },
  { href: "/lab/spot-the-fake", nameKey: "lab.tools.spot-the-fake.name", lineKey: "lab.tools.spot-the-fake.line" },
] as const;

/** The hub section's own strings (heading, note and the shared Beta badge). */
export const LAB_HUB_KEYS = {
  title: "lab.tools.title",
  note: "lab.tools.note",
  beta: "lab.tools.beta",
} as const satisfies Record<string, MessageKey>;
