"use client";

import Link from "next/link";

export default function CaseDashboardError() {
  return (
    <section className="container py-16">
      <div className="panel max-w-2xl p-6" role="alert">
        <p className="text-sm font-bold uppercase text-[var(--rose)]">Dashboard error</p>
        <h1 className="mt-3 text-3xl font-black">We could not load the case dashboard.</h1>
        <p className="muted mt-3 leading-7">Please try again from your dashboard link or verify your email again.</p>
        <Link className="btn btn-primary mt-6" href="/register">
          Verify email
        </Link>
      </div>
    </section>
  );
}
