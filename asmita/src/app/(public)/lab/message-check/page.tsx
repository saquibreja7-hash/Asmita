import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabCallout, LabLinkCards, LabSection, LabSteps, LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { MessageCheckForm } from "./MessageCheckForm";

/*
 * WP93 + WP117 (docs/lab/beta-spec.md, docs/research/research-tools-spec.md
 * Track D): the public sextortion classifier, /lab/message-check (named
 * "Sextortion classifier" since 2026-11-23; the URL stays). A visitor
 * pastes the text of a threatening message; the WP93 pattern rules and the
 * WP117 classifier both run in code and the optional short summary comes
 * from Sarvam. Text only — no images, no links followed — and nothing is
 * stored or logged. The page 404s while the Lab is off (it is on in dev
 * and test), like every lab page.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sextortion classifier",
  description:
    "An open-source sextortion classifier: paste the text of a message and see which sextortion patterns it matches, each explained in plain words, or run the same model in your own platform or helpline. Nothing is stored or logged.",
};

// The bias citation the "How this check works" section links to (the paper
// is open access; the sources file records it as P19-1163).
const SAP_ACL_2019_URL = "https://aclanthology.org/P19-1163/";

// The open-source pieces a platform, helpline or researcher needs to run
// the classifier themselves (Apache 2.0, the repository's licence).
const REPO = "https://github.com/saquibreja7-hash/Asmita/tree/master";
const REUSE_LINKS = [
  { key: "lab.message-check.reuse.code", href: `${REPO}/asmita/src/lib/lab/sextortion`, icon: "layers" },
  { key: "lab.message-check.reuse.taxonomy", href: `${REPO.replace("/tree/", "/blob/")}/asmita/docs/lab/sextortion-taxonomy.md`, icon: "book" },
  { key: "lab.message-check.reuse.eval", href: `${REPO.replace("/tree/", "/blob/")}/asmita/docs/lab/sextortion-eval.md`, icon: "target" },
  { key: "lab.message-check.reuse.trainer", href: `${REPO}/tools/lab-sextortion`, icon: "refresh" },
] as const;

const NEXT_STEPS = [
  "lab.message-check.next.noPay",
  "lab.message-check.next.noMore",
  "lab.message-check.next.evidence",
  "lab.message-check.next.block",
  "lab.message-check.next.report",
] as const;

const HELPLINES = [
  { key: "lab.message-check.helpline.cyber", number: "1930" },
  { key: "lab.message-check.helpline.women", number: "181" },
  { key: "lab.message-check.helpline.emergency", number: "112" },
] as const;

export default async function MessageCheckPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.eyebrow")}
        badge={t(locale, "lab.message-check.beta")}
        title={t(locale, "lab.message-check.title")}
        intro={
          <>
            <p>{t(locale, "lab.message-check.intro")}</p>
            <p className="text-[15px] text-[var(--text)]">{t(locale, "lab.message-check.cannot")}</p>
          </>
        }
        scene="message-check"
      >
        <LabCallout icon="shieldCheck">
          {t(locale, "lab.message-check.under18")}{" "}
          <Link href="/minor-support" className="text-link">
            {t(locale, "lab.message-check.under18.link")}
          </Link>
        </LabCallout>
      </LabToolHero>

      <LabWorkspace label={t(locale, "lab.message-check.title")}>
        <MessageCheckForm locale={locale} />
        <div className="mt-6 grid gap-2 border-t border-[var(--line)] pt-5 text-xs leading-[1.7] text-[var(--text)] sm:grid-cols-2 sm:gap-6">
          <p>{t(locale, "lab.message-check.notice.privacy")}</p>
          <p>{t(locale, "lab.message-check.notice.ai")}</p>
        </div>
      </LabWorkspace>

      {/* WHAT TO DO NOW — visible before any check runs: someone in
          distress should not have to run the tool first to find help. */}
      <LabSection id="message-check-next" index="01" title={t(locale, "lab.message-check.next.title")}>
        <LabSteps steps={NEXT_STEPS.map((key) => <p key={key}>{t(locale, key)}</p>)} />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn btn-primary" href="/start">{t(locale, "lab.message-check.cta.start")}</Link>
          <Link className="btn btn-secondary" href="/get-help">{t(locale, "lab.message-check.cta.help")}</Link>
        </div>
        <h3 className="mt-10 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">
          {t(locale, "lab.message-check.helpline.title")}
        </h3>
        <ul className="lab-helplines" role="list">
          {HELPLINES.map(({ key, number }) => (
            <li key={number} className="lab-helpline">
              <span className="lab-helpline-name">{t(locale, key)}</span>
              <a className="lab-helpline-number" href={`tel:${number}`}>{number}</a>
            </li>
          ))}
        </ul>
      </LabSection>

      {/* HOW THIS CHECK WORKS — the research behind the patterns, the
          synthetic training data, the honest per-script numbers, and the
          bias finding. */}
      <LabSection id="message-check-how" index="02" title={t(locale, "lab.message-check.how.title")}>
        <LabSteps
          ordered={false}
          layout="stack"
          steps={[
            <p key="patterns">{t(locale, "lab.message-check.how.patterns")}</p>,
            <p key="synthetic">{t(locale, "lab.message-check.how.synthetic")}</p>,
            <p key="bias">
              {t(locale, "lab.message-check.how.bias")}{" "}
              <a href={SAP_ACL_2019_URL} className="text-link" rel="noopener noreferrer" target="_blank">
                {t(locale, "lab.message-check.how.biasCite")}
              </a>
            </p>,
          ]}
        />
      </LabSection>

      {/* USE IT IN YOUR OWN SERVICE — the classifier is open source; the
          tiles go to the code, taxonomy, evaluation report and trainer. */}
      <LabSection
        id="message-check-reuse"
        index="03"
        title={t(locale, "lab.message-check.reuse.title")}
        lede={<p>{t(locale, "lab.message-check.reuse.body")}</p>}
      >
        <LabLinkCards cards={REUSE_LINKS.map(({ key, href, icon }) => ({ href, label: t(locale, key), icon, external: true }))} />
        <LabCallout icon="alert">{t(locale, "lab.message-check.reuse.limits")}</LabCallout>
      </LabSection>
    </LabToolShell>
  );
}
