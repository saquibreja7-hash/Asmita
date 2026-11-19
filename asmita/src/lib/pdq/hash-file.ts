/**
 * The form's hashing entry (web audit WP42 P13): SubmitForm imports this
 * module only when a file is chosen, so the PDQ/vPDQ code and the hashing
 * Web Worker stay out of the form's initial JavaScript chunk and load on
 * demand.
 *
 * Image hashing runs in the worker (P1): her file is handed over whole and
 * decoded there. Where no worker can run - Worker or OffscreenCanvas missing,
 * or a worker that fails to load - the same full-resolution main-thread path
 * runs instead, exactly as before the worker existed, so hashes stay
 * bit-identical either way.
 */

import { computePdqHash, type PdqResult } from "./pdq";
import { hashFileInWorker, hashWorkerSupported, HashWorkerError } from "./hash-client";

// The draft builder needs these; re-exported so SubmitForm has no static
// import from the pdq modules at all (P13).
export { PDQ_CLIENT_VERSION } from "./pdq";
export { fingerprintVideo, toVideoHashItem, VpdqError } from "./vpdq";

export async function hashImageFile(file: File): Promise<PdqResult> {
  if (hashWorkerSupported()) {
    try {
      return await hashFileInWorker(file);
    } catch (err) {
      if (!(err instanceof HashWorkerError)) throw err;
      // The worker cannot be used; hash on the main thread instead.
    }
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    const result = computePdqHash(ctx.getImageData(0, 0, bitmap.width, bitmap.height));
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } finally {
    bitmap.close();
  }
}
