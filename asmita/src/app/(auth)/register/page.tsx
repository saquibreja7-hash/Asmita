import { AppShell } from "@/components/layout/AppShell";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-10 pt-20 text-center md:pb-12 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Create your case
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              No passwords.
              <br />
              Just <em className="not-italic text-gradient">you</em>, an email,
              and a code.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Asmita signs you in with a one-time code sent to your email. If
              you are under 18, you will be routed to support resources
              instead of being asked for any case data.
            </p>
          </div>
        </section>

        {/* FORM */}
        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <RegisterForm />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
