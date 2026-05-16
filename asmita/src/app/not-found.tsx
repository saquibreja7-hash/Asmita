import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-24 pt-24 text-center md:pb-32 md:pt-40">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Page not found · 404
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              This page isn&rsquo;t{" "}
              <em className="not-italic text-gradient">here</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              The link may have expired or moved. You can return to the start
              screen, open the support resources, or read how Asmita works.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                Start
              </Link>
              <Link className="btn btn-secondary" href="/resources">
                Resources
              </Link>
              <Link className="btn btn-secondary" href="/how-it-works">
                How it works
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
