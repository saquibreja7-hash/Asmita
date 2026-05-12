import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export default function StartPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Start safely</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight">
          Choose the path that matches your age.
        </h1>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link className="panel block p-6" href="/register">
            <p className="text-sm font-bold uppercase text-[var(--teal)]">18 or older</p>
            <h2 className="mt-3 text-2xl font-black">Continue to private case setup</h2>
            <p className="muted mt-3 leading-7">
              You will verify your email, confirm the declaration, and submit links as text only.
            </p>
          </Link>
          <Link className="panel block border-[var(--rose)] p-6" href="/start/minor">
            <p className="text-sm font-bold uppercase text-[var(--rose)]">Under 18</p>
            <h2 className="mt-3 text-2xl font-black">Go to support resources</h2>
            <p className="muted mt-3 leading-7">
              This path does not create an account, case, session, notice, or URL record.
            </p>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
