import { AppShell } from "@/components/layout/AppShell";
import { SubmitForm } from "./SubmitForm";
import { listHashPickerPlatforms, type HashPickerPlatform } from "@/lib/hash-submission";

async function getPlatforms(): Promise<HashPickerPlatform[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await listHashPickerPlatforms();
  } catch {
    return [];
  }
}

export default async function SubmitPage() {
  const enableHashUpload = process.env.ENABLE_HASH_UPLOAD === "true";
  const platforms = enableHashUpload ? await getPlatforms() : [];

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">

            {/* LEFT - sticky context panel */}
            <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  Create your case
                </span>

                <p className="muted mt-6 text-sm leading-[1.75]">
                  Paste links where the content appears, or generate a digital
                  fingerprint from your device - or both. You review everything
                  before anything is sent.
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    ["Links are text only", "We read the domain to route the notice. We never open, fetch, or preview the content at any link."],
                    ["Photos stay on your device", "Fingerprinting runs entirely in your browser. Only the 64-character hash is sent to Asmita."],
                    ["You sign before it goes out", "No notice is dispatched until you review and sign the declaration on the next screen."],
                  ].map(([heading, detail]) => (
                    <div key={heading as string} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                        aria-hidden
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4l2.5 2.5L9 1"
                            stroke="var(--teal)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
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
                Set up your case.
              </h1>
              <p className="muted mt-2 text-sm leading-[1.75]">
                Add what you have. You will review everything on the next screen before your case is created.
              </p>
              <div className="mt-10">
                <SubmitForm enableHashUpload={enableHashUpload} platforms={platforms} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
