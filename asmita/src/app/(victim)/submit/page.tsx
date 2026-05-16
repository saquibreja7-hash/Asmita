import { AppShell } from "@/components/layout/AppShell";
import { SubmitForm } from "./SubmitForm";

export default function SubmitPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-10 pt-20 text-center md:pb-14 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Step 02 · Submit links
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              Paste links as{" "}
              <em className="not-italic text-gradient">text</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Asmita reads only the domain from each URL. It never opens,
              fetches, renders, or previews the content the link points to.
            </p>
            <p className="font-display mt-8 text-[18px] leading-[1.5] tracking-tight text-[var(--foreground)] md:text-[22px] md:leading-[1.45]">
              Please do not upload images or videos. Links as text only.
            </p>
          </div>
        </section>

        {/* FORM */}
        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <SubmitForm />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
