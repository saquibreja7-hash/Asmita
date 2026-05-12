import { AdminLoginForm } from "@/app/admin/login/AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <section className="container py-16">
      <p className="text-sm font-bold uppercase text-[var(--muted)]">Admin access</p>
      <h1 className="mt-3 text-4xl font-black">Sign in to Asmita admin</h1>
      <p className="muted mt-4 max-w-2xl leading-7">
        Admin accounts use a separate email OTP plus authenticator-code session. Victim sessions cannot access this workspace.
      </p>
      <AdminLoginForm />
    </section>
  );
}
