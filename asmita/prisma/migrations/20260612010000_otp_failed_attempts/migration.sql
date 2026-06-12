-- Track OTP brute-force attempts in the database so the lockout works on
-- stateless serverless deployments (OTP_PERSISTENCE=database).
ALTER TABLE "OtpToken" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
