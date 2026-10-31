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
      // MFA is enforced as in production; global-setup enrols the synthetic
      // admins the specs sign sessions for.
      DEV_SKIP_ADMIN_MFA: "false",
      ADMIN_EMAILS: "e2e-new-admin@example.invalid",
      OTP_GLOBAL_HOURLY_LIMIT: "1000",
      // next dev also loads .env.local; pin anything there that would change
      // behaviour or reach a real service, so local runs match CI.
      DEV_SKIP_LEGAL_REVIEW: "false",
      DEV_OTP_CODE: "",
      OPENAI_API_KEY: "",
      DIRECT_URL: "",
      MAINTENANCE_MODE: "false",
      JWT_SECRET: "e2e-test-only-jwt-secret-32-chars-long",
      CRON_SECRET: "e2e-test-only-cron-secret-32-chars-long",
      HEALTH_CHECK_SECRET: "e2e-test-only-health-secret-32-chars",
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
