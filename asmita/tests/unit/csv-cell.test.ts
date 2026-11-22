import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv-cell";

// Admin CSV exports of public-form data: no formula injection, proper quoting.

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Asha")).toBe("Asha");
    expect(csvCell("")).toBe("");
  });

  it("neutralises values that start with a formula trigger", () => {
    expect(csvCell("=HYPERLINK(\"http://x.invalid\")")).toBe("\"'=HYPERLINK(\"\"http://x.invalid\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("\r=1")).toBe("\"'\r=1\"");
  });

  it("quotes values containing a quote, comma, newline or carriage return", () => {
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(csvCell("say \"hi\"")).toBe("\"say \"\"hi\"\"\"");
    expect(csvCell("line\nbreak")).toBe("\"line\nbreak\"");
    expect(csvCell("line\rbreak")).toBe("\"line\rbreak\"");
  });
});
