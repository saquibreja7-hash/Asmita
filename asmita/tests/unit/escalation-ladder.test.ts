import { describe, expect, it } from "vitest";
import {
  buildLadder,
  GRIEVANCE_RESOLUTION_DAYS,
  PLATFORM_DEADLINE_HOURS,
} from "@/lib/escalation-ladder";

const sent = new Date("2026-11-01T10:00:00Z");
const after = (hours: number) => new Date(sent.getTime() + hours * 3_600_000);
const states = (l: ReturnType<typeof buildLadder>) => l!.steps.map((s) => `${s.key}:${s.state}`);

describe("buildLadder", () => {
  it("shows nothing until the notice is sent or the form is filed", () => {
    expect(buildLadder({ startedAt: null, status: "NOTICE_QUEUED", now: sent })).toBeNull();
  });

  it("waits for the platform until its deadline", () => {
    const l = buildLadder({ startedAt: sent, status: "NOTICE_SENT", now: after(PLATFORM_DEADLINE_HOURS - 1) });
    expect(l!.complaintOpen).toBe(false);
    expect(states(l)).toEqual(["sent:current", "deadline:upcoming", "complaint:upcoming", "appeal:upcoming"]);
    expect(l!.steps[1].at).toEqual(after(PLATFORM_DEADLINE_HOURS));
  });

  it("suggests a cybercrime complaint once the deadline passes, but not yet an appeal", () => {
    const l = buildLadder({ startedAt: sent, status: "NOTICE_SENT", now: after(PLATFORM_DEADLINE_HOURS) });
    expect(l!.complaintOpen).toBe(true);
    expect(l!.appealOpen).toBe(false);
    expect(states(l)).toEqual(["sent:done", "deadline:done", "complaint:current", "appeal:upcoming"]);
  });

  it("opens the appeal when the officer's resolution period ends without removal", () => {
    const l = buildLadder({ startedAt: sent, status: "ESCALATED", responseType: "ACKNOWLEDGED", now: after(GRIEVANCE_RESOLUTION_DAYS * 24) });
    expect(l!.appealOpen).toBe(true);
    expect(l!.steps[3].at).toEqual(after(GRIEVANCE_RESOLUTION_DAYS * 24));
    expect(states(l)).toEqual(["sent:done", "deadline:done", "complaint:done", "appeal:current"]);
  });

  it("an acknowledgement alone does not end the ladder", () => {
    const l = buildLadder({ startedAt: sent, status: "NOTICE_SENT", responseType: "ACKNOWLEDGED", responseAt: after(1), now: after(PLATFORM_DEADLINE_HOURS + 1) });
    expect(l!.complaintOpen).toBe(true);
  });

  it("a refusal opens the complaint and the appeal at once", () => {
    const l = buildLadder({ startedAt: sent, status: "NOTICE_SENT", responseType: "REJECTED", responseAt: after(2), now: after(3) });
    expect(l!.rejected).toBe(true);
    expect(l!.complaintOpen).toBe(true);
    expect(l!.appealOpen).toBe(true);
    expect(l!.steps[3].at).toEqual(after(2));
  });

  it("stops once the link is removed", () => {
    const l = buildLadder({ startedAt: sent, status: "REMOVED", now: after(GRIEVANCE_RESOLUTION_DAYS * 24) });
    expect(l!.finished).toBe(true);
    expect(l!.complaintOpen).toBe(false);
    expect(l!.appealOpen).toBe(false);
    expect(l!.steps.some((s) => s.state === "current")).toBe(false);
  });
});
