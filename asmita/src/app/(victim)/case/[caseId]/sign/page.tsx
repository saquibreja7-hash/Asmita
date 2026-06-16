import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { SignNoticeForm } from "./SignNoticeForm";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function templateTypeForNoticeBasis(noticeBasis: string) {
  if (noticeBasis === "IT_RULES_2021") return "IT_RULES_2021" as const;
  if (noticeBasis === "DMCA") return "DMCA" as const;
  if (noticeBasis === "IT_RULES_AND_DMCA") return "IT_RULES_AND_DMCA" as const;
  return null;
}

export default async function SignNoticePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) redirect("/start");
  if (isDevNoDb()) redirect(`/case/${caseId}/confirmation`);

  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) redirect("/start");

  const alreadySigned = await db.submittedUrl.findFirst({
    where: { caseId, signedNoticePdf: { not: null } },
    select: { id: true },
  });
  if (alreadySigned) redirect(`/case/${caseId}/confirmation`);

  const skipLegalGate = process.env.DEV_SKIP_LEGAL_REVIEW === "true";

  const url = await db.submittedUrl.findFirst({
    where: {
      caseId,
      status: skipLegalGate ? { in: ["NOTICE_QUEUED", "PENDING_REVIEW"] } : "NOTICE_QUEUED",
      platformId: { not: null },
      platform: {
        isActive: true,
        ...(skipLegalGate ? {} : { lastContactVerifiedByHuman: true }),
      },
    },
    include: { platform: { select: { id: true, name: true, noticeBasis: true } } },
    orderBy: { submittedAt: "asc" },
  });

  if (!url?.platform) redirect(`/handoff/${caseId}`);
  const templateType = templateTypeForNoticeBasis(url.platform.noticeBasis);
  if (!templateType) redirect(`/handoff/${caseId}`);

  const template = await db.noticeTemplate.findFirst({
    where: {
      templateType,
      isActive: true,
      ...(skipLegalGate ? {} : { reviewedByLegal: true }),
      OR: [{ platformId: url.platform.id }, { platformId: null }],
    },
    orderBy: [{ platformId: "desc" }, { version: "desc" }],
  });
  if (!template) redirect(`/handoff/${caseId}`);

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">

            {/* LEFT - sticky context */}
            <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  {t(locale, "sign.pill")}
                </span>

                <p className="muted mt-5 text-sm leading-[1.75]">
                  {t(locale, "sign.aside.sub.prefix")}{" "}
                  <span className="font-semibold text-[var(--foreground)]">{url.platform.name}</span>{" "}
                  {t(locale, "sign.aside.sub.suffix")}
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    [t(locale, "sign.aside.item1.heading"), t(locale, "sign.aside.item1.detail")],
                    [t(locale, "sign.aside.item2.heading"), t(locale, "sign.aside.item2.detail")],
                    [t(locale, "sign.aside.item3.heading"), t(locale, "sign.aside.item3.detail")],
                  ].map(([heading, detail]) => (
                    <div key={heading as string} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                        aria-hidden
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{heading}</p>
                        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* RIGHT - form */}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
                {t(locale, "sign.title")}
              </h1>
              <p className="muted mt-2 text-sm leading-[1.75]">
                {t(locale, "sign.sub.prefix")}{" "}
                <span className="font-semibold text-[var(--foreground)]">{url.platform.name}</span>
                {t(locale, "sign.sub.suffix")}
              </p>
              <div className="mt-8">
                <SignNoticeForm
                  caseId={caseId}
                  urlId={url.id}
                  platformName={url.platform.name}
                  previewPdfUrl={`/api/cases/${caseId}/preview-notice`}
                  confirmationUrl={`/case/${caseId}/confirmation`}
                  locale={locale}
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
