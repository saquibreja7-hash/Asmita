"use client";

import Link from "next/link";

export default function CaseDashboardError() {
  return (
    <div className="page-canvas">
      <section
        className="container page-hero text-center"
        role="alert"
      >
        <div className="mx-auto max-w-2xl">
          <span className="eyebrow">Dashboard error</span>
          <h1 className="page-title-sm mt-8">
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
