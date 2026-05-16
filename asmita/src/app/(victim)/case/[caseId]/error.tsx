"use client";

import Link from "next/link";

export default function CaseDashboardError() {
  return (
    <div className="page-canvas">
      <section
        className="container pb-24 pt-20 text-center md:pb-32 md:pt-32"
        role="alert"
      >
        <div className="mx-auto max-w-2xl">
          <span className="pill">
            <span className="dot" />
            Dashboard error
          </span>
          <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
            We could not load the
            <br />
            case <em className="not-italic text-gradient">dashboard</em>.
          </h1>
          <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
            Please try again from your dashboard link, or verify your email
            again. If the problem persists, write to support.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link className="btn btn-primary" href="/register">
              Verify email
            </Link>
            <Link className="btn btn-secondary" href="/contact">
              Contact Asmita
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
