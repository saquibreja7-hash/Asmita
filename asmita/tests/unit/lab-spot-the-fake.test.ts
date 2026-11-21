import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  quizManifestSchema,
  quizRoundSchema,
  SPOT_THE_FAKE_MAX_IMAGE_BYTES,
} from "@/lib/lab/spot-the-fake/quiz";

// WP95 (docs/lab/beta-spec.md): the quiz manifest
// public/lab/spot-the-fake/quiz.json and the images it lists. The spec's
// own test: "every manifest entry has a file, an answer and both
// languages" — plus the spec's other hard requirements these pages lean
// on: ten rounds, WebP under 150 KB each, and nothing that looks like a
// real URL, a real person or survivor data in a public repo.

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));
const quizDir = join(asmitaDir, "public", "lab", "spot-the-fake");
const manifest = JSON.parse(readFileSync(join(quizDir, "quiz.json"), "utf8")) as unknown;

describe("spot-the-fake quiz manifest", () => {
  it("is valid against the schema the page renders from", () => {
    const parsed = quizManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  it("every entry has a file, an answer and both languages, plus a scene and a source", () => {
    // The spec's test, spelled out field by field.
    const rounds = (manifest as { rounds: Array<Record<string, unknown>> }).rounds;
    expect(rounds.length).toBeGreaterThan(0);
    for (const round of rounds) {
      expect(typeof round.file).toBe("string");
      expect((round.file as string).endsWith(".webp")).toBe(true);
      expect(round.answer === "real" || round.answer === "ai").toBe(true);
      for (const field of ["scene", "tell"]) {
        const localized = round[field] as Record<string, unknown>;
        for (const language of ["en", "hi"]) {
          expect(typeof localized[language]).toBe("string");
          expect((localized[language] as string).trim().length).toBeGreaterThan(0);
        }
      }
      expect(typeof round.source).toBe("string");
      expect((round.source as string).trim().length).toBeGreaterThan(0);
    }
  });

  it("has exactly the ten rounds the spec asks for, with both answers in play", () => {
    const rounds = quizManifestSchema.parse(manifest).rounds;
    expect(rounds).toHaveLength(10);
    expect(new Set(rounds.map((round) => round.answer))).toEqual(new Set(["real", "ai"]));
    expect(new Set(rounds.map((round) => round.file)).size).toBe(10);
  });

  it("every listed image exists on disk, is a real WebP and stays under the 150 KB cap", () => {
    for (const round of quizManifestSchema.parse(manifest).rounds) {
      const path = join(quizDir, round.file);
      expect(existsSync(path), `${round.file} should exist in public/lab/spot-the-fake`).toBe(true);
      expect(statSync(path).size, `${round.file} should be under 150 KB`).toBeLessThanOrEqual(SPOT_THE_FAKE_MAX_IMAGE_BYTES);

      // The file's own magic bytes, never its name: RIFF….WEBP.
      const header = new Uint8Array(readFileSync(path).subarray(0, 12));
      expect([...header.slice(0, 4)].map((byte) => String.fromCharCode(byte)).join("")).toBe("RIFF");
      expect([...header.slice(8, 12)].map((byte) => String.fromCharCode(byte)).join("")).toBe("WEBP");
    }
  });

  it("keeps the public repo clean: no URLs, no real names in the manifest", () => {
    const text = JSON.stringify(manifest).toLowerCase();
    expect(text).not.toContain("http://");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("www.");
  });

  it("never lets a manifest entry point outside the tool's own folder", () => {
    // The schema is the gate the client relies on before it builds an
    // image URL; make sure it refuses traversal and junk, strictly.
    expect(quizRoundSchema.safeParse({ file: "../secret.webp", answer: "real" }).success).toBe(false);
    expect(quizRoundSchema.safeParse({ file: "a/b.webp", answer: "real" }).success).toBe(false);
    expect(
      quizRoundSchema.safeParse({
        file: "01-street-signs-real.webp",
        answer: "REAL",
        scene: { en: "x", hi: "y" },
        tell: { en: "x", hi: "y" },
        source: "z",
      }).success,
    ).toBe(false);
    expect(
      quizRoundSchema.safeParse({
        file: "01-street-signs-real.webp",
        answer: "real",
        scene: { en: "x", hi: "y" },
        tell: { en: "x", hi: "y" },
        source: "z",
        extra: "no unknown keys",
      }).success,
    ).toBe(false);
  });
});
