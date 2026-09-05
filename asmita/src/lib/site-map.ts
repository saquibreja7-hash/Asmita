import { audiences } from "@/lib/audience-content";
import { issueTopics } from "@/lib/issue-content";

/*
 * One list of every public page. Feeds the human sitemap at /sitemap,
 * the XML sitemap for search engines, and the footer.
 * Authenticated case pages and admin routes are deliberately excluded.
 */

export type SiteLink = { href: string; label: string; note?: string };
export type SiteGroup = { title: string; links: SiteLink[] };

export const siteMap: SiteGroup[] = [
  {
    title: "Get help",
    links: [
      { href: "/get-help", label: "Get help", note: "Situations, steps, and tools" },
      { href: "/start", label: "Start a case", note: "Begin a confidential report" },
      { href: "/eligibility", label: "Check eligibility" },
      { href: "/check-image", label: "Check an image for AI", note: "Private deepfake signals check" },
      { href: "/minor-support", label: "Under 18", note: "A separate, safer path" },
    ],
  },
  {
    title: "The issue",
    links: [
      { href: "/issue", label: "Image-based abuse" },
      ...issueTopics.map((t) => ({ href: `/issue/${t.slug}`, label: t.title })),
      { href: "/glossary", label: "Glossary of terms" },
    ],
  },
  {
    title: "Who we help",
    links: [
      { href: "/who-we-help", label: "Who we help" },
      ...audiences.map((a) => ({ href: `/who-we-help/${a.slug}`, label: a.term })),
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/resources", label: "Resources" },
      { href: "/resources/guides", label: "Practical guides" },
      { href: "/resources/directory", label: "Support directory", note: "Verified helplines and services" },
      { href: "/resources/legal", label: "Your legal rights" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "About Asmita",
    links: [
      { href: "/about", label: "About" },
      { href: "/what-we-do", label: "What we do" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/research", label: "Research" },
      { href: "/contact", label: "Contact" },
      { href: "/feedback", label: "Feedback" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/legal", label: "Legal" },
      { href: "/sitemap", label: "Sitemap" },
    ],
  },
];

export const allPublicPaths: string[] = ["/", ...siteMap.flatMap((g) => g.links.map((l) => l.href))];
