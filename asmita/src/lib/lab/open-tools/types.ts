/*
 * Types for the AI Lab open tools directory and free stacks
 * (asmita/docs/lab/open-tools-spec.md, Parts D and E).
 *
 * Data only: the catalogue and the stacks are typed content modules, not UI.
 * Nothing here imports anything else in the app, so the Lab boundary
 * (docs/lab/charter.md) cannot be crossed by these files.
 */

/** The five stages of a trust-and-safety workflow (spec Part C3). */
export type Stage = "prevent" | "detect" | "review" | "act" | "share";

/** Who a tool page is written for. */
export type Audience = "platform" | "ai-app" | "ngo" | "researcher";

/**
 * The directory's groups, in the order the spec fixes for grouping
 * (Part C3): matching first, directories last.
 */
export type Category =
  | "matching"
  | "review"
  | "models"
  | "provenance"
  | "services"
  | "asmita"
  | "directories";

/**
 * How much work a tool is to run. "none" exists because Part D gives the
 * two ROOST directories "Effort: none": there is nothing to run, only
 * something to read. The card shows no filled squares for it.
 */
export type Effort = "low" | "medium" | "high" | "none";

/** Which reusable diagram (spec Part C4) illustrates the tool. */
export type DiagramKind =
  | "hash"
  | "similarity"
  | "review"
  | "classifier"
  | "provenance"
  | "none";

/** One tool page in the directory (spec Part D). */
export interface OpenTool {
  /** Route segment: /lab/open-tools/[slug]. */
  slug: string;
  /** The tool's own name, exactly as its repository uses it. */
  name: string;
  /** The maintaining organisation, as its repository names it. */
  maintainer: string;
  /** The maintainer's repository or official site. */
  maintainerUrl: string;
  category: Category;
  /** One line for the "What it is" row of the aside. */
  kind: string;
  /** Short licence name for the chip (for example BSD-3-Clause, Free service). */
  licence: string;
  /** Where the licence text, or the statement of the terms, lives. */
  licenceUrl: string;
  /** False for the free services and the partner feed: chip "Not open source". */
  openSource: boolean;
  /** True only for tools Asmita built: chip "From Asmita". */
  fromAsmita: boolean;
  /** Official repository. Absent for the free services. */
  repoUrl?: string;
  /** Official documentation, when it is separate from the repository. */
  docsUrl?: string;
  /** The tool's paper, when one exists. */
  paper?: string;
  stages: Stage[];
  audiences: Audience[];
  /** Search helpers: the directory search matches name, maintainer and tags. */
  tags: string[];
  /** What it runs on, in plain terms, for the aside. */
  runsOn: string;
  effort: Effort;
  /** One sentence explaining the effort rating. */
  effortNote: string;
  /** Card summary: English at most 22 words; Hindi a formal-register rendering. */
  summary: { en: string; hi: string };
  /** "What it does": two or three short paragraphs, problem first. */
  whatItDoes: string[];
  /** "How it works": 3 to 6 steps of one sentence each. */
  howItWorks: string[];
  /** "Where it fits": 2 to 4 concrete bullets. */
  fitsWhere: string[];
  /** "What you get": 4 to 8 bullets, each starting with a noun or verb. */
  features: string[];
  /** "What it cannot do": 2 to 6 bullets. Never empty. */
  limits: string[];
  /** "How to start": prerequisites first; a code snippet only where the spec
   * or the official README gives the exact command. */
  gettingStarted: { step: string; code?: string }[];
  /** "How Asmita uses it": omitted entirely when Asmita does not use it. */
  asmitaUse?: string;
  /** Up to three related tool slugs. */
  related: string[];
  /** Every URL the facts on the page came from, in reading order. */
  sources: string[];
  /** ISO date the facts were last checked. */
  checkedAt: string;
  diagram: DiagramKind;
}

/** One numbered step of a stack (spec Part E). */
export interface StackStep {
  name: string;
  /** OpenTool slugs used at this step; may be empty for a policy step. */
  tools: string[];
  what: string;
  why: string;
  need: string;
  /** A concrete check that the step is done. */
  doneWhen: string;
  /** 1 to 3 common mistakes. */
  mistakes: string[];
}

/** The three-column timeline on a stack page. */
export interface StackPlan {
  week1: string[];
  weeks2to3: string[];
  month2: string[];
}

/** One free stack (spec Part E). */
export interface Stack {
  slug: string;
  /** The job, in plain words, as the page h1. */
  title: string;
  /** Who the stack is for, one line. */
  forWho: string;
  /** A short lede of about two sentences. */
  lede: string;
  /** Time estimate, no invented money figures. */
  time: string;
  people: string;
  resources: string;
  steps: StackStep[];
  plan: StackPlan;
  /** "What this will not catch": honest gaps. */
  wontCatch: string[];
  /**
   * India notes. The legal sentences are reused verbatim from /for-platforms,
   * and the section always ends with the spec's not-legal-advice line.
   */
  indiaNotes: string[];
  /** "Work with Asmita": only what the spec allows, no promises. */
  withAsmita: string[];
}
