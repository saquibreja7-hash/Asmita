import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { TALK_COPY_KEYS, type TalkCopy } from "./talk-copy";
import { TalkToUs } from "./TalkToUs";

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
        <section className="container py-8 md:py-14">
          <div className="mx-auto w-full max-w-2xl">
            <h1 className="page-title">
              {t(locale, "talk.title")}
            </h1>
            <p className="muted mt-6 max-w-lg text-base leading-[1.7] md:text-lg">{t(locale, "talk.intro")}</p>
          </div>
          <div className="mx-auto mt-6 w-full max-w-2xl">
            <TalkToUs copy={copy} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
