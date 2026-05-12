import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";

export default async function VictimLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSession();
  if (!auth.ok) {
    return (
      <AppShell>
        <section className="container py-16">
          <div className="panel max-w-2xl p-6">
            <p className="text-sm font-bold uppercase text-[var(--muted)]">Session expired</p>
            <h1 className="mt-3 text-3xl font-black">Please verify your email again.</h1>
            <p className="muted mt-3 leading-7">
              For privacy, case access expires automatically. You can request a fresh code and return to your case.
            </p>
            <Link className="btn btn-primary mt-6" href="/register">
              Verify email
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }
  if (auth.ok && !auth.session.ageOver18) {
    redirect("/minor-support");
  }
  return children;
}
