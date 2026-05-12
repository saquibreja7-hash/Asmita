import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const flowFiles = [
  "src/app/(auth)/register/RegisterForm.tsx",
  "src/app/(victim)/submit/SubmitForm.tsx",
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
