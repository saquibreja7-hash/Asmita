import { AppShell } from "@/components/layout/AppShell";
import { redirect } from "next/navigation";
import { requireAdminSetup } from "@/lib/auth/require-admin";
import { getAdminMfaEnrolment } from "@/lib/auth/admin-mfa-store";
import { EnrolMfa } from "./EnrolMfa";

/*
 * Per-admin authenticator enrolment. The (admin) layout already requires an
 * admin session. An enrolled admin sees status only; the secret is never
 * displayed after the moment of enrolment.
 */
export default async function SetupMfaPage() {
  const auth = await requireAdminSetup();
  if (!auth.ok) redirect("/admin/login");
  const enrolment = await getAdminMfaEnrolment(auth.session.emailHash);

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-10 pt-20 text-center md:pb-12 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Two-factor authentication
            </span>
            <h1 className="mt-8 text-[clamp(2rem,5vw,3.5rem)]">
              {enrolment ? "Your authenticator is enrolled" : "Set up your authenticator"}
            </h1>
          </div>
        </section>

        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-md">
            {enrolment ? (
              <div className="card text-center">
                <p className="text-[16px] leading-[1.5] text-[var(--color-graphite)]">
                  Enrolled on{" "}
                  {enrolment.enrolledAt.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  IST. For your security the secret cannot be shown again. If you lost your
                  device, ask a super admin to reset your enrolment, then return here.
                </p>
              </div>
            ) : (
              <EnrolMfa />
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
