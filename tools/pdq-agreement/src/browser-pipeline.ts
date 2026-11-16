import { build } from "esbuild";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Fixture } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));

export type BrowserResult = { hash?: string; quality?: number; error?: string };

/** Runs the app's real browser path (hashImageFile + pdq.ts) in headless Chromium. */
export async function browserHashes(fixtures: Fixture[]): Promise<{ results: Map<string, BrowserResult>; userAgent: string }> {
  const bundle = await build({
    entryPoints: [path.join(here, "browser-entry.ts")],
    bundle: true, write: false, format: "iife", target: "es2022", platform: "browser",
  });
  const js = bundle.outputFiles[0].text;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="f" type="file" multiple>');
    await page.addScriptTag({ content: js });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const results = new Map<string, BrowserResult>();
    // Batches keep protocol payloads sane for the 4000px files.
    for (let i = 0; i < fixtures.length; i += 8) {
      const batch = fixtures.slice(i, i + 8);
      await page.setInputFiles("#f", batch.map((f) => ({ name: f.name, mimeType: f.mime, buffer: f.buffer })));
      const res = (await page.evaluate(
        "window.hashAll(document.getElementById('f'))",
      )) as Array<{ name: string } & BrowserResult>;
      for (const r of res) results.set(r.name, r);
    }
    return { results, userAgent };
  } finally {
    await browser.close();
  }
}
