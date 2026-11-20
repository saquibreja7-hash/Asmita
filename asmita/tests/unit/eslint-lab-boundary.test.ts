import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// The charter (docs/lab/charter.md) narrows the no-URL-fetch lint rule and
// the import boundary to the Lab's paths: lab code may fetch and may import
// lab code; complaint code keeps every fetch selector and never imports lab
// code. These tests lint throwaway text as if it lived at a lab path and at
// a complaint path, and assert both directions of the boundary.

const FETCH_TEXT = [
  'const pageUrl = "https://page.example.test/one";',
  "fetch(pageUrl);",
  'const url = "https://page.example.test/two";',
  "fetch(url);",
  "",
].join("\n");

const LAB_FETCH_PATH = "src/lib/lab/__lab_probe__.ts";
const COMPLAINT_FETCH_PATH = "src/lib/case-ops/__complaint_probe__.ts";

const IMPORT_TEXT = [
  'import { createCase } from "@/lib/case-ops";',
  'import { sendNoticeDraft } from "@/lib/email";',
  'import { labEnabled } from "@/lib/lab/flags";',
  "",
  "void createCase; void sendNoticeDraft; void labEnabled;",
].join("\n");

const LAB_IMPORT_PATH = "src/lib/lab/__lab_import_probe__.ts";
const COMPLAINT_IMPORT_PATH = "src/lib/case-ops/__complaint_import_probe__.ts";

async function lint(text: string, filePath: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(text, { filePath });
  return result.messages;
}

describe("ESLint: the Lab's fetch and import boundary", () => {
  it("lets a lab path fetch a URL-named variable, and still blocks a complaint path", async () => {
    const labMessages = (await lint(FETCH_TEXT, LAB_FETCH_PATH)).filter(
      (message) => message.ruleId === "no-restricted-syntax" && /string tokens only/.test(message.message),
    );
    expect(labMessages).toHaveLength(0);

    const complaintMessages = (await lint(FETCH_TEXT, COMPLAINT_FETCH_PATH)).filter(
      (message) => message.ruleId === "no-restricted-syntax" && /string tokens only/.test(message.message),
    );
    // Both fetch calls (pageUrl and url) are still refused in complaint code.
    expect(complaintMessages.map((message) => message.line)).toEqual([2, 4]);
  }, 60_000);

  it("blocks complaint-workflow imports from lab code, and lab imports from complaint code", async () => {
    // In lab code: case-ops is refused, the shared email sender is fine, lab
    // modules are fine.
    const labImports = (await lint(IMPORT_TEXT, LAB_IMPORT_PATH)).filter(
      (message) => message.ruleId === "no-restricted-imports",
    );
    expect(labImports).toHaveLength(1);
    expect(labImports[0].line).toBe(1);
    expect(labImports[0].message).toMatch(/never imports complaint-workflow modules/);

    // In complaint code: importing lab code is refused.
    const complaintImports = (await lint(IMPORT_TEXT, COMPLAINT_IMPORT_PATH)).filter(
      (message) => message.ruleId === "no-restricted-imports",
    );
    expect(complaintImports).toHaveLength(1);
    expect(complaintImports[0].line).toBe(3);
    expect(complaintImports[0].message).toMatch(/Nothing outside the Lab imports lab code/);
  }, 60_000);

  it("keeps the Zod body checks on lab paths", async () => {
    const messages = await lint("const body = req.body;\n", LAB_FETCH_PATH);
    expect(messages.some((message) => message.ruleId === "no-restricted-syntax" && /Zod/.test(message.message))).toBe(true);
  }, 60_000);
});
