// Runs ESLint from asmita/ (where the flat config lives) on staged files that
// lint-staged passes as absolute paths. Exits non-zero on lint errors so the
// pre-commit hook blocks the commit.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "asmita");
const files = process.argv.slice(2).map((f) => path.relative(appDir, path.resolve(f)));
if (files.length === 0) process.exit(0);

const eslint = path.join(appDir, "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
const result = spawnSync(eslint, ["--fix", ...files], { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
