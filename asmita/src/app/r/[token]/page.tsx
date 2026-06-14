import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalTokenStatus, resolvePortalToken } from "@/lib/url-portal";
import { encryptField, decryptField } from "@/lib/encryption";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// Cookie name is token-scoped so concurrent tabs on different tokens don't collide.
function cookieName(token: string) {
  return `portal_url_${token.slice(0, 16)}`;
}

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { token } = await params;
  const { ok, error } = await searchParams;

  // --- Revealed state: access code was accepted, URL is in a short-lived cookie ---
  if (ok === "1") {
    const cookieStore = await cookies();
    const encrypted = cookieStore.get(cookieName(token))?.value;
    if (encrypted) {
      let url: string;
      try {
        url = decryptField(decodeURIComponent(encrypted));
      } catch {
        return <ErrorPage message="Session expired. Please close this tab." />;
      }
      return <RevealedPage url={url} />;
    }
    // Cookie missing — access code was valid but session expired or cookie was cleared.
    return <ErrorPage message="Session expired. Please close this tab." />;
  }

  // --- Check token status ---
  const status = await getPortalTokenStatus(token);
  if (!status.found) {
    return <NotFoundPage />;
  }
  if (status.used) {
    return <AlreadyUsedPage />;
  }

  // --- Form page ---
  async function submitCode(formData: FormData) {
    "use server";
    const reqHeaders = await headers();
    const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // 5 attempts per token per IP per 15 minutes — prevents access code brute-force.
    const rl = await checkRateLimitAsync(`portal:${token.slice(0, 16)}:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) redirect(`/r/${token}?error=rate_limited`);

    const code = (formData.get("code") as string | null)?.trim() ?? "";
    const result = await resolvePortalToken(token, code);

    if (!result.ok) {
      if (result.error === "already_used") {
        redirect(`/r/${token}?error=used`);
      }
      redirect(`/r/${token}?error=invalid`);
    }

    // Store the URL in a short-lived httpOnly cookie (5 min), then redirect to
    // the same page with ?ok=1 so the URL is rendered server-side.
    const cookieStore = await cookies();
    cookieStore.set(cookieName(token), encodeURIComponent(encryptField(result.url)), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 300,
      path: `/r/${token}`,
    });
    redirect(`/r/${token}?ok=1`);
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        Secure content portal
      </p>
      <h1 className="font-display mt-3 text-[28px] font-normal leading-[1.15] tracking-tight">
        Enter access code to view reported URL
      </h1>
      <p className="mt-4 text-sm leading-[1.7] text-[var(--muted)]">
        This link was included in a takedown notice from Asmita. To view the
        reported URL, enter the one-time access code from that email.
      </p>

      <form action={submitCode} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="code"
            className="font-display block text-[15px] leading-[1.4] tracking-tight"
          >
            Access code
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Format: XXXX-XXXX (from the notice email)
          </p>
          <input
            id="code"
            name="code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            className="field mt-2 font-mono uppercase tracking-widest"
            required
          />
        </div>

        {error === "invalid" && (
          <p className="text-sm font-semibold text-[var(--rose)]">
            Incorrect access code. Please check the notice email and try again.
          </p>
        )}
        {error === "used" && (
          <p className="text-sm font-semibold text-[var(--rose)]">
            This link has already been accessed and is no longer active.
          </p>
        )}
        {error === "rate_limited" && (
          <p className="text-sm font-semibold text-[var(--rose)]">
            Too many attempts. Please wait 15 minutes before trying again.
          </p>
        )}

        <button type="submit" className="btn btn-primary">
          View reported URL
        </button>
      </form>

      <p className="mt-8 text-xs leading-[1.7] text-[var(--muted)]">
        This link can only be accessed once. After the URL is viewed, it is
        permanently deactivated. If you have already opened it or need
        re-access, contact{" "}
        <a href="mailto:notice@meriasmita.org" className="underline">
          notice@meriasmita.org
        </a>{" "}
        with your case reference.
      </p>
    </main>
  );
}

function RevealedPage({ url }: { url: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        Secure content portal
      </p>
      <h1 className="font-display mt-3 text-[28px] font-normal leading-[1.15] tracking-tight">
        Reported URL
      </h1>
      <p className="mt-4 text-sm leading-[1.7] text-[var(--muted)]">
        The URL below identifies the content reported in the takedown notice.
        This link has now been deactivated — it cannot be accessed again.
      </p>
      <div className="mt-6 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <p className="font-mono break-all text-sm leading-[1.7]">{url}</p>
      </div>
      <p className="mt-6 text-xs leading-[1.7] text-[var(--muted)]">
        Please take the requested action and use the case reference from the
        notice email in any correspondence. Do not reply quoting the original
        notice email.
      </p>
    </main>
  );
}

function AlreadyUsedPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        Secure content portal
      </p>
      <h1 className="font-display mt-3 text-[28px] font-normal leading-[1.15] tracking-tight">
        This link has already been accessed
      </h1>
      <p className="mt-4 text-sm leading-[1.7] text-[var(--muted)]">
        For security, this portal link can only be opened once. It has already
        been used and is now permanently inactive.
      </p>
      <p className="mt-4 text-sm leading-[1.7] text-[var(--muted)]">
        If you need to view the reported URL again, contact{" "}
        <a href="mailto:notice@meriasmita.org" className="underline">
          notice@meriasmita.org
        </a>{" "}
        with the case reference number from the notice email. We will issue a
        new secure link after verifying your identity.
      </p>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        Secure content portal
      </p>
      <h1 className="font-display mt-3 text-[28px] font-normal leading-[1.15] tracking-tight">
        Link not found
      </h1>
      <p className="mt-4 text-sm leading-[1.7] text-[var(--muted)]">
        This portal link does not exist or has been removed. If you received a
        notice from Asmita, please ensure you have copied the full link from
        the email.
      </p>
    </main>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="font-display mt-3 text-[28px] font-normal leading-[1.15] tracking-tight">
        Something went wrong
      </p>
      <p className="mt-4 text-sm leading-[1.7] text-[var(--muted)]">{message}</p>
    </main>
  );
}
