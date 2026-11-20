import {
  clampScore,
  firstJsonObject,
  truncate,
  toUploadJpeg,
  type Detector,
  type DetectorFactoryResult,
  type FetchLike,
} from "./types.ts";

export type OpenAiOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: FetchLike;
};

/**
 * OpenAI vision chat model as an "AI-made / manipulated" detector: the image
 * goes up as a data URL with a prompt that demands strict JSON
 * { ai_generated: boolean, confidence: 0..100 }. The score folds the verdict
 * and its stated confidence into one number on the shared 0..1 scale.
 */
export function createOpenAiDetector(opts: OpenAiOptions = {}): DetectorFactoryResult {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return { skipped: "OPENAI_API_KEY is not set" };
  const model = opts.model ?? process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  const baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const doFetch = opts.fetchFn ?? ((url, init) => fetch(url, init));

  return {
    detector: {
      id: "openai",
      name: `OpenAI vision (${model})`,
      async detect(image: Buffer) {
        try {
          const { body, mime } = await toUploadJpeg(image);
          const dataUrl = `data:${mime};base64,${body.toString("base64")}`;
          const prompt =
            "You are examining an image for signs it was generated or edited by AI, " +
            "including fully synthetic images, face swaps and other composites. " +
            'Answer strictly as JSON: {"ai_generated": true|false, "confidence": 0-100}. ' +
            "confidence is how sure you are of your answer.";
          const res = await doFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: "You are an image forensics assistant. Reply with JSON only." },
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } },
                  ],
                },
              ],
              temperature: 0,
            }),
          });
          if (!res.ok) return { error: `openai_http_${res.status}` };
          const json = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = json.choices?.[0]?.message?.content ?? "";
          const parsed = firstJsonObject(content);
          if (!parsed || typeof parsed.ai_generated !== "boolean") return { error: "openai_bad_response" };
          const confidence = clampScore((Number(parsed.confidence ?? 50) || 0) / 100);
          return {
            score: parsed.ai_generated ? confidence : 1 - confidence,
            label: parsed.ai_generated ? "ai" : "real",
            raw: truncate(content),
          };
        } catch {
          return { error: "openai_request_failed" };
        }
      },
    },
  };
}
