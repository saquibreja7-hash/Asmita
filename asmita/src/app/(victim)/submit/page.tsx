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
        <section className="container pb-10 pt-20 text-center md:pb-14 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Create your case
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.06]">
              Set up your{" "}
              <em className="not-italic text-gradient">case</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Paste links where the content has appeared, or upload photos to
              generate a digital fingerprint — or both.
            </p>
          </div>
        </section>

        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <SubmitForm enableHashUpload={enableHashUpload} platforms={platforms} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
