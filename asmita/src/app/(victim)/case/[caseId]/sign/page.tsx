import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { db } from "@/lib/db";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}
import { SignNoticeForm } from "./SignNoticeForm";

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
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) redirect("/start");

  if (isDevNoDb()) redirect(`/case/${caseId}/confirmation`);

  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) redirect("/start");

  // Already signed — skip straight to confirmation
  const alreadySigned = await db.submittedUrl.findFirst({
    where: { caseId, signedNoticePdf: { not: null } },
    select: { id: true },
  });
  if (alreadySigned) redirect(`/case/${caseId}/confirmation`);

  const skipLegalGate = process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_LEGAL_REVIEW === "true";

  // Find the first NOTICE_QUEUED URL that has a verified platform + reviewed template.
  // In dev with DEV_SKIP_LEGAL_REVIEW, also accept PENDING_REVIEW and skip contact verification.
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
    include: {
      platform: {
        select: { id: true, name: true, noticeBasis: true },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  if (!url?.platform) redirect(`/handoff/${caseId}`);

  const templateType = templateTypeForNoticeBasis(url.platform.noticeBasis);
  // FORM_ONLY platforms: no email notice — route to guided handoff instead
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
        <section className="container pb-12 pt-20 md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Review &amp; sign
            </span>
            <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[52px] md:leading-[1.06]">
              Review your{" "}
              <em className="not-italic text-gradient">takedown notice</em>.
            </h1>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.7] md:text-lg">
              This is the notice that will be sent to{" "}
              <strong>{url.platform.name}</strong> on your behalf. Read it,
              add your details, and sign to authorise dispatch.
            </p>
          </div>
        </section>

        <section className="container pb-24 pt-4 md:pb-32">
          <div className="mx-auto max-w-3xl">
            <SignNoticeForm
              caseId={caseId}
              urlId={url.id}
              platformName={url.platform.name}
              previewPdfUrl={`/api/cases/${caseId}/preview-notice`}
              confirmationUrl={`/case/${caseId}/confirmation`}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
