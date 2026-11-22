/**
 * The lab-bench CLI: build-set, match, detect, trace, report (see README for
 * the full flow). Exit codes: 0 ok, 64 usage, 1 failure.
 */
import { buildSet } from "./buildset.ts";
import { runMatch } from "./matchcmd.ts";
import { runDetect } from "./detectcmd.ts";
import { runGendEval, renderGendEvalTable } from "./gendeval.ts";
import { runTrace } from "./tracecmd.ts";
import { runReport } from "./reportcmd.ts";
import { HumanFaceLocator } from "./landmarks.ts";

const USAGE = `usage: lab-bench <command> [args]

commands:
  build-set <portraits-dir> <out-dir>   build the E1 variant set (or import a
                                        labelled dataset folder with real/ and
                                        fake/ subfolders)
  match <set-dir>                       score PDQ / SSCD / face-PDQ /
                                        background-PDQ, recall at 1% FMR
  detect <set-dir>                      run the detector adapters (keyless
                                        adapters are skipped)
  gend-eval <set-dir>                   score the lab-gend service over the
                                        set's originals vs face-swap composites
                                        under the WP113 degradation ladder
                                        (ROC-AUC, accuracy at 0.5, no-face
                                        rate, bootstrap 95% CIs)
  trace <set-dir>                       run the site's trace scoring over every
                                        probe x original pair, report the
                                        charter E3 metric (right source first,
                                        wrong-source strong rate)
  report <run-dir>                      write report.md and report.html into a
                                        match or detect run directory

environment:
  OPENAI_API_KEY, OPENAI_VISION_MODEL, OPENAI_BASE_URL
  HIVE_API_KEY, HIVE_BASE_URL
  SIGHTENGINE_USER, SIGHTENGINE_SECRET, SIGHTENGINE_BASE_URL
  LAB_GEND_URL, LAB_GEND_TOKEN (the lab-gend service, for detect and gend-eval)
  LAB_BENCH_RUNS_DIR (default ./runs), LAB_BENCH_MODELS_DIR (default ./models),
  LAB_HUMAN_MODEL_BASE (face-landmark model location)
`;

export function parseArgs(argv: string[]): { command: string; args: string[] } | null {
  const [command, ...args] = argv;
  if (!command) return null;
  if (command === "-h" || command === "--help" || command === "help") return { command: "help", args };
  return { command, args };
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed) {
    process.stderr.write(USAGE);
    return 64;
  }
  const { command, args } = parsed;
  if (command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  try {
    if (command === "build-set") {
      const [inDir, outDir] = args;
      if (!inDir || !outDir) return usage();
      const result = await buildSet(inDir, outDir);
      process.stdout.write(
        `built ${result.set.items.length} items in ${outDir} ` +
          `(${result.facesFound} faces located${result.faceswapSkipped.length ? `, faceswap skipped for ${result.faceswapSkipped.length} portrait(s)` : ""})\n`,
      );
      return 0;
    }
    if (command === "match") {
      const [setDir] = args;
      if (!setDir) return usage();
      // The production run wants region methods when the locator can load.
      const { runDir } = await runMatch(setDir, { faceLocator: new HumanFaceLocator() });
      process.stdout.write(`match results in ${runDir}\n`);
      return 0;
    }
    if (command === "detect") {
      const [setDir] = args;
      if (!setDir) return usage();
      const { runDir, results } = await runDetect(setDir);
      process.stdout.write(
        `detect results in ${runDir} (${results.detectors.length} detector(s)` +
          `${results.skipped.length ? `, ${results.skipped.length} skipped` : ""})\n`,
      );
      return 0;
    }
    if (command === "gend-eval") {
      const [setDir] = args;
      if (!setDir) return usage();
      const { runDir, results } = await runGendEval(setDir);
      process.stdout.write(`GenD evaluation results in ${runDir}\n\n${renderGendEvalTable(results)}\n`);
      return 0;
    }
    if (command === "trace") {
      const [setDir] = args;
      if (!setDir) return usage();
      // Like match: the production run wants landmarks when the locator can
      // load; the trace core reports honestly when it cannot.
      const { runDir } = await runTrace(setDir, { faceLocator: new HumanFaceLocator() });
      process.stdout.write(`trace results in ${runDir}\n`);
      return 0;
    }
    if (command === "report") {
      const [runDir] = args;
      if (!runDir) return usage();
      const out = runReport(runDir);
      process.stdout.write(`report written to ${out.dir}/report.md and ${out.dir}/report.html\n`);
      return 0;
    }
  } catch (err) {
    process.stderr.write(`lab-bench: ${(err as Error).message}\n`);
    return 1;
  }
  return usage();
}

function usage(): number {
  process.stderr.write(USAGE);
  return 64;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(await runCli(process.argv.slice(2)));
}
