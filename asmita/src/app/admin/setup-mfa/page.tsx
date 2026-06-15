import { AppShell } from "@/components/layout/AppShell";
import QRCode from "qrcode";

export default async function SetupMfaPage() {
  const secret = process.env.ADMIN_TOTP_SECRET;

  if (!secret) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill"><span className="dot" />MFA setup</span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[52px] md:leading-[1.06]">
                No secret configured.
              </h1>
              <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.7]">
                Set <code className="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">ADMIN_TOTP_SECRET</code> in
                your Vercel environment variables, then redeploy and return here.
              </p>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const issuer = "Asmita Admin";
  const account = "admin@meriasmita.org";
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  const svgString = await QRCode.toString(uri, { type: "svg", margin: 2 });

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-10 pt-20 text-center md:pb-12 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill"><span className="dot" />MFA setup</span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[56px] md:leading-[1.06]">
              Scan to set up <em className="not-italic text-gradient">two-factor auth</em>.
            </h1>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.7]">
              Open Google Authenticator, Authy, or any TOTP app and scan this QR code.
              After scanning, use the 6-digit code it generates to log in.
            </p>
          </div>
        </section>

        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-sm">
            <div
              className="rounded-[14px] border border-[var(--hairline)] bg-white p-6"
              dangerouslySetInnerHTML={{ __html: svgString }}
            />
            <div className="mt-6 rounded-[14px] border border-[var(--hairline)] bg-white p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Manual entry key
              </p>
              <p className="font-mono mt-2 break-all text-sm tracking-widest text-[var(--foreground)] select-all">
                {secret.match(/.{1,4}/g)?.join(" ") ?? secret}
              </p>
              <p className="mt-3 text-xs text-[var(--muted)]">
                If scanning fails, add manually: choose Time-based, SHA1, 6 digits, 30s period.
              </p>
            </div>
            <p className="mt-6 text-center text-xs text-[var(--muted)]">
              Once set up, return to{" "}
              <a className="underline" href="/admin/login">
                /admin/login
              </a>{" "}
              to sign in.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
