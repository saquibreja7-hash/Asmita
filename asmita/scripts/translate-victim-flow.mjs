/**
 * Translates victim-flow i18n keys from English to Hindi via Sarvam AI.
 * Run: SARVAM_API_KEY="..." node scripts/translate-victim-flow.mjs
 * Only translates keys in hi.json that still have the English placeholder value.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EN_JSON = join(__dirname, "../src/i18n/en.json");
const HI_JSON = join(__dirname, "../src/i18n/hi.json");

const API_KEY = process.env.SARVAM_API_KEY;
if (!API_KEY) {
  console.error("Set SARVAM_API_KEY env var first.");
  process.exit(1);
}

async function translate(text) {
  const res = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": API_KEY,
    },
    body: JSON.stringify({
      input: text,
      source_language_code: "en-IN",
      target_language_code: "hi-IN",
      speaker_gender: "Male",
      mode: "classic-colloquial",
      model: "mayura:v1",
      enable_preprocessing: false,
      numerals_format: "international",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sarvam API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.translated_text;
}

const VICTIM_NAMESPACES = [
  "start.",
  "eligibility.",
  "minor.",
  "identity.",
  "submit.",
  "review.",
  "case.",
  "sign.",
  "confirm.",
  "handoff.",
  "urldetail.",
  "delete.",
];

async function main() {
  const force = process.argv.includes("--force");
  const en = JSON.parse(readFileSync(EN_JSON, "utf8"));
  const hi = JSON.parse(readFileSync(HI_JSON, "utf8"));

  // Find keys that still have the English placeholder value (or all, if --force)
  const toTranslate = Object.entries(en).filter(
    ([k, v]) =>
      VICTIM_NAMESPACES.some((ns) => k.startsWith(ns)) && (force || hi[k] === v),
  );

  console.log(`Found ${toTranslate.length} keys to translate.\n`);
  let done = 0;
  let failed = 0;

  for (const [key, english] of toTranslate) {
    process.stdout.write(`[${++done}/${toTranslate.length}] ${key} ... `);
    try {
      hi[key] = await translate(english);
      console.log("ok");
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      hi[key] = english; // keep English as fallback
      failed++;
    }
    // Delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 600));
  }

  writeFileSync(HI_JSON, JSON.stringify(hi, null, 2) + "\n", "utf8");
  console.log(`\nDone. Translated ${done - failed}/${done}. Updated ${HI_JSON}`);
  if (failed > 0) {
    console.log(`${failed} keys kept English as fallback — re-run to retry.`);
  }
}

main();
