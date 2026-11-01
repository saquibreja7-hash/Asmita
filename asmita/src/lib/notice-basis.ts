// Platforms whose notice Asmita prepares for the survivor to sign. A link on a
// FORM_ONLY or EMAIL_ONLY platform has no notice template, so it is never
// offered for signing, and must not stand in front of links that are: preview,
// sign page and sign route all pick the next link with this filter.
export const SIGNABLE_NOTICE_BASES = ["IT_RULES_2021", "DMCA", "IT_RULES_AND_DMCA"] as const;

export function templateTypeForNoticeBasis(noticeBasis: string) {
  return (SIGNABLE_NOTICE_BASES as readonly string[]).includes(noticeBasis)
    ? (noticeBasis as (typeof SIGNABLE_NOTICE_BASES)[number])
    : null;
}
