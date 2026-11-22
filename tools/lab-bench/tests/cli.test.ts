import { describe, expect, it } from "vitest";
import { parseArgs, runCli } from "../src/cli.ts";

describe("parseArgs", () => {
  it("splits command and args, treats -h/--help/help as help", () => {
    expect(parseArgs(["match", "x"])).toEqual({ command: "match", args: ["x"] });
    expect(parseArgs(["-h"])).toEqual({ command: "help", args: [] });
    expect(parseArgs(["--help"])).toEqual({ command: "help", args: [] });
    expect(parseArgs([])).toBeNull();
  });
});

describe("runCli", () => {
  it("help exits 0, no command exits 64, unknown command exits 64", async () => {
    expect(await runCli(["help"])).toBe(0);
    expect(await runCli([])).toBe(64);
    expect(await runCli(["bogus"])).toBe(64);
    expect(await runCli(["match"])).toBe(64);
    expect(await runCli(["build-set"])).toBe(64);
    expect(await runCli(["gend-eval"])).toBe(64);
  });

  it("a missing run directory exits 1", async () => {
    expect(await runCli(["report", "/nonexistent-lab-bench-run"])).toBe(1);
  });
});
