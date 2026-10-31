import { defineConfig, devices } from "@playwright/test";
import { appUrl } from "./tests/e2e/support/database";

// Real infrastructure: a throwaway local Postgres (reset by global-setup) and
// the dev server connected to it as a least-privilege role. Only Resend, the
// one external API, stays off (no key), so OTP codes come back as devOtp.
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: "npm run dev -- -p 3001",
    env: {
      E2E_TEST_BYPASS_RATE_LIMIT: "1",
      DATABASE_URL: appUrl,
      RESEND_API_KEY: "",
      OTP_PERSISTENCE: "database",
      EMAIL_PROOF_PERSISTENCE: "database",
      AUDIT_LOG_PERSISTENCE: "database",
      SECURITY_LOG_PERSISTENCE: "database",
      NOTICE_DISPATCH_PERSISTENCE: "database",
      ENABLE_HASH_UPLOAD: "true",
      ENABLE_PLATFORM_API: "false",
      ENABLE_PROVENANCE_CHECK: "true",
      DEV_SKIP_ADMIN_MFA: "true",
      JWT_SECRET: "e2e-test-only-jwt-secret-32-chars-long",
    },
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
