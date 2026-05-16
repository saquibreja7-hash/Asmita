import type { DisplayCase } from "@/lib/case-ops";

export function calculateCaseMilestone(cases: DisplayCase[], target = 100) {
  const totalCases = cases.length;
  const resolvedCases = cases.filter((item) => item.status === "RESOLVED").length;
  const openCases = totalCases - resolvedCases;
  return {
    target,
    totalCases,
    resolvedCases,
    openCases,
    remaining: Math.max(target - totalCases, 0),
    progressPercent: target > 0 ? Math.min(Math.round((totalCases / target) * 100), 100) : 100,
  };
}
