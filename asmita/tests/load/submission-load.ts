type Json = Record<string, unknown>;

const baseUrl = process.env.LOAD_TEST_BASE_URL || "http://localhost:3001";
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || "100");

function cookieFrom(response: Response) {
  const raw = response.headers.get("set-cookie");
  return raw?.split(";")[0] || "";
}

async function json(response: Response) {
  return (await response.json()) as Json;
}

async function csrf() {
  const response = await fetch(`${baseUrl}/api/csrf`);
  if (!response.ok) throw new Error(`csrf_failed:${response.status}`);
  const payload = await json(response);
  return { token: String(payload.token), cookie: cookieFrom(response) };
}

async function runSubmission(index: number) {
  const email = `load-${Date.now()}-${index}@example.com`;
  const csrfPair = await csrf();
  const otpResponse = await fetch(`${baseUrl}/api/auth/request-otp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": csrfPair.cookie,
      "x-csrf-token": csrfPair.token,
    },
    body: JSON.stringify({ email }),
  });
  if (!otpResponse.ok) throw new Error(`otp_failed:${otpResponse.status}`);
  const otpPayload = await json(otpResponse);
  const devOtp = otpPayload.devOtp;
  if (typeof devOtp !== "string") {
    throw new Error("LOAD_TEST requires a non-production target that returns devOtp.");
  }

  const verifyCsrf = await csrf();
  const verifyResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": verifyCsrf.cookie,
      "x-csrf-token": verifyCsrf.token,
    },
    body: JSON.stringify({ email, otp: devOtp, ageOver18: true }),
  });
  if (!verifyResponse.ok) throw new Error(`verify_failed:${verifyResponse.status}`);
  const sessionCookie = cookieFrom(verifyResponse);

  const caseCsrf = await csrf();
  const createResponse = await fetch(`${baseUrl}/api/cases/create`, {
    method: "POST",
    headers: {
      "cookie": `${sessionCookie}; ${caseCsrf.cookie}`,
      "x-csrf-token": caseCsrf.token,
    },
  });
  if (!createResponse.ok) throw new Error(`case_failed:${createResponse.status}`);
  const created = await json(createResponse);

  const urlsCsrf = await csrf();
  const urlResponse = await fetch(`${baseUrl}/api/cases/${String(created.caseId)}/urls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": `${sessionCookie}; ${urlsCsrf.cookie}`,
      "x-csrf-token": urlsCsrf.token,
    },
    body: JSON.stringify({
      urls: [`https://www.instagram.com/p/load-${index}`],
      declaration: true,
    }),
  });
  if (!urlResponse.ok) throw new Error(`url_failed:${urlResponse.status}`);
}

async function main() {
  const start = Date.now();
  const results = await Promise.allSettled(Array.from({ length: concurrency }, (_, index) => runSubmission(index)));
  const failures = results.filter((result) => result.status === "rejected");
  const elapsedMs = Date.now() - start;

  console.log(
    JSON.stringify(
      {
        baseUrl,
        concurrency,
        successes: results.length - failures.length,
        failures: failures.length,
        elapsedMs,
        requestsPerSecond: Number(((results.length * 5) / (elapsedMs / 1000)).toFixed(2)),
        firstFailure: failures[0]?.status === "rejected" ? String(failures[0].reason) : null,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
