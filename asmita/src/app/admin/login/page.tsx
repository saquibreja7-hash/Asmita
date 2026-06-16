import { AppShell } from "@/components/layout/AppShell";
import { AdminLoginForm } from "@/app/admin/login/AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-10 pt-20 text-center md:pb-12 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Restricted workspace
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              Sign in to{" "}
              <em className="not-italic text-gradient">admin</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Admin accounts use email one-time-code plus an authenticator
              code. Survivor sessions cannot access this workspace.
            </p>
          </div>
        </section>

        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <AdminLoginForm />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
