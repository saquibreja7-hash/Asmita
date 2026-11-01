import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourceConfigPath = resolve("wrangler.jsonc");
const builtConfigPath = resolve("dist/server/wrangler.json");
const productionConfigPath = resolve("dist/server/wrangler.production.json");

const sourceConfig = JSON.parse(await readFile(sourceConfigPath, "utf8"));
const production = sourceConfig.env?.production;
if (!production) {
  throw new Error("wrangler.jsonc must define env.production");
}

const builtConfig = JSON.parse(await readFile(builtConfigPath, "utf8"));
const productionConfig = {
  ...builtConfig,
  name: production.name,
  routes: production.routes,
  hyperdrive: production.hyperdrive,
  // Runs the Worker next to the Mumbai database; each request makes several queries.
  placement: production.placement,
  triggers: production.triggers,
  vars: production.vars,
};

delete productionConfig.definedEnvironments;
await writeFile(productionConfigPath, `${JSON.stringify(productionConfig, null, 2)}\n`);
console.log(`Prepared ${productionConfigPath}`);
