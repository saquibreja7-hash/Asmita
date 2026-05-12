import { AppShell } from "@/components/layout/AppShell";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Start safely</p>
        <h1 className="mt-3 text-4xl font-black">Create a private case session</h1>
        <p className="muted mt-4 max-w-2xl leading-7">
          We use a one-time email code. There are no passwords. If you are under 18, we will take
          you to support resources instead of collecting case URLs.
        </p>
        <RegisterForm />
      </section>
    </AppShell>
  );
}
