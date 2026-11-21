/*
 * WP94 (docs/lab/beta-spec.md): stamp a visitor's own photo with C2PA
 * Content Credentials so later copies that keep the file can be traced back
 * to the person who stamped it.
 *
 * The manifest the engine writes carries exactly what the WP names:
 * - the creator name the visitor typed (optional), as the CreativeWork
 *   author — the assertion Content Credentials readers show as the creator;
 * - "created with Meri Asmita Lab", as the claim generator and its info;
 * - the time of stamping, on the c2pa.created action;
 * - the do-not-train statement. The C2PA specification retired its own
 *   c2pa.training-mining label in version 2.0; the live standard is the
 *   CAWG training-mining assertion (cawg.training-mining, the WP's
 *   "c2pa.training-mining do-not-train" by its successor name), which
 *   states all four uses — data mining, AI training, generative AI
 *   training and AI inference — as notAllowed.
 *
 * The image exists in memory for this one request and nowhere else: the
 * bytes go in, the signed bytes come back, nothing is stored, logged or
 * sent anywhere else.
 *
 * The claim is signed as C2PA v1 (claim_version 1): the v2 claim format
 * requires an RFC 3161 trusted timestamp from a time-stamping authority —
 * a third-party network service this tool must not call. v1 is what every
 * existing Content Credential in the wild carries, it validates as Valid on
 * the same engine the image checker runs, and the pinned engine version
 * still supports signing it. Recorded in docs/lab/beta-progress.md.
 */

import { engine, serialized, syncBlob, StampEngineError } from "./engine";
import { createCoseSigner } from "./cose";
import { stampSigningConfig } from "./signing-config";

export const STAMP_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type StampImageType = (typeof STAMP_IMAGE_TYPES)[number];

/** What the manifest records for every use the CAWG assertion governs. */
const DO_NOT_TRAIN = {
  "cawg.ai_generative_training": { use: "notAllowed" },
  "cawg.ai_training": { use: "notAllowed" },
  "cawg.ai_inference": { use: "notAllowed" },
  "cawg.data_mining": { use: "notAllowed" },
} as const;

export class StampError extends Error {
  constructor(public readonly code: "signing_not_configured" | "stamp_failed" | "engine_unavailable") {
    super(code);
  }
}

export type StampResult = { bytes: Uint8Array; type: StampImageType };

/**
 * Stamp one image. The origin is the request's own, used only to fetch the
 * site's first-party C2PA engine file. The creator name is optional and is
 * validated by the route before it reaches here.
 */
export async function stampImage(
  origin: string,
  input: { bytes: Uint8Array; type: StampImageType; creatorName?: string },
): Promise<StampResult> {
  const config = stampSigningConfig();
  if (!config) throw new StampError("signing_not_configured");

  let wasmModule: Awaited<ReturnType<typeof engine>>;
  try {
    wasmModule = await engine(origin);
  } catch (error) {
    if (error instanceof StampEngineError) throw new StampError("engine_unavailable");
    throw new StampError("engine_unavailable");
  }

  const { WasmBuilder } = wasmModule;

  // The manifest definition the engine builds from (c2pa-rs
  // ManifestDefinition). claim_generator_info is where "created with Meri
  // Asmita Lab" lives.
  const definition = {
    claim_generator: "meri-asmita-lab/1.0",
    claim_generator_info: [{ name: "Meri Asmita Lab" }],
    claim_version: 1,
    format: input.type,
    vendor: "org.meriasmita.lab",
  };

  const signer = await createCoseSigner(config.cert, config.key);

  return serialized(async () => {
    const builder = WasmBuilder.fromJson(JSON.stringify(definition), null);
    try {
      builder.addAction({
        action: "c2pa.created",
        when: new Date().toISOString(),
        softwareAgent: "meri-asmita-lab/1.0",
      });
      builder.addAssertion("cawg.training-mining", { entries: DO_NOT_TRAIN });
      const name = input.creatorName?.trim();
      if (name) {
        // The name the visitor typed, as the CreativeWork author. It is a
        // self-declared name inside a signed manifest, nothing more.
        builder.addAssertion("stds.schema-org.CreativeWork", {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          author: [{ "@type": "Person", name }],
        });
      }

      let bytes: Uint8Array;
      try {
        bytes = await builder.sign(
          { alg: signer.alg, reserveSize: signer.reserveSize, sign: (claim) => signer.sign(claim) },
          [],
          input.type,
          syncBlob(input.bytes),
        );
      } catch (error) {
        // The engine's own error text never contains the image bytes, but
        // keep the security log to fixed codes and the console to the
        // engine's message, which is all diagnostics anyone needs.
        console.error("[lab-stamp] signing failed:", error instanceof Error ? error.message : error);
        throw new StampError("stamp_failed");
      }
      return { bytes: new Uint8Array(bytes), type: input.type };
    } finally {
      // Release the Rust-side builder whatever happened.
      void builder.free();
    }
  });
}

/** The file name offered for a download, invented and never user input. */
export function stampDownloadName(type: StampImageType) {
  const extension = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
  return `content-credentials.${extension}`;
}
