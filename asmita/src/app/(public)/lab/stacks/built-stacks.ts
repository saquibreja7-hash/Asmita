import type { MessageKey } from "@/lib/i18n";

/*
 * Which stacks have their page built (docs/lab/open-tools-spec.md, WP153).
 * WP153 renders stop-reuploads only; ai-app-guardrails and rules-and-review
 * exist in the WP150 data, but their pages arrive with WP154 — until then
 * the index shows them as "Coming next" without a link, and their routes
 * answer 404. One list in one place so the index, the [slug] route's
 * generateStaticParams and the tests agree on what exists.
 */

export const BUILT_STACK_SLUGS: readonly string[] = ["stop-reuploads"] as const;

export function stackIsBuilt(slug: string): boolean {
  return BUILT_STACK_SLUGS.includes(slug);
}

/*
 * The closing link of the "Work with Asmita" section (spec Part E): the
 * two platform stacks point at the partner programme's own page; the AI
 * app stack's contact route is the feedback page its data names. WP154
 * renders the other two stacks from the same map.
 */
export const WITH_ASMITA_LINK: ReadonlyMap<string, { href: string; labelKey: MessageKey }> = new Map([
  ["stop-reuploads", { href: "/for-platforms", labelKey: "lab.stacks.page.forPlatforms" }],
  ["ai-app-guardrails", { href: "/feedback", labelKey: "lab.stacks.page.feedback" }],
  ["rules-and-review", { href: "/for-platforms", labelKey: "lab.stacks.page.forPlatforms" }],
]);
