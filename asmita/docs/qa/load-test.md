# Submission Load Test

Run 100 concurrent adult submission flows against a non-production deployment:

```bash
LOAD_TEST_BASE_URL=https://staging.example.org LOAD_TEST_CONCURRENCY=100 npm run test:load
```

The script performs the complete dev/test-mode flow:

- CSRF token retrieval.
- Email OTP request.
- OTP verification.
- Case creation.
- One submitted URL attached to the case.

The target must be configured to return `devOtp` from `/api/auth/request-otp`; production must not expose that field. Do not point this script at production.
