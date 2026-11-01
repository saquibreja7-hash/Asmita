import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const flowFiles = [
  "src/app/(auth)/register/RegisterForm.tsx",
  "src/app/(auth)/submit/SubmitForm.tsx",
  "src/app/(victim)/review-sign/ReviewSignForm.tsx",
  "src/app/eligibility/EligibilityWizard.tsx",
  "src/lib/eligibility.ts",
  "src/app/(victim)/identity/page.tsx",
];

describe("victim flow browser storage", () => {
  it("does not use persistent localStorage for victim-flow state", () => {
    for (const file of flowFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("localStorage");
    }
  });
});
