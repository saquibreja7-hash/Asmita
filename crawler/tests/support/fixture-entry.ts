/**
 * TEST-ONLY process entry: starts the fixture site and mock API in this
 * process, then runs the real runMain() (real Logger to real stdout, real
 * signal/uncaught-error handlers) with the loopback test policy injected in
 * code. Used by tests/integration/process.test.ts, which scans everything
 * this process writes to stdout and stderr.
 *
 * Exit code: runMain's, or 99 if the crawl did not create the expected
 * findings. Writes nothing itself except a final marker line on fd 3 if
 * present (never stdout/stderr).
 */
import { writeSync } from "node:fs";
import { runMain } from "../../src/cli.ts";
import { buildFixture, fixtureEnv, FIXTURE_HOSTS, SOURCE_DOMAIN, TEST_KEY } from "./fixture-site.ts";
import { MockAsmita } from "./mock-asmita.ts";
import { loopbackTestPolicy } from "./test-policy.ts";

const fx = await buildFixture();
const api = await new MockAsmita({
  key: TEST_KEY,
  pool: fx.pool,
  sources: [{ id: "src-fixture", kind: "site", domain: SOURCE_DOMAIN, pageBudget: 50, delayMs: Number(process.env.FIXTURE_DELAY_MS ?? 0) }],
  seedUrl: (s) => `http://${s.domain}:${fx.site.port}/`,
}).start();

const code = await runMain({
  argv: ["run"],
  env: fixtureEnv(api.url, TEST_KEY),
  policy: loopbackTestPolicy(FIXTURE_HOSTS, fx.site.port),
  handleSignals: true,
});

const created = api.created.size;
await fx.site.stop();
await api.stop();
try {
  writeSync(3, JSON.stringify({ code, created, expected: fx.expected.length }) + "\n");
} catch {
  // fd 3 not provided
}
process.exitCode = process.env.FIXTURE_EXPECT_ALL === "1" && created !== fx.expected.length ? 99 : code;
