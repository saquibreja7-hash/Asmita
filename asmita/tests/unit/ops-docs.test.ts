import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEscalationSchedule } from "@/lib/escalation-engine";

describe("ops documentation", () => {
  it("documents the escalation schedule used by the engine", () => {
    const playbook = readFileSync(
      path.join(process.cwd(), "docs", "ops", "non-response-escalation-playbook.md"),
      "utf8",
    );
    const schedule = createEscalationSchedule(new Date("2026-05-12T00:00:00.000Z"));

    expect(playbook).toContain("24 hours");
    expect(playbook).toContain("48 hours");
    expect(playbook).toContain("7 days");
    expect(schedule.map((item) => item.level)).toEqual([1, 2, 3]);
  });

  it("documents the quarterly security review commands", () => {
    const review = readFileSync(path.join(process.cwd(), "docs", "security", "quarterly-review.md"), "utf8");

    expect(review).toContain("npm run security:audit");
    expect(review).toContain("Confirm no URL-fetch invariant violations.");
    expect(review).toContain("P1/P2 security or privacy issues block beta and public launch.");
  });

  it("documents product decisions D-02 through D-04", () => {
    const decisions = readFileSync(path.join(process.cwd(), "docs", "decisions", "deferred-decisions.md"), "utf8");

    expect(decisions).toContain("D-02: Anonymous vs. Registered Submissions");
    expect(decisions).toContain("registered adult submissions only");
    expect(decisions).toContain("English and Hindi at launch");
    expect(decisions).toContain("post-launch supporter pathway");
  });
});
