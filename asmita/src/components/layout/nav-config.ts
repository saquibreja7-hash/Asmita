import { audiences } from "@/lib/audience-content";
import { audiencesHi } from "@/lib/audience-content-hi";
import { t, type Locale } from "@/lib/i18n";
import { issueContentHi } from "@/lib/issue-content-hi";
import { issueTopics } from "@/lib/issue-content";

export type NavItem = {
  href: string;
  label: string;
  // /talk needs a full page load: its own headers allow the microphone.
  // /check-image needs one too: its own headers allow the C2PA WASM reader.
  reload?: boolean;
};
export type NavGroup = { href: string; label: string; items: NavItem[] };

// Every public page, grouped for the header dropdowns and the phone menu.
// The unused options argument is kept so callers that still pass one compile.
export function navGroups(locale: Locale, _options: { scorecard?: boolean } = {}): NavGroup[] {
  const hi = locale === "hi";
  const say = (en: string, hindi: string) => (hi ? hindi : en);
  const overview = say("Overview", "अवलोकन");

  return [
    {
      href: "/issue",
      label: say("The issue", "समस्या"),
      items: [
        { href: "/issue", label: overview },
        ...issueTopics.map((topic) => ({
          href: `/issue/${topic.slug}`,
          label: hi ? (issueContentHi[topic.slug as keyof typeof issueContentHi]?.term ?? topic.term) : topic.term,
        })),
        { href: "/glossary", label: say("Glossary", "शब्दावली") },
      ],
    },
    {
      href: "/who-we-help",
      label: say("Who we help", "हम किसकी मदद करते हैं"),
      items: [
        { href: "/who-we-help", label: overview },
        ...audiences.map((a) => ({
          href: `/who-we-help/${a.slug}`,
          label: hi ? (audiencesHi[a.slug]?.term ?? a.term) : a.term,
        })),
      ],
    },
    {
      href: "/get-help",
      label: say("Support", "सहायता"),
      items: [
        { href: "/get-help", label: say("Ways to get help", "मदद के तरीके") },
        { href: "/start", label: say("File a complaint", "शिकायत दर्ज करें") },
        { href: "/start", label: say("Track your case", "अपना मामला देखें") },
        { href: "/talk", label: say("Talk to the assistant", "सहायक से बात करें"), reload: true },
        { href: "/check-image", label: t(locale, "nav.checkImage"), reload: true },
        { href: "/minor-support", label: say("Under 18", "18 से कम उम्र") },
      ],
    },
    {
      href: "/resources",
      label: t(locale, "nav.resources"),
      items: [
        { href: "/resources", label: say("All resources", "सभी संसाधन") },
        { href: "/resources/guides", label: say("Guides", "गाइड") },
        { href: "/resources/legal", label: say("Legal information", "कानूनी जानकारी") },
        { href: "/resources/directory", label: say("Support directory", "सहायता निर्देशिका") },
        { href: "/faq", label: t(locale, "nav.faq") },
        { href: "/news", label: t(locale, "nav.news") },
      ],
    },
    {
      href: "/get-involved",
      label: t(locale, "nav.getInvolved"),
      items: [
        { href: "/get-involved", label: t(locale, "nav.getInvolvedOverview") },
        { href: "/partners", label: t(locale, "nav.partner") },
        { href: "/volunteer", label: t(locale, "nav.volunteer") },
        { href: "/careers", label: t(locale, "nav.careers") },
      ],
    },
    {
      href: "/about",
      label: say("About", "हमारे बारे में"),
      items: [
        { href: "/about", label: say("Who we are", "हम कौन हैं") },
        { href: "/what-we-do", label: say("What we do", "हम क्या करते हैं") },
        { href: "/how-it-works", label: say("How it works", "यह कैसे काम करता है") },
        { href: "/for-platforms", label: say("For platforms", "प्लेटफ़ॉर्म के लिए") },
        { href: "/contact", label: say("Contact", "संपर्क") },
        { href: "/privacy", label: t(locale, "nav.privacy") },
      ],
    },
  ];
}
