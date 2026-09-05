import { t, type Locale, type MessageKey } from "@/lib/i18n";

const TOTAL = 4;

const stepKeys: Record<number, MessageKey> = {
  1: "flow.step1",
  2: "flow.step2",
  3: "flow.step3",
  4: "flow.step4",
};

/*
 * Case-flow progress in the site's pipeline vocabulary: hairline-linked pill
 * nodes, the current step filled Off-Black, completed steps ticked.
 */
export function FlowProgress({ step, locale }: { step: 1 | 2 | 3 | 4; locale: Locale }) {
  return (
    <div className="mb-10">
      <p className="eyebrow">
        {t(locale, "flow.stepLabel")} {step}/{TOTAL}
        <span className="sm:hidden"> · {t(locale, stepKeys[step])}</span>
      </p>
      {/* Phones: four thin segments. */}
      <div className="mt-3 flex gap-1.5 sm:hidden" aria-hidden>
        {Array.from({ length: TOTAL }, (_, i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i < step ? "var(--color-off-black)" : "var(--color-ash)" }}
          />
        ))}
      </div>
      <ol className="mt-4 hidden flex-wrap items-center gap-y-3 sm:flex" aria-label="Progress">
        {Array.from({ length: TOTAL }, (_, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={n} className="contents">
              {i > 0 && <span className="pipeline-link !w-6 md:!w-10" aria-hidden />}
              <span
                className={`node !py-2.5 !px-4 !text-[12px] ${
                  state === "current" ? "node-hub" : state === "todo" ? "opacity-60" : ""
                }`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="node-icon" aria-hidden>
                  {state === "done" ? "✓" : String(n).padStart(2, "0")}
                </span>
                <span className={state === "current" ? "" : "sr-only"}>
                  {t(locale, stepKeys[n])}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
