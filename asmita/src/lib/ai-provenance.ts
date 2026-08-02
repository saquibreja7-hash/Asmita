// Client-side AI provenance reader.
//
// This module runs ONLY in the browser. It reads AI-origin labels the file
// already carries in its IPTC / XMP / EXIF metadata, using exifr (pure JS, no
// network, no WebAssembly). It never uploads the file and never analyses pixels,
// so it only ever reports facts the file states about itself: it does not guess,
// and it cannot falsely accuse a genuine photo.
//
// Full C2PA Content Credential *verification* (signed manifests, SynthID) is
// handled server-side by the optional OpenAI deeper check, not here, to avoid
// shipping a WASM engine and a CDN dependency into the browser.

// IPTC DigitalSourceType values that mean "made with generative AI".
const AI_SOURCE_TYPES = [
  "trainedalgorithmicmedia",
  "compositewithtrainedalgorithmicmedia",
  "algorithmicmedia",
];

export type ProvenanceResult = {
  ai: boolean;
  /** Human-facing signals, e.g. "IPTC: Created using generative AI". */
  signals: string[];
  tool?: string;
  source?: string;
  signer?: string;
  /** Raw values kept for the "technical details" disclosure. */
  raw: Record<string, string>;
};

function looksAiSource(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.toLowerCase();
  return AI_SOURCE_TYPES.some((t) => v.includes(t));
}

export async function readImageProvenance(file: File): Promise<ProvenanceResult> {
  const result: ProvenanceResult = { ai: false, signals: [], raw: {} };

  try {
    const exifr = (await import("exifr")).default;
    const data = await exifr.parse(file, { xmp: true, iptc: true, tiff: true });
    if (!data) return result;

    // DigitalSourceType can surface under a few key spellings depending on writer.
    const sourceType =
      data.DigitalSourceType ??
      data["Iptc4xmpExt:DigitalSourceType"] ??
      data.digitalSourceType;
    if (looksAiSource(sourceType)) {
      result.ai = true;
      result.source = String(sourceType);
      result.signals.push("IPTC: Created using generative AI");
      result.raw.digitalSourceType = String(sourceType);
    }

    const software = data.Software ?? data.CreatorTool ?? data.HistorySoftwareAgent;
    if (typeof software === "string") {
      result.raw.software = software;
      if (/firefly|dall-?e|midjourney|stable ?diffusion|imagen|gemini|generative/i.test(software)) {
        result.ai = true;
        result.tool = result.tool ?? software;
        result.signals.push(`Metadata names an AI tool: ${software}`);
      }
    }
  } catch {
    // Metadata is optional; a file with none simply yields no signals.
  }

  return result;
}
