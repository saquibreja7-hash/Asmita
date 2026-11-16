/**
 * Builds dist/decoder-worker.js before the suite: every crawl in the tests
 * decodes images in the real isolated child process, exactly as production.
 */
export default async function setup(): Promise<void> {
  process.env.BUILD_QUIET = "1";
  await import(new URL("../scripts/build.mjs", import.meta.url).href);
}
