import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";
import { getStack, STACKS } from "@/lib/lab/open-tools/stacks";

// WP150 (docs/lab/open-tools-spec.md, Parts E and F): validate the three
// stacks against the catalogue and the spec's rules. The legal sentences in
// indiaNotes must be the /for-platforms laws array verbatim, so they are
// read out of that page's source here and compared exactly, and every stack
// step's tools must reference existing catalogue slugs.

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));

const BANNED_WORDS = [
  "revolutionary",
  "cutting-edge",
  "seamless",
  "robust",
  "leverage",
  "empower",
  "harness",
  "game-changer",
  "unlock",
  "state-of-the-art",
  "comprehensive solution",
  "in today's digital landscape",
];

const NOT_LEGAL_ADVICE =
  "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer.";

function collectStrings(value: unknown, visit: (s: string) => void): void {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, visit));
  else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) collectStrings(child, visit);
  }
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The three law sentences from /for-platforms, read from the page source. */
function forPlatformsLaws(): string[] {
  const page = join(asmitaDir, "src", "app", "(public)", "for-platforms", "page.tsx");
  expect(existsSync(page), "for-platforms page exists").toBe(true);
  const source = readFileSync(page, "utf8");
  const start = source.indexOf("const laws:");
  const end = source.indexOf("const offers:");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const bodies = [...source.slice(start, end).matchAll(/body:\s*"([^"]+)",/g)].map((m) => m[1]);
  expect(bodies.length).toBe(3);
  return bodies;
}

describe("the three free stacks", () => {
  it("are exactly the spec's three stacks, in the spec's order", () => {
    expect(STACKS.map((stack) => stack.slug)).toEqual(["stop-reuploads", "ai-app-guardrails", "rules-and-review"]);
    expect(new Set(STACKS.map((s) => s.slug)).size).toBe(3);
    for (const stack of STACKS) expect(getStack(stack.slug)?.slug).toBe(stack.slug);
    expect(getStack("no-such-stack")).toBeUndefined();
  });

  it("carry the spec's step counts (7, 7, 6)", () => {
    expect(STACKS[0].steps.length).toBe(7);
    expect(STACKS[1].steps.length).toBe(7);
    expect(STACKS[2].steps.length).toBe(6);
  });

  it("has every required field present and non-empty", () => {
    for (const stack of STACKS) {
      for (const field of ["title", "forWho", "lede", "time", "people", "resources"] as const) {
        expect((stack[field] as string).trim().length > 0, `${stack.slug}.${field}`).toBe(true);
      }
      for (const field of ["wontCatch", "indiaNotes", "withAsmita"] as const) {
        expect((stack[field] as string[]).length, `${stack.slug}.${field}`).toBeGreaterThan(0);
      }
      for (const key of ["week1", "weeks2to3", "month2"] as const) {
        expect(stack.plan[key].length, `${stack.slug}.plan.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("every stack step references existing tool slugs (spec Part D)", () => {
  for (const stack of STACKS) {
    it(`${stack.slug}: all tool references resolve, and steps are well formed`, () => {
      for (const step of stack.steps) {
        expect(step.name.trim().length).toBeGreaterThan(0);
        expect(step.what.trim().length).toBeGreaterThan(0);
        expect(step.why.trim().length).toBeGreaterThan(0);
        expect(step.need.trim().length).toBeGreaterThan(0);
        expect(step.doneWhen.trim().length).toBeGreaterThan(0);
        expect(step.mistakes.length).toBeGreaterThanOrEqual(1);
        expect(step.mistakes.length).toBeLessThanOrEqual(3);
        expect(new Set(step.tools).size).toBe(step.tools.length);
        for (const slug of step.tools) {
          expect(getOpenTool(slug), `${stack.slug} step "${step.name}" references unknown tool ${slug}`).toBeDefined();
        }
      }
    });
  }
});

describe("the India notes reuse the /for-platforms laws verbatim", () => {
  const laws = forPlatformsLaws();

  it("stop-reuploads carries all three laws verbatim, then the not-legal-advice line", () => {
    const notes = STACKS[0].indiaNotes;
    for (const law of laws) expect(notes.some((note) => note.includes(law)), law).toBe(true);
    expect(notes[notes.length - 1]).toBe(NOT_LEGAL_ADVICE);
  });

  it("ai-app-guardrails carries the 24-hour and 2-hour sentences verbatim, then the advice line", () => {
    const notes = STACKS[1].indiaNotes;
    expect(notes.some((note) => note.includes(laws[0])), laws[0]).toBe(true);
    expect(notes.some((note) => note.includes(laws[1])), laws[1]).toBe(true);
    expect(notes.some((note) => note.includes(laws[2]))).toBe(false);
    expect(notes[notes.length - 1]).toBe(NOT_LEGAL_ADVICE);
  });

  it("rules-and-review carries all three laws plus the significant-intermediary line, then the advice line", () => {
    const notes = STACKS[2].indiaNotes;
    for (const law of laws) expect(notes.some((note) => note.includes(law)), law).toBe(true);
    expect(notes.some((note) => note.includes("Significant social media intermediaries have further duties under the IT Rules"))).toBe(true);
    expect(notes[notes.length - 1]).toBe(NOT_LEGAL_ADVICE);
  });
});

describe("stack content style (Part A4 and C5)", () => {
  it("carries no banned marketing word and no exclamation mark", () => {
    for (const stack of STACKS) {
      collectStrings(stack, (text) => {
        const lower = text.toLowerCase();
        for (const banned of BANNED_WORDS) {
          expect(lower.includes(banned), `${stack.slug} contains "${banned}"`).toBe(false);
        }
        expect(text.includes("!"), `${stack.slug} contains "!"`).toBe(false);
      });
    }
  });

  it("keeps each stack's prose between 900 and 2600 words (the page budget is 1200 to 2500)", () => {
    for (const stack of STACKS) {
      const prose = [
        stack.title,
        stack.forWho,
        stack.lede,
        ...stack.steps.flatMap((step) => [step.name, step.what, step.why, step.need, step.doneWhen, ...step.mistakes]),
        ...Object.values(stack.plan).flat(),
        ...stack.wontCatch,
        ...stack.indiaNotes,
        ...stack.withAsmita,
      ].join(" ");
      const count = words(prose);
      expect(count, `${stack.slug} prose is ${count} words`).toBeGreaterThanOrEqual(900);
      expect(count, `${stack.slug} prose is ${count} words`).toBeLessThanOrEqual(2600);
    }
  });
});
