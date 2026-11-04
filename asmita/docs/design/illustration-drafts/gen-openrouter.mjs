// Draft illustrations for Asmita via OpenRouter, for review before use.
// Run from asmita/: node --env-file=.env.local <this file> <model> [outDir] [onlyId...]
// Reads OPENROUTER_API_KEY from the env. Pass --list as the model to list image models.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// .env.local wins over the shell, which may hold an old key.
const local = existsSync(".env.local") ? readFileSync(".env.local", "utf8").match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim() : undefined;
const KEY = local ?? process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error("Add OPENROUTER_API_KEY to .env.local first.");
  process.exit(1);
}
const MODEL = process.argv[2];
if (!MODEL || MODEL === "--list") {
  const { data } = await (await fetch("https://openrouter.ai/api/v1/models")).json();
  for (const m of data.filter((m) => m.architecture?.output_modalities?.includes("image")))
    console.log(m.id, JSON.stringify(m.pricing));
  process.exit(0);
}
const OUT = process.argv[3] ?? "images-review";
const ONLY = process.argv.slice(4);
const VARIANTS = Number(process.env.VARIANTS ?? 2);

const STYLE =
  "Hand-drawn single-weight continuous line illustration, black ink on a plain off-white (#f6f3f1) background. " +
  "Minimal and airy, lots of empty space. One flat accent fill in deep teal (#0a5e5a) and a few small touches of soft coral (#ff9473). " +
  "Indian women in everyday clothes (kurta, salwar, dupatta, saree), natural poses. Calm, dignified, quietly hopeful mood. " +
  "Strictly no text, letters, numbers or logos. No nudity, no revealing clothing, no phone screens showing photos, " +
  "no tears, no hands over faces, no padlocks, no hackers, no police. Not photorealistic.";

const IMAGES = [
  { id: "home-hero", where: "Home page hero", aspect: "4:3",
    scene: "A young woman sitting by an open window with a cup of chai, looking out calmly, shoulders relaxed, a small plant on the sill." },
  { id: "how-1-tell", where: "How it works, step 1", aspect: "1:1",
    scene: "A woman sitting cross-legged on a bed, holding a phone loosely in both hands, thoughtful but steady expression. The phone screen is blank." },
  { id: "how-2-send", where: "How it works, step 2", aspect: "1:1",
    scene: "A folded paper letter with a teal wax-seal style dot, gently flying forward with a few motion lines, small paper birds around it." },
  { id: "how-3-protect", where: "How it works, step 3", aspect: "1:1",
    scene: "A woman standing tall in a doorway with soft light behind her, one hand resting on the door frame, looking forward with quiet confidence." },
  { id: "start-support", where: "Start of filing", aspect: "4:3",
    scene: "Two women sitting side by side on a bench, one with a hand gently on the other's shoulder, both holding chai cups, talking softly." },
  { id: "done-relief", where: "Confirmation (you are done for now)", aspect: "4:3",
    scene: "A woman lying back on a floor cushion, eyes closed, exhaling, morning light falling across her, a few small leaves drifting." },
  { id: "stop-paths", where: "Not the right service screens", aspect: "4:3",
    scene: "A simple wooden signpost with three blank arrows at a fork in a quiet path, small bushes, birds in the sky." },
  { id: "who-we-help", where: "Who we help", aspect: "16:9",
    scene: "Four Indian women of different ages and styles walking together, one in a saree, one in jeans and kurti, one older with grey hair, one in salwar kameez, relaxed and connected." },
];

async function generate(image) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, "X-Title": "Asmita illustration drafts" },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      image_config: { aspect_ratio: image.aspect },
      messages: [{ role: "user", content: `${STYLE}

Scene: ${image.scene}` }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`no image returned: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

mkdirSync(OUT, { recursive: true });
for (const image of IMAGES.filter((i) => !ONLY.length || ONLY.includes(i.id))) {
  for (let v = 1; v <= VARIANTS; v++) {
    const file = join(OUT, `${image.id}-${MODEL.split("/").pop()}-v${v}.png`);
    try {
      writeFileSync(file, await generate(image));
      console.log("ok", file);
    } catch (e) {
      console.log("FAILED", image.id, v, e.message);
    }
  }
}
writeFileSync(join(OUT, "images.json"), JSON.stringify(IMAGES, null, 2));
