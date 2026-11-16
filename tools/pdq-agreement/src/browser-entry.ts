// Bundled by esbuild and loaded in Chromium. `hashImageFile` is a verbatim copy of
// the function in asmita/src/app/(auth)/submit/SubmitForm.tsx; tests/source-sync.test.ts
// fails if the two drift apart.
import { computePdqHash } from "../../../asmita/src/lib/pdq/pdq";

// BEGIN hashImageFile
async function hashImageFile(file: File): Promise<{ hash: string; quality: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const result = computePdqHash(imageData);
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } finally {
    bitmap.close();
  }
}
// END hashImageFile

(window as unknown as Record<string, unknown>).hashAll = async (input: HTMLInputElement) => {
  const out: Array<{ name: string; hash?: string; quality?: number; error?: string }> = [];
  for (const file of Array.from(input.files ?? [])) {
    try {
      const r = await hashImageFile(file);
      out.push({ name: file.name, ...r });
    } catch (e) {
      out.push({ name: file.name, error: String(e) });
    }
  }
  return out;
};
