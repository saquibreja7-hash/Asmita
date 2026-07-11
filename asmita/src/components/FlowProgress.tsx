import { t, type Locale, type MessageKey } from "@/lib/i18n";

const TOTAL = 4;

const stepKeys: Record<number, MessageKey> = {
  1: "flow.step1",
  2: "flow.step2",
  3: "flow.step3",
  4: "flow.step4",
};

export function FlowProgress({ step, locale }: { step: 1 | 2 | 3 | 4; locale: Locale }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--teal)]">
        {t(locale, "flow.stepLabel")} {step}/{TOTAL} · {t(locale, stepKeys[step])}
      </p>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL }, (_, i) => (
          <span
            key={i}
            className="h-1 w-14 rounded-full"
            style={{ background: i < step ? "var(--teal)" : "var(--hairline)" }}
          />
        ))}
      </div>
    </div>
  );
}
