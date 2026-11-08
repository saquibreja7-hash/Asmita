import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { TALK_COPY_KEYS, type TalkCopy } from "./talk-copy";
import { TalkToUs } from "./TalkToUs";
import { Illustration } from "@/components/Illustration";

/*
 * Talk to the 24/7 helpline assistant from the browser. This is the only page
 * whose CSP allows Sarvam's WebSocket and whose Permissions-Policy allows the
 * microphone (next.config.ts).
 */

export const metadata: Metadata = {
  title: "Talk to us",
  description: "Talk to Asmita's 24/7 AI helpline assistant from your browser, in any Indian language.",
};

export default async function TalkPage() {
  const locale = await getLocale();
  const copy = Object.fromEntries(TALK_COPY_KEYS.map((key) => [key, t(locale, key)])) as TalkCopy;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-24 pt-20 md:pb-32 md:pt-28 page-hero-split">
          <div className="mx-auto w-full max-w-2xl">
            <span className="eyebrow">{t(locale, "talk.pill")}</span>
            <h1 className="page-title mt-8">
              {t(locale, "talk.title")}
            </h1>
            <p className="muted mt-6 max-w-lg text-base leading-[1.7] md:text-lg">{t(locale, "talk.intro")}</p>
          </div>
          {/* Beside the heading on wide screens; kept small on phones so the call stays close. */}
          <Illustration name="page-talk" eager className="page-hero-art !max-w-[240px] lg:!max-w-[420px]" />
          <div className="mx-auto w-full max-w-2xl lg:mx-0">
            <TalkToUs copy={copy} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
