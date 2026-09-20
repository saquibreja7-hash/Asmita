import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev -- -p 3001",
    env: {
      E2E_TEST_BYPASS_RATE_LIMIT: "1",
      DATABASE_URL: "",
      RESEND_API_KEY: "",
      OTP_PERSISTENCE: "memory",
      QUEUE_DRIVER: "memory",
      RATE_LIMIT_DRIVER: "memory",
      EMAIL_PROOF_PERSISTENCE: "memory",
      AUDIT_LOG_PERSISTENCE: "memory",
      SECURITY_LOG_PERSISTENCE: "memory",
      NOTICE_DISPATCH_PERSISTENCE: "memory",
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
