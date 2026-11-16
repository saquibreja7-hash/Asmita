import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The fs-write test patches node:fs in-process; keep files isolated.
    pool: "forks",
    // Same libvips setting as the container: keep decodes in memory.
    env: { VIPS_DISC_THRESHOLD: "2g" },
  },
});
