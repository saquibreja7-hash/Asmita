/*
 * WP115 (research-tools-spec.md): the "Research behind this" disclosure the
 * spec asks for on /admin/lab/registry and /lab/tracker — the published
 * research this work is grounded in, cited with links. Paper and report
 * titles stay in English in both languages; these are citations, not
 * service or provider links, so the charter's "never link a service or
 * provider" rule is not touched by them.
 */

export type LabResearchCredit = {
  /** The citation as shown: authors or organisation, title, venue and year. */
  label: string;
  url: string;
};

export const LAB_RESEARCH_CREDITS: LabResearchCredit[] = [
  {
    label: "Gibson et al., “Analyzing the AI Nudification Application Ecosystem”, USENIX Security 2025",
    url: "https://arxiv.org/pdf/2411.09751",
  },
  {
    label: "ISD, “Mapping the ‘Nudify’ Tools Ecosystem”, 2026",
    url: "https://www.isdglobal.org/wp-content/uploads/2026/07/Mapping-the-Nudify-Tools-Ecosystem.pdf",
  },
  {
    label: "“It Takes a Forum: Resources & Stakeholders Sustaining the Online Synthetic Non-Consensual Intimate Image Creation Ecosystem”, 2026",
    url: "https://arxiv.org/pdf/2604.12190",
  },
  {
    label: "CIR, “Telegram deepfake bots are built to survive takedowns”, 2025",
    url: "https://www.info-res.org/cir/articles/telegram-deepfake-bots-are-built-to-survive-takedowns/",
  },
];

/**
 * The research hosts the public tracker may link out to — everything else
 * stays internal. The e2e journey asserts on this list, so the charter rule
 * ("never link a service or provider") is checked, not assumed.
 */
export const LAB_RESEARCH_CREDIT_HOSTS: string[] = [...new Set(LAB_RESEARCH_CREDITS.map((credit) => new URL(credit.url).hostname))];

export function isLabResearchCreditUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LAB_RESEARCH_CREDIT_HOSTS.includes(host);
  } catch {
    return false;
  }
}
