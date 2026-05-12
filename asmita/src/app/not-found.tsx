import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <section className="container py-16">
        <div className="panel max-w-2xl p-6">
          <p className="text-sm font-bold uppercase text-[var(--muted)]">404</p>
          <h1 className="mt-3 text-3xl font-black">This page is not available.</h1>
          <p className="muted mt-3 leading-7">
            The link may have expired or moved. You can return to the start screen or open support resources.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/start">
              Start
            </Link>
            <Link className="btn btn-secondary" href="/resources">
              Resources
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
