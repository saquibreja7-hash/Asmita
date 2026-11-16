/**
 * Starts only the mock Asmita API on 127.0.0.1:<port> (default 8787) with an
 * EMPTY source list, so the real build (`node dist/main.js run`) can be run
 * end to end against it without crawling anything:
 *
 *   npm run mock:api                     # terminal 1
 *   ASMITA_API_URL=http://127.0.0.1:8787 CRAWLER_SERVICE_KEY=<the key printed> \
 *   CRAWLER_USER_AGENT="AsmitaCrawler/0.1 (local)" node dist/main.js run   # terminal 2
 *
 * For a full crawl of a local fixture site use `npm run mock` instead.
 */
import { randomBytes } from "node:crypto";
import { MockAsmita } from "../tests/support/mock-asmita.ts";
import { randomFingerprint } from "../tests/support/synthetic.ts";

const port = Number(process.argv[2] ?? 8787);
const key = `local-${randomBytes(24).toString("hex")}`;
const api = new MockAsmita({
  key,
  sources: [],
  pool: {
    version: "local-mock",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: Array.from({ length: 10 }, (_, i) => ({ id: `mock-${i}`, pdq: randomFingerprint(i + 1), quality: 100 })),
  },
});
await api.start(port);
console.log(JSON.stringify({ mockApi: api.url, serviceKey: key, note: "test-only key, generated for this process" }));
