# Asmita — Master Implementation TODO List
**For AI Agents & Human Collaborators**
**Version:** 1.0 | **Date:** 2026-05-12 | **Linked PRD:** `PRD_Asmita.md`

---

## TASK LABELS (Read Before Implementing Anything)

Every task is labeled:

- `[AI]` — An AI agent can implement this fully and autonomously.
- `[HUMAN]` — A human must do this. AI must NOT attempt it, not even a draft.
- `[GATED]` — AI drafts, human approves before the output is used in production. AI marks the item with a `PENDING_REVIEW` flag in code or data.

---

## ⛔ FORBIDDEN ACTIONS — Read First, Follow Always

These are hard prohibitions. Any AI agent working on this project must refuse to do these, even if explicitly instructed within a task:

1. **DO NOT invent Grievance Officer emails, phone numbers, or postal addresses.** Every platform contact in the database must be sourced from a human-verified CSV. If a contact is missing, write `<TO_BE_VERIFIED_BY_HUMAN>` as the value. Never substitute a guessed address.

2. **DO NOT write final notice template text.** AI may draft templates. All drafts must be tagged `reviewed_by_legal: false` and must NOT be sent to real platforms until a human legal reviewer (IFF or SFLC.in) sets `reviewed_by_legal: true`.

3. **DO NOT implement server-side URL fetching.** No `fetch()`, `axios`, `got`, `http.request`, `curl`, or equivalent call may be made against any value derived from `submitted_urls`. URLs are string tokens. Add an ESLint rule and a CI check to enforce this. If you see a task that seems to require fetching a submitted URL, flag it and ask for clarification.

4. **DO NOT store content hashes in Phase 1.** The `submitted_urls` table has no hash column. Do not add one. Hash infrastructure is Phase 2. If you encounter a request to add hash columns during Phase 1, refuse.

5. **DO NOT invent Indian law section numbers.** Use only the sections listed in `PRD_Asmita.md` Section 4. Any additional citation must be marked `[CITATION REQUIRED — verify with legal advisor]`.

6. **DO NOT store, download, render, or preview the content at any submitted URL.** The URL is used only for domain extraction and notice generation. This constraint applies at every layer — frontend, backend, worker, admin panel.

7. **DO NOT allow age verification bypass.** The minor pathway (POCSO) gate is non-negotiable. Any code path that skips the age attestation check must be flagged as a critical bug.

---

## Tech Stack (Pinned 2026-05-12)

Implementer must verify these are current stable releases at the time they begin Phase 1:

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js (latest stable, ~15.x) | App Router, TypeScript strict mode |
| Language | TypeScript 5.x | `strict: true` in tsconfig |
| Database | PostgreSQL 16+ | |
| ORM | Prisma (latest stable) | |
| Email | Resend | DKIM/SPF configured on notices@meriasmita.org |
| Job Queue | BullMQ + Redis 7+ | For escalation scheduler |
| Validation | Zod | All API inputs validated with Zod schemas |
| Auth | Custom OTP via email | No passwords; JWT via `jose` |
| Encryption | Node.js `crypto` (built-in) | AES-256-GCM for PII fields |
| CSS | Tailwind CSS + shadcn/ui | |
| Testing | Vitest + Playwright | Unit + integration + E2E |
| Linting | ESLint + custom rule: no-url-fetch | |
| CI | GitHub Actions | |
| Hosting | Vercel (frontend + API) + Supabase (Postgres + Redis) | India region where available |

---

## Project Directory Structure

All code lives in:
```
asmita/
├── src/
│   ├── app/
│   │   ├── (public)/           ← Landing, about, resources, Hindi toggle
│   │   ├── (auth)/             ← Register, verify-otp, logout
│   │   ├── (victim)/           ← Submit URLs, dashboard, case detail
│   │   ├── (minor)/            ← POCSO-specific pathway
│   │   ├── (admin)/            ← Internal admin panel
│   │   └── api/                ← All API routes
│   ├── lib/
│   │   ├── url-parser.ts
│   │   ├── notice-generator.ts
│   │   ├── notice-router.ts
│   │   ├── escalation-engine.ts
│   │   ├── encryption.ts
│   │   ├── audit.ts
│   │   └── email.ts
│   ├── jobs/
│   │   ├── queue.ts
│   │   └── escalation-worker.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   └── layout/
│   └── i18n/
│       ├── en.json
│       └── hi.json
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── scripts/
│   └── seed-platforms.ts       ← Reads from human-verified CSV only
├── .env.example
└── docs/
    └── adr/                    ← Architecture Decision Records
```

---

## PHASE 0 — Foundation (Human Work, No Code)

> All Phase 0 tasks must be completed before any Phase 1 code is merged to production. AI can assist with drafts but humans decide and verify.

### 0.A Legal & Compliance

- [ ] `[HUMAN]` **0.A.1** Contact Internet Freedom Foundation (IFF) at `policy@internetfreedom.in` and request a legal review engagement for notice templates and POCSO protocol. Document response.
- [ ] `[HUMAN]` **0.A.2** Alternatively/additionally, contact SFLC.in at `contact@sflcindia.org` for the same. At least one of IFF or SFLC.in must commit to reviewing templates before launch.
- [ ] `[HUMAN]` **0.A.3** Get a legal opinion on whether Asmita, as an independent platform/NGO, has a mandatory reporting obligation under POCSO Act 2012 when it receives a minor-related submission. Document the opinion in `docs/legal/pocso-reporting-obligation.md`.
- [ ] `[HUMAN]` **0.A.4** Decide the legal entity type for Asmita: Section 8 Company, Trust, or Society. File the registration. The legal entity name must appear on all takedown notices.
- [ ] `[HUMAN]` **0.A.5** Register a domain for Asmita (e.g., `meriasmita.org`). Set up `notices@meriasmita.org` email with DKIM, SPF, and DMARC records. Document the DNS setup in `docs/infra/email-dns.md`.
- [ ] `[HUMAN]` **0.A.6** Confirm DPDP Act 2023 implementation rules have been notified by the Government of India as of launch date. If notified, engage a lawyer to review data handling practices against the rules. Document in `docs/legal/dpdp-compliance.md`.

### 0.B Platform Database Research

> **WARNING FOR AI AGENTS:** You are not allowed to do 0.B tasks. These require human verification of real contact details. Hallucinated emails make the platform useless or dangerous.

- [ ] `[HUMAN]` **0.B.1** Research and verify the Grievance Officer contact for each Tier 1 platform. Source from the platform's own website (Terms, Privacy, Contact, or Help page). Record in `data/platforms-verified.csv` with columns: `platform_name, domain_patterns, tier, grievance_email, grievance_officer_name, grievance_address, form_url, api_endpoint, notice_basis, last_verified_date, verified_by, source_url`. Minimum Tier 1 platforms: Meta (Facebook/Instagram), YouTube (Google India), Twitter/X, WhatsApp, ShareChat, Josh, Moj, MX TakaTak, Snapchat.
- [ ] `[HUMAN]` **0.B.2** Research and verify Tier 2 platform contacts (porn sites): Pornhub (Aylo), xVideos, xHamster, XNXX, RedTube, SpankBang. Record in same CSV.
- [ ] `[HUMAN]` **0.B.3** Research Tier 3 platforms (web form only, no direct email): Telegram, lesser Indian platforms, WordPress-hosted sites. Document their takedown form URLs.
- [ ] `[HUMAN]` **0.B.4** Research Google Search, Bing, DuckDuckGo search delisting processes for explicit content. Document step-by-step in `docs/platform-guides/search-delisting.md`.
- [ ] `[HUMAN]` **0.B.5** Research Cloudflare, AWS, and other major CDN/hosting provider abuse contact emails. These are the escalation path when a platform ignores notices — the fallback is contacting their infrastructure provider. Document in `data/hosting-providers-verified.csv`.

### 0.C NGO & Partnership Outreach

- [ ] `[HUMAN]` **0.C.1** Contact iCall (TISS) at `icall@tiss.edu` to establish a referral partnership. Asmita will link to iCall for mental health support; iCall workers can submit cases as NGO-vouched. Document MOU terms.
- [ ] `[HUMAN]` **0.C.2** Contact Cyber Peace Foundation for technical partnership and referrals.
- [ ] `[HUMAN]` **0.C.3** Contact Point of View and Red Dot Foundation for NGO vouching program.
- [ ] `[HUMAN]` **0.C.4** Identify at least one Indian cyber law attorney willing to be listed as a free legal aid referral for Asmita victims.

### 0.D Design System Decisions

- [ ] `[HUMAN]` **0.D.1** Decide primary and secondary brand colors, typography, and logo for Asmita. The design must feel safe, trustworthy, and non-threatening — not clinical or bureaucratic. Record final decisions in `docs/design/brand.md`.
- [ ] `[GATED]` **0.D.2** `[AI]` Create `src/lib/design-tokens.ts` exporting the color palette, font stack, and spacing scale based on the approved brand document. `[HUMAN]` reviews before use.

---

## PHASE 1A — Project Bootstrap

### 1.A.1 Repository Setup

- [ ] `[AI]` **1.A.1.1** Initialize a Next.js project with TypeScript, Tailwind CSS, and App Router:
  ```bash
  npx create-next-app@latest asmita --typescript --tailwind --app --src-dir --import-alias "@/*"
  ```
  Done when: `npm run dev` starts without errors; `npm run build` succeeds; `npm run type-check` returns 0 errors.

- [ ] `[AI]` **1.A.1.2** Configure `tsconfig.json` with `"strict": true`. Fix all strict-mode errors introduced by the scaffolding.
  Done when: `tsc --noEmit` exits with code 0.

- [ ] `[AI]` **1.A.1.3** Configure ESLint. Add rule `no-restricted-syntax` to block any `fetch(` or `axios` call whose argument is derived from a variable named `url`, `submittedUrl`, `contentUrl`, or `urlString`. Document the rule in `docs/adr/001-no-url-fetch.md`.
  Done when: Creating a test file `tests/lint/no-url-fetch.test.ts` with a dummy `fetch(submittedUrl)` call causes `eslint` to exit with an error.

- [ ] `[AI]` **1.A.1.4** Install and configure Vitest for unit tests and Playwright for E2E tests.
  Done when: `npm run test` runs Vitest; `npm run test:e2e` runs Playwright; both exit 0 with no tests (empty test suite is OK at this stage).

- [ ] `[AI]` **1.A.1.5** Create `.env.example` with all required environment variables (no actual secrets). Include:
  ```
  DATABASE_URL=postgresql://...
  DIRECT_URL=postgresql://...           # Prisma direct connection
  ENCRYPTION_KEY=                        # 32-byte AES key, hex-encoded
  JWT_SECRET=                            # 32+ char random string
  RESEND_API_KEY=
  RESEND_FROM_EMAIL=notices@meriasmita.org
  REDIS_URL=redis://...
  NEXT_PUBLIC_APP_URL=https://meriasmita.org
  ADMIN_OTP_EMAIL=                       # admin login email
  ```
  Done when: `.env.example` exists; `.gitignore` includes `.env`, `.env.local`, `.env.production`.

- [ ] `[AI]` **1.A.1.6** Set up GitHub Actions CI workflow at `.github/workflows/ci.yml`. Steps: install deps → type-check → lint → test → build. Runs on every PR to `main`.
  Done when: Pushing a branch with a type error causes the CI workflow to fail.

### 1.A.2 Database Setup

- [ ] `[AI]` **1.A.2.1** Install Prisma. Create `prisma/schema.prisma` with the following complete schema. Every enum value and every column must match exactly — do not add, remove, or rename columns:

  ```prisma
  generator client {
    provider = "prisma-client-js"
  }

  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }

  enum UserRole {
    VICTIM
    SUPPORTER
    NGO_WORKER
    ADMIN
  }

  enum CaseStatus {
    OPEN
    PARTIALLY_RESOLVED
    RESOLVED
    CLOSED
    ESCALATED
  }

  enum PlatformTier {
    TIER_1
    TIER_2
    TIER_3
  }

  enum NoticeBasis {
    IT_RULES_2021
    DMCA
    IT_RULES_AND_DMCA
    EMAIL_ONLY
    FORM_ONLY
  }

  enum UrlStatus {
    PENDING_REVIEW
    NOTICE_QUEUED
    NOTICE_SENT
    ESCALATED
    REMOVED
    UNRESOLVED
    REJECTED
  }

  enum NoticeMethod {
    API
    EMAIL
    FORM_HANDOFF
  }

  enum ResponseType {
    ACKNOWLEDGED
    REMOVED
    REJECTED
    NO_RESPONSE
  }

  enum TemplateType {
    IT_RULES_2021
    DMCA
    IT_RULES_AND_DMCA
    ESCALATION_L1
    ESCALATION_L2
    FIR_PACKAGE
  }

  enum AuditEventType {
    USER_REGISTERED
    USER_VERIFIED
    CASE_CREATED
    URL_SUBMITTED
    URL_FLAGGED
    URL_APPROVED
    URL_REJECTED
    NOTICE_QUEUED
    NOTICE_SENT
    NOTICE_FAILED
    ESCALATION_L1_TRIGGERED
    ESCALATION_L2_TRIGGERED
    ESCALATION_L3_TRIGGERED
    CONTENT_REMOVED
    CASE_CLOSED
    ADMIN_ACTION
    NGO_VERIFIED
  }

  model User {
    id                  String    @id @default(uuid())
    emailHash           String    @unique                  // SHA-256(lowercase(email))
    emailEncrypted      String                             // AES-256-GCM
    emailVerified       Boolean   @default(false)
    aadhaarVerified     Boolean   @default(false)
    digilockerVerified  Boolean   @default(false)
    role                UserRole  @default(VICTIM)
    ageOver18           Boolean                            // true = adult, false = minor
    createdAt           DateTime  @default(now())
    lastActiveAt        DateTime?
    deactivatedAt       DateTime?                          // soft delete

    cases               Case[]    @relation("VictimCases")
    verifiedCases       Case[]    @relation("NgoVerifiedCases")
    auditLogs           AuditLog[]
  }

  model Case {
    id               String      @id @default(uuid())
    referenceNumber  String      @unique                   // ASMITA-YYYY-NNNNN format
    userId           String
    status           CaseStatus  @default(OPEN)
    state            String?
    city             String?
    ngoVerified      Boolean     @default(false)
    ngoVerifierId    String?
    declarationSignedAt DateTime?
    declarationIpHash   String?                           // SHA-256 of submitter IP
    createdAt        DateTime    @default(now())
    updatedAt        DateTime    @updatedAt

    user             User        @relation("VictimCases", fields: [userId], references: [id])
    ngoVerifier      User?       @relation("NgoVerifiedCases", fields: [ngoVerifierId], references: [id])
    submittedUrls    SubmittedUrl[]
  }

  model Platform {
    id                       String        @id @default(uuid())
    name                     String
    domainPatterns           String[]                      // e.g. ["pornhub.com", "*.pornhub.com"]
    tier                     PlatformTier
    noticeBasis              NoticeBasis
    grievanceEmail           String?                       // NULL until HUMAN-verified
    grievanceName            String?
    grievanceAddress         String?
    formUrl                  String?
    apiEndpoint              String?
    responseRate7d           Float?                        // computed by background job
    lastContactVerifiedAt    DateTime?
    lastContactVerifiedByHuman Boolean     @default(false)
    isActive                 Boolean       @default(true)
    createdAt                DateTime      @default(now())
    updatedAt                DateTime      @updatedAt

    submittedUrls            SubmittedUrl[]
    noticeTemplates          NoticeTemplate[]
  }

  model SubmittedUrl {
    id            String      @id @default(uuid())
    caseId        String
    urlEncrypted  String                                   // AES-256-GCM
    urlHash       String                                   // SHA-256(normalizedUrl) for dedup
    domain        String                                   // extracted domain (plaintext)
    platformId    String?
    status        UrlStatus   @default(PENDING_REVIEW)
    submittedAt   DateTime    @default(now())
    flaggedForReview Boolean  @default(false)
    flagReason    String?

    case          Case        @relation(fields: [caseId], references: [id])
    platform      Platform?   @relation(fields: [platformId], references: [id])
    notices       Notice[]
  }

  model NoticeTemplate {
    id               String        @id @default(uuid())
    platformId       String?                               // NULL = generic template
    templateType     TemplateType
    subjectTemplate  String
    bodyTemplate     String                                // Handlebars template syntax
    legalCitations   Json                                  // Array of { section, act, text }
    reviewedByLegal  Boolean       @default(false)         // GATED: must be true before use
    reviewedAt       DateTime?
    reviewedByName   String?
    isActive         Boolean       @default(true)
    version          Int           @default(1)
    createdAt        DateTime      @default(now())

    platform         Platform?     @relation(fields: [platformId], references: [id])
    notices          Notice[]
  }

  model Notice {
    id                  String        @id @default(uuid())
    urlId               String
    templateId          String?
    routingTier         Int                                // 1, 2, or 3
    method              NoticeMethod
    sentAt              DateTime?
    recipientEmail      String?
    messageId           String?                           // email Message-ID header
    payloadHash         String?                           // SHA-256 of notice body
    responseReceivedAt  DateTime?
    responseType        ResponseType?
    removedAt           DateTime?
    escalationLevel     Int           @default(0)          // 0=initial, 1=24h, 2=48h, 3=7day
    createdAt           DateTime      @default(now())

    submittedUrl        SubmittedUrl  @relation(fields: [urlId], references: [id])
    template            NoticeTemplate? @relation(fields: [templateId], references: [id])
    escalations         Escalation[]
  }

  model Escalation {
    id           String   @id @default(uuid())
    noticeId     String
    level        Int                                      // 1, 2, or 3
    triggeredAt  DateTime @default(now())
    actionType   String                                   // 'email_sent' | 'victim_notified' | 'fir_package_generated'
    completedAt  DateTime?

    notice       Notice   @relation(fields: [noticeId], references: [id])
  }

  model AuditLog {
    id          String          @id @default(uuid())
    eventType   AuditEventType
    entityType  String?
    entityId    String?
    actorId     String?
    data        Json?
    ipHash      String?
    createdAt   DateTime        @default(now())

    actor       User?           @relation(fields: [actorId], references: [id])

    // Rows in this table are NEVER updated or deleted — append-only by design
    @@index([entityId])
    @@index([createdAt])
  }

  model OtpToken {
    id          String   @id @default(uuid())
    emailHash   String
    tokenHash   String                                    // SHA-256 of the 6-digit OTP
    expiresAt   DateTime
    used        Boolean  @default(false)
    createdAt   DateTime @default(now())

    @@index([emailHash])
  }
  ```
  Done when: `npx prisma generate` and `npx prisma db push` both succeed; `npx prisma validate` exits 0.

- [ ] `[AI]` **1.A.2.2** Create `src/lib/db.ts` exporting a singleton Prisma client:
  ```typescript
  // src/lib/db.ts
  import { PrismaClient } from '@prisma/client'
  declare global { var prisma: PrismaClient | undefined }
  export const db = globalThis.prisma ?? new PrismaClient()
  if (process.env.NODE_ENV !== 'production') globalThis.prisma = db
  ```
  Done when: Importing `db` in a test file and calling `db.user.count()` returns without throwing.

- [ ] `[AI]` **1.A.2.3** Write a Prisma seed script at `prisma/seed.ts` that:
  - Creates one admin user (email from `ADMIN_OTP_EMAIL` env var)
  - Reads `data/platforms-verified.csv` (must exist; throws with a clear message if it doesn't)
  - Inserts all platforms from the CSV (never invents data)
  - Inserts draft notice templates tagged `reviewedByLegal: false`
  The script must log `SKIPPED: platforms-verified.csv not found` and exit gracefully if the CSV is absent (does NOT create placeholder platforms).
  Done when: Running `npx prisma db seed` with and without the CSV both exit 0 with appropriate log output.

### 1.A.3 Encryption Module

- [ ] `[AI]` **1.A.3.1** Create `src/lib/encryption.ts` using Node.js built-in `crypto`. Must export:
  ```typescript
  export function encrypt(plaintext: string): string
  // Returns base64url-encoded string: iv(12 bytes) + authTag(16 bytes) + ciphertext
  // Algorithm: AES-256-GCM
  // Key: from process.env.ENCRYPTION_KEY (32-byte hex string)

  export function decrypt(ciphertext: string): string
  // Reverses encrypt(). Throws TypeError on invalid input.

  export function hashEmail(email: string): string
  // Returns SHA-256(lowercase(trim(email))) as hex string
  // Used for deduplication without storing plaintext email

  export function hashIp(ip: string): string
  // Returns SHA-256(ip) as hex string

  export function hashPayload(payload: string): string
  // Returns SHA-256(payload) as hex string — for tamper-evident notice log
  ```
  Done when:
  - Unit test `tests/unit/encryption.test.ts` verifies `decrypt(encrypt(x)) === x` for 10 fixture strings
  - Unit test verifies `encrypt(x) !== encrypt(x)` (different IVs each call)
  - Unit test verifies `hashEmail('Test@Example.com') === hashEmail('test@example.com')`
  - No test uses a real email address

### 1.A.4 Email Module

- [ ] `[AI]` **1.A.4.1** Create `src/lib/email.ts` wrapping Resend. Must export:
  ```typescript
  export interface SendEmailResult {
    messageId: string
    success: boolean
    error?: string
  }

  export async function sendOtp(to: string, otp: string): Promise<SendEmailResult>
  // Subject: "Your Asmita login code: {{otp}}"
  // Body: plain text, Hindi + English, 10-minute validity notice

  export async function sendNoticeEmail(params: {
    to: string
    subject: string
    body: string
    caseReference: string
  }): Promise<SendEmailResult>
  // Returns messageId from Resend — stored in notices.messageId for audit trail

  export async function sendVictimStatusUpdate(params: {
    toEncryptedEmail: string  // decrypts before sending
    caseReference: string
    updateType: 'notice_sent' | 'response_received' | 'content_removed' | 'escalation_triggered'
    platformName: string
    nextSteps?: string
  }): Promise<SendEmailResult>
  ```
  Done when:
  - `sendOtp` in test mode (env `RESEND_API_KEY=test`) returns a mock result without throwing
  - Unit tests mock Resend and verify correct `from` address is used on all calls

### 1.A.5 Audit Log Module

- [ ] `[AI]` **1.A.5.1** Create `src/lib/audit.ts` exporting:
  ```typescript
  export async function writeAuditLog(params: {
    eventType: AuditEventType
    entityType?: string
    entityId?: string
    actorId?: string
    data?: Record<string, unknown>
    ipHash?: string
  }): Promise<void>
  ```
  Constraints:
  - This function only inserts rows — it never updates or deletes audit log rows
  - If the insert fails, it must log the error to stderr but NOT throw (audit failures must not break user flows)
  - Must be callable from API routes, background jobs, and admin actions
  Done when: Unit test inserts 5 audit events and verifies all 5 are queryable; test also verifies that a deliberately failed insert (mock DB throws) does not throw from `writeAuditLog`.

---

## PHASE 1B — Authentication System

### 1.B.1 OTP Generation & Verification

- [ ] `[AI]` **1.B.1.1** Create `src/lib/auth/otp.ts` exporting:
  ```typescript
  export function generateOtp(): string
  // Returns a cryptographically random 6-digit string (NOT Math.random)
  // Uses crypto.randomInt(100000, 999999).toString()

  export async function storeOtp(emailHash: string, otp: string): Promise<void>
  // Stores SHA-256(otp) in OtpToken table with expiresAt = now() + 10 minutes
  // Deletes any previous unused OTPs for the same emailHash first

  export async function verifyOtp(emailHash: string, otp: string): Promise<boolean>
  // Returns true if a valid, unexpired, unused OTP matches
  // Marks matching OTP as used=true (one-time use)
  // Returns false (does NOT throw) for invalid/expired OTPs
  ```
  Done when: Unit tests cover: valid OTP → true, expired OTP → false, already-used OTP → false, wrong OTP → false, reuse after valid use → false.

- [ ] `[AI]` **1.B.1.2** Create `src/lib/auth/jwt.ts` exporting:
  ```typescript
  export async function signToken(payload: {
    userId: string
    role: UserRole
    ageOver18: boolean
  }): Promise<string>
  // Signs a JWT with 7-day expiry using jose + JWT_SECRET env var

  export async function verifyToken(token: string): Promise<{
    userId: string
    role: UserRole
    ageOver18: boolean
  } | null>
  // Returns null (does NOT throw) for invalid/expired tokens
  ```
  Done when: Unit tests verify sign→verify round trip; expired token (mock clock) returns null; tampered token returns null.

### 1.B.2 API Routes — Auth

- [ ] `[AI]` **1.B.2.1** Create `POST /api/auth/request-otp`:
  - Input (Zod): `{ email: string }` — validate email format, max 254 chars
  - Logic:
    1. Hash email
    2. Check if user exists by emailHash; if not, create user with `emailVerified: false`
    3. Generate and store OTP
    4. Send OTP email via `sendOtp()`
    5. Write audit log: `USER_REGISTERED` (if new) or `OTP_REQUESTED`
  - Output: `{ success: true }` always (never reveal if email exists)
  - Rate limit: max 3 OTP requests per email per 15 minutes (use Redis counter)
  Done when: Integration test sends request with valid email → receives `{success: true}`; second call within rate limit window also succeeds; 4th call within window returns HTTP 429.

- [ ] `[AI]` **1.B.2.2** Create `POST /api/auth/verify-otp`:
  - Input (Zod): `{ email: string, otp: string, ageOver18: boolean }`
  - Logic:
    1. Hash email
    2. Verify OTP
    3. If valid: set `emailVerified: true`, set `ageOver18` on user record, generate JWT
    4. Set JWT in `HttpOnly; Secure; SameSite=Strict` cookie named `__asmita_session`
    5. Write audit log: `USER_VERIFIED`
  - Output: `{ success: true, redirectTo: '/submit' }` if ageOver18, `{ success: true, redirectTo: '/minor-support' }` if under 18
  - On invalid OTP: HTTP 401, `{ error: 'invalid_otp' }` — no detail about why
  Done when: Integration test full flow: request-otp → verify-otp → session cookie set; minor age → redirect to /minor-support.

- [ ] `[AI]` **1.B.2.3** Create `POST /api/auth/logout`:
  - Clears the `__asmita_session` cookie
  - No auth required (clearing a cookie never needs auth)
  Done when: Test verifies cookie is absent in response Set-Cookie header after logout.

### 1.B.3 Auth Middleware

- [ ] `[AI]` **1.B.3.1** Create `src/lib/auth/middleware.ts` exporting:
  ```typescript
  export async function requireAuth(request: Request): Promise<{
    userId: string
    role: UserRole
    ageOver18: boolean
  }>
  // Reads __asmita_session cookie, calls verifyToken()
  // Throws Response with HTTP 401 if not authenticated
  // Throws Response with HTTP 403 if ageOver18 is false (minor — should not reach victim routes)
  ```
  Done when: Unit test with no cookie → 401; expired token → 401; minor user token → 403 on victim routes.

- [ ] `[AI]` **1.B.3.2** Create `src/lib/auth/require-admin.ts`:
  - Calls `requireAuth()`; additionally checks `role === 'ADMIN'`
  - Throws HTTP 403 if not admin
  Done when: Unit test with VICTIM role token → 403; ADMIN role token → passes.

### 1.B.4 Auth UI Pages

- [ ] `[AI]` **1.B.4.1** Create `src/app/(auth)/register/page.tsx` — email entry form.
  - Single field: email address
  - Submits to `POST /api/auth/request-otp`
  - On success: shows "We sent a code to your email" and transitions to OTP entry
  - Form validation: email format, max 254 chars
  - Language: English and Hindi toggle (see i18n tasks)
  - Trauma-informed tone: calm, safe, no urgency language
  Done when: Playwright test enters email → form submits → transitions to OTP entry state.

- [ ] `[AI]` **1.B.4.2** Create OTP entry UI (within same page, not a new route):
  - 6 individual digit input boxes (tab/arrow navigation between them)
  - Age attestation checkbox: "I confirm I am 18 or older" (required to check for adult pathway) AND a separate "I am under 18" option
  - Submit button disabled until all 6 digits entered and age confirmed
  - On success: redirect per API response
  - On invalid OTP: show error "The code did not match. Please try again." (no technical detail)
  Done when: Playwright test enters valid OTP → redirected to /submit; wrong OTP → error message shown; age attestation unchecked → submit button disabled.

---

## PHASE 1C — URL Submission System

### 1.C.1 URL Parser

- [ ] `[AI]` **1.C.1.1** Create `src/lib/url-parser.ts` exporting:
  ```typescript
  export interface ParsedUrl {
    normalizedUrl: string      // lowercase scheme+host+path, strip UTM params and tracking fragments
    domain: string             // e.g. 'pornhub.com' — no subdomain except known ones
    platformId: string | null  // UUID from platforms table, or null if unknown
    routingTier: 1 | 2 | 3 | null  // from platform record, null if unknown
  }

  export type ParseUrlResult =
    | { success: true; parsed: ParsedUrl }
    | { success: false; error: 'invalid_url' | 'non_http_scheme' | 'localhost_blocked' | 'private_ip_blocked' }

  export async function parseUrl(input: string): Promise<ParseUrlResult>
  ```
  Implementation rules:
  - Use `new URL(input)` for parsing — never regex for URL validation
  - Block `localhost`, `127.0.0.1`, `10.x.x.x`, `192.168.x.x`, `::1` — prevents SSRF via platform DB later
  - Block non-http/https schemes (`ftp://`, `file://`, etc.)
  - **Do NOT make any HTTP requests to the URL** (ESLint rule covers this)
  - Domain extraction: strip `www.` prefix; for `m.facebook.com` → match to `facebook.com`
  - Platform matching: query `platforms` table where domain matches any element of `domainPatterns[]`; support wildcard `*.domain.com`
  Done when: Unit tests in `tests/unit/url-parser.test.ts` pass for all fixtures in `tests/fixtures/url-parser-fixtures.json` (at minimum 20 fixtures including: valid pornhub URL, valid instagram URL, unknown domain, localhost, private IP, ftp://, malformed URL, URL with tracking params, Telegram channel URL).

- [ ] `[AI]` **1.C.1.2** Create `tests/fixtures/url-parser-fixtures.json` with at least 20 test cases:
  ```json
  [
    { "input": "https://www.instagram.com/reel/ABC123/", "expect": { "success": true, "domain": "instagram.com" } },
    { "input": "http://localhost/test", "expect": { "success": false, "error": "localhost_blocked" } },
    { "input": "https://192.168.1.1/content", "expect": { "success": false, "error": "private_ip_blocked" } },
    { "input": "ftp://example.com/file", "expect": { "success": false, "error": "non_http_scheme" } },
    { "input": "not-a-url", "expect": { "success": false, "error": "invalid_url" } },
    { "input": "https://www.pornhub.com/view_video.php?viewkey=abc123", "expect": { "success": true, "domain": "pornhub.com" } },
    { "input": "https://xvideos.com/video123/title", "expect": { "success": true, "domain": "xvideos.com" } },
    { "input": "https://t.me/channelname/12345", "expect": { "success": true, "domain": "t.me" } },
    { "input": "https://unknown-site.example.com/content", "expect": { "success": true, "domain": "unknown-site.example.com", "platformId": null } },
    { "input": "https://www.facebook.com/video/123456?utm_source=share&utm_medium=web", "expect": { "success": true, "domain": "facebook.com", "normalizedUrl_excludes": ["utm_source", "utm_medium"] } }
  ]
  ```
  Add 10 more fixtures covering edge cases. All fixtures must have corresponding unit tests.

### 1.C.2 URL Submission API

- [ ] `[AI]` **1.C.2.1** Create `POST /api/cases/create`:
  - Auth required (victim or supporter role)
  - Input (Zod): `{ state?: string, city?: string }`
  - Logic:
    1. Generate `referenceNumber`: format `ASMITA-{YYYY}-{5-digit zero-padded sequential number}` — use a DB sequence or `count()` + 1
    2. Create `Case` record
    3. Sign and record `declarationSignedAt` = now(), `declarationIpHash` = `hashIp(request IP)`
    4. Write audit log: `CASE_CREATED`
  - Output: `{ caseId: string, referenceNumber: string }`
  Done when: Integration test creates a case; verifies referenceNumber format matches `ASMITA-\d{4}-\d{5}`; verifies audit log row created.

- [ ] `[AI]` **1.C.2.2** Create `POST /api/cases/:caseId/urls`:
  - Auth required; verify requesting user owns the case (or is admin/NGO worker)
  - Input (Zod):
    ```typescript
    {
      urls: string[]  // array of 1–10 URLs per submission
      declaration: true  // must be literally `true` — user confirmed declaration
    }
    ```
  - Per URL logic:
    1. Call `parseUrl(url)`
    2. If parseUrl returns error: add to `errors[]` array; continue to next URL
    3. Compute `urlHash = hashPayload(normalizedUrl)`
    4. Check for duplicate: if a SubmittedUrl with same `caseId` + `urlHash` exists → skip with `duplicate: true`
    5. Encrypt URL: `urlEncrypted = encrypt(normalizedUrl)`
    6. Create `SubmittedUrl` record with status `PENDING_REVIEW` if flagged, else `NOTICE_QUEUED`
    7. Run abuse detection check (see 1.C.3 below) — if flagged, set `flaggedForReview: true`
    8. Add to notice queue via BullMQ (see Phase 1E)
    9. Write audit log: `URL_SUBMITTED`
  - Rate limit: max 10 URL submissions per case per 24 hours
  - Output: `{ accepted: ParsedUrl[], errors: string[], duplicates: string[], flagged: string[] }`
  Done when: Integration test submits 3 valid URLs → all accepted; submits same URLs again → all marked duplicate; submits 11 URLs → 10 accepted, 1 error (rate limit); submits `localhost` URL → error returned.

- [ ] `[AI]` **1.C.2.3** Create `GET /api/cases/:caseId`:
  - Auth required; verify user owns case or is admin
  - Returns case with status, all submitted URLs (domain + status; never decrypted URL), notices sent per URL
  - Decrypts emails internally for display but never returns encrypted blobs to client
  Done when: Integration test creates case + URL + notice → GET returns correct structure.

### 1.C.3 Abuse Detection

- [ ] `[AI]` **1.C.3.1** Create `src/lib/abuse-detection.ts` exporting:
  ```typescript
  export interface AbuseCheckResult {
    flagged: boolean
    reason?: string
  }

  export async function checkUrlSubmission(params: {
    userId: string
    url: string
    domain: string
    caseId: string
  }): Promise<AbuseCheckResult>
  ```
  Flag conditions (any one triggers a flag):
  - More than 3 different domains submitted by same user in last 1 hour
  - URL matches a known list of clearly public, non-intimate URL patterns (YouTube watch pages, news site patterns like `*.bbc.co.uk`, `*.ndtv.com` — maintain a `public-url-patterns.json` blocklist)
  - User account is less than 1 hour old AND submitting more than 3 URLs
  Done when: Unit tests cover each flag condition; non-flagged submissions return `{ flagged: false }`.

- [ ] `[AI]` **1.C.3.2** Create `tests/fixtures/public-url-patterns.json` with at least 30 known-safe/public domain patterns (news sites, government sites, YouTube, Wikipedia) that should never appear in a NCII submission. These patterns are used by `checkUrlSubmission` to auto-flag suspicious submissions.
  Done when: Unit test verifies `https://www.youtube.com/watch?v=abc` is flagged; `https://xvideos.com/video123` is not flagged by this check.

### 1.C.4 URL Submission UI

- [ ] `[AI]` **1.C.4.1** Create `src/app/(victim)/submit/page.tsx` — the core victim-facing form.
  Layout sections (in order):
  1. **Declaration block** (cannot be skipped): Display full declaration text in both Hindi and English. Single checkbox: "I confirm and sign this declaration." Submit button disabled until checked.
  2. **URL entry area**: Text area for pasting URLs (one per line) OR individual URL input boxes (up to 10). Show a character counter and URL count.
  3. **Platform preview**: After pasting, show a live-updated list of detected platforms (domain only — no URL shown back). If a domain is unrecognized, show "Unknown platform — will be reviewed manually."
  4. **Submit button**: "Send Takedown Notices"
  5. **What happens next**: A brief, plain-language explanation of the three-tier routing and timeline.

  UX requirements (trauma-informed):
  - No language suggesting the victim must prove anything
  - No preview or thumbnail of any URL content (UI must not attempt to fetch OG tags, favicons, or previews from submitted URLs — this is the no-URL-fetch rule applied to frontend)
  - Progress shown as "Your notices are being prepared" not "Processing"
  - Support resources link visible at all times (not buried in footer)
  Done when: Playwright test: login → submit form → declaration checked → URLs entered → submit → redirected to case dashboard.

- [ ] `[AI]` **1.C.4.2** Add real-time platform detection to the URL submission form:
  - As user pastes/types URLs, debounce 400ms then call `GET /api/platforms/detect?urls=...`
  - Display detected platform name and tier next to each URL
  - Display "Unknown — will be reviewed" for unrecognized domains
  - **Never display the URL back to the user** — only display the domain name (security: don't accidentally render malicious URL content)
  Done when: Playwright test pastes a pornhub URL → platform "Pornhub" appears within 1 second; unknown domain → "Unknown — will be reviewed" appears.

- [ ] `[AI]` **1.C.4.3** Create `GET /api/platforms/detect`:
  - Input: `urls[]` query param (max 10)
  - For each URL: run `parseUrl()`, return `{ domain, platformId, platformName, tier }`
  - Auth NOT required (public; no user data involved)
  - Rate limit: 30 requests per minute per IP
  Done when: Unit test verifies each URL returns correct platform info without making any HTTP requests.

---

## PHASE 1D — Notice Generation & Routing

### 1.D.1 Notice Generator

- [ ] `[GATED]` **1.D.1.1** Create draft notice templates in the database (via seed script). Templates must use Handlebars syntax. Draft the following template types — all tagged `reviewedByLegal: false` until human legal review:

  **Template 1 — IT_RULES_2021** (for Indian platforms with Grievance Officer):
  ```
  Subject: [URGENT — IT Rules 2021 Rule 3(2)(b)] Non-Consensual Intimate Image Removal Request | {{caseReference}}

  Dear {{grievanceName}},

  We write on behalf of a verified Indian national (Case Reference: {{caseReference}}) whose intimate images/video have been shared without their consent on your platform.

  Non-Consensual Intimate Content URL: {{contentUrl}}

  This content constitutes violations of:
  1. Section 66E of the Information Technology Act, 2000 (violation of privacy — 3 years imprisonment + ₹2 lakh fine)
  2. Section 67A of the Information Technology Act, 2000 (publishing sexually explicit material electronically)
  3. Section 77 of the Bharatiya Nyaya Sanhita, 2023 (voyeurism)

  Under Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, you are required to acknowledge this complaint within 24 hours and take action to remove the content expeditiously.

  {{#if aadhaarVerified}}The complainant's identity has been verified through Aadhaar offline KYC.{{/if}}
  {{#if ngoVerified}}This case has been verified and supported by {{ngoName}}.{{/if}}
  {{#if firFiled}}An FIR has been filed at {{firStation}} under Sections {{firSections}}.{{/if}}

  A signed digital declaration of non-consent is on record (Case Reference: {{caseReference}}).

  Please confirm removal and write to: notices@meriasmita.org

  This notice was sent on: {{sentAt}}
  Case Reference: {{caseReference}}

  Asmita — Digital Dignity Platform ({{legalEntityName}})
  notices@meriasmita.org | https://meriasmita.org
  ```

  **Template 2 — DMCA** (for international/US-hosted platforms):
  ```
  Subject: DMCA Takedown Notice — Non-Consensual Intimate Image | {{caseReference}}

  To: {{grievanceName}} / DMCA Agent

  This is a formal notice under 17 U.S.C. § 512(c) (Digital Millennium Copyright Act).

  I am acting as authorized agent for the individual depicted in the content at:
  {{contentUrl}}

  The complainant is the copyright holder and/or subject of this intimate image/video, which was published without their consent.

  Additionally, this content violates Indian law including Section 66E and 67A of the Information Technology Act, 2000, applicable to platforms accessible in India.

  I have a good faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law.

  I declare under penalty of perjury that this information is accurate, and that I am authorized to act on behalf of the complainant.

  Content to be removed: {{contentUrl}}
  Case Reference: {{caseReference}}
  Date: {{sentAt}}

  Asmita — Digital Dignity Platform ({{legalEntityName}})
  notices@meriasmita.org | https://meriasmita.org
  ```

  **Template 3 — ESCALATION_L1** (24-hour follow-up):
  ```
  Subject: FOLLOW-UP (24 hours): Removal Request Unacknowledged | {{caseReference}}

  Dear {{grievanceName}},

  We sent a removal request 24 hours ago regarding non-consensual intimate content at {{contentUrl}} (Case Reference: {{caseReference}}).

  We have not received acknowledgment. Under IT Rules 2021 Rule 3(2)(b), you are required to acknowledge within 24 hours.

  This is our first escalation notice. Please act immediately.

  Asmita — Digital Dignity Platform
  notices@meriasmita.org
  ```

  **Template 4 — ESCALATION_L2** (48-hour):
  Similar structure, notes 48 hours elapsed, mentions that the victim has been advised to file a complaint at cybercrime.gov.in.

  **Template 5 — FIR_PACKAGE** (7-day): Not an email — a PDF-ready document compiling: case reference, URLs submitted, all notices sent (with timestamps and message IDs), non-response record, applicable legal sections. Generated for victim to use in police FIR filing.

  `[HUMAN]` review: IFF or SFLC.in must set `reviewedByLegal: true` in database for each template before it can be used in production notices. AI must not bypass this gate.

- [ ] `[AI]` **1.D.1.2** Create `src/lib/notice-generator.ts` exporting:
  ```typescript
  export interface NoticeContext {
    caseReference: string
    contentUrl: string
    grievanceName: string
    legalEntityName: string
    sentAt: string            // ISO string formatted as human-readable
    aadhaarVerified: boolean
    ngoVerified: boolean
    ngoName?: string
    firFiled: boolean
    firStation?: string
    firSections?: string
  }

  export interface GeneratedNotice {
    subject: string
    body: string
    payloadHash: string       // SHA-256 of (subject + '\n\n' + body)
    templateId: string
    templateVersion: number
  }

  export async function generateNotice(
    templateType: TemplateType,
    platformId: string | null,
    context: NoticeContext
  ): Promise<GeneratedNotice>
  ```
  Implementation rules:
  - Fetch template from DB where `platformId = platformId AND templateType = templateType AND isActive = true AND reviewedByLegal = true`
  - Fall back to generic template (platformId = null) if no platform-specific one exists
  - Throw `Error('NO_REVIEWED_TEMPLATE: template not found or not yet reviewed by legal')` if no reviewed template exists
  - Use Handlebars to render; throw on missing required variables
  - Compute `payloadHash` before returning
  Done when: Unit test with mocked DB generates a notice and verifies `payloadHash` matches re-computed SHA-256 of the body.

### 1.D.2 Notice Router

- [ ] `[AI]` **1.D.2.1** Create `src/lib/notice-router.ts` exporting:
  ```typescript
  export interface RouteResult {
    tier: 1 | 2 | 3
    method: NoticeMethod
    messageId?: string        // from Resend, if email sent
    success: boolean
    error?: string
  }

  export async function routeNotice(params: {
    platform: Platform
    notice: GeneratedNotice
    caseReference: string
  }): Promise<RouteResult>
  ```
  Routing logic:
  - **Tier 1 (API)**: If `platform.apiEndpoint` is set and `platform.tier === TIER_1` → call platform API (implementation stubbed for now — each platform API is a separate task). Return `{ tier: 1, method: 'API', ... }`.
  - **Tier 2 (Email)**: If `platform.grievanceEmail` is set and is NOT `<TO_BE_VERIFIED_BY_HUMAN>` → send email via `sendNoticeEmail()`. Return messageId.
  - **Tier 3 (Form Handoff)**: If neither API nor email available → return `{ tier: 3, method: 'FORM_HANDOFF', success: true }` — victim is shown the form URL and a pre-filled notice to copy-paste.
  - If `platform` is null (unknown domain) → use Tier 3 with a generic notice template.
  Done when: Unit tests verify all three routing paths; test verifies that a platform with `grievanceEmail = '<TO_BE_VERIFIED_BY_HUMAN>'` routes to Tier 3 (not email).

### 1.D.3 Notice Queue & Worker

- [ ] `[AI]` **1.D.3.1** Create `src/jobs/queue.ts` setting up BullMQ:
  ```typescript
  export const noticeQueue = new Queue('notice-processing', { connection: redisClient })
  export const escalationQueue = new Queue('escalation', { connection: redisClient })

  export interface NoticeJob {
    submittedUrlId: string
    caseId: string
    noticeType: TemplateType
  }

  export interface EscalationJob {
    noticeId: string
    level: 1 | 2 | 3
  }

  export async function enqueueNotice(job: NoticeJob): Promise<void>
  export async function enqueueEscalation(job: EscalationJob, delayMs: number): Promise<void>
  ```
  Done when: Unit test (with mock Redis) enqueues a job and verifies it appears in the queue.

- [ ] `[AI]` **1.D.3.2** Create `src/jobs/notice-worker.ts`:
  - Processes jobs from `noticeQueue`
  - For each `NoticeJob`:
    1. Fetch `SubmittedUrl` by `submittedUrlId`; if `flaggedForReview = true` → skip and log
    2. Fetch `Platform` by `platformId`
    3. Build `NoticeContext` from case and user data
    4. Call `generateNotice()` → if throws `NO_REVIEWED_TEMPLATE` → mark URL status as `UNRESOLVED`, write audit log, notify admin
    5. Call `routeNotice()` → on success: create `Notice` record with `payloadHash`, `messageId`, `sentAt`
    6. Update `SubmittedUrl.status` to `NOTICE_SENT`
    7. Write audit log: `NOTICE_SENT`
    8. Send victim status update email: "We've sent a takedown notice to [Platform]"
    9. Enqueue escalation: `enqueueEscalation({ noticeId, level: 1 }, 24 * 60 * 60 * 1000)` (24 hours)
  - On any error: retry up to 3 times with exponential backoff; after 3 failures write `NOTICE_FAILED` audit log
  Done when: Integration test with mocked email and DB verifies end-to-end flow: job enqueued → notice created → audit log written → escalation enqueued.

---

## PHASE 1E — Auto-Escalation Engine

- [ ] `[AI]` **1.E.1** Create `src/jobs/escalation-worker.ts`:
  - Processes jobs from `escalationQueue`
  - For each `EscalationJob`:

    **Level 1 (24 hours — no response)**:
    1. Fetch `Notice` by `noticeId`; if `responseType` is set (platform responded) → skip escalation
    2. Generate escalation notice using `ESCALATION_L1` template
    3. Route via same method as original notice
    4. Update `Notice.escalationLevel = 1`
    5. Create `Escalation` record
    6. Send victim update: "24 hours have passed. We've sent a follow-up to [Platform]."
    7. Enqueue Level 2: `enqueueEscalation({ noticeId, level: 2 }, 24 * 60 * 60 * 1000)` (another 24 hours)
    8. Write audit log: `ESCALATION_L1_TRIGGERED`

    **Level 2 (48 hours — no response)**:
    Same as Level 1 but uses `ESCALATION_L2` template.
    Victim update includes: "We recommend you also file a complaint at cybercrime.gov.in. Here's how: [link to guide]"
    Enqueue Level 3: delay = 5 days (5 × 24 × 60 × 60 × 1000)
    Write audit log: `ESCALATION_L2_TRIGGERED`

    **Level 3 (7 days — no response)**:
    1. Generate FIR Package: compile all notices for this case (all URLs, all sent notices, all escalations, timestamps, message IDs) into a structured JSON → convert to formatted PDF via a server-side PDF generation (use `@react-pdf/renderer` or Puppeteer — same as generate_pdf.js but server-side)
    2. Store FIR package PDF in a temp S3 bucket with a 30-day expiry signed URL
    3. Send victim email with FIR package download link and step-by-step FIR filing guide
    4. Update `Case.status = ESCALATED`
    5. Write audit log: `ESCALATION_L3_TRIGGERED`

  Done when: Integration test with mocked time advances clock 24h → Level 1 fires; 48h → Level 2 fires; 7 days → Level 3 fires and FIR package PDF is generated.

- [ ] `[AI]` **1.E.2** Create `src/lib/fir-package-generator.ts` exporting:
  ```typescript
  export async function generateFirPackage(caseId: string): Promise<Buffer>
  // Returns a PDF buffer suitable for download or storage
  // PDF contains:
  //   Cover page: Asmita logo, case reference, generation date, "For use in police FIR filing"
  //   Section 1: Victim declaration summary (not the actual declaration text — just the fact it was signed and the timestamp)
  //   Section 2: Table of submitted URLs (domain + submission date — NOT the decrypted URL; decrypted URL appears only in the downloadable victim copy)
  //   Section 3: All notices sent — platform, date, method, message ID, response status
  //   Section 4: Escalation history — level, date, action
  //   Section 5: Applicable laws (verbatim from PRD Section 4)
  //   Section 6: Guidance text — "Take this document to your nearest police station and request an FIR under [sections]"
  //   Section 7: Contact for police verification — notices@meriasmita.org
  ```
  Done when: Integration test generates a PDF for a mock case with 2 URLs and 3 notices; PDF buffer is non-empty; PDF can be opened.

---

## PHASE 1F — Case Tracking Dashboard

- [ ] `[AI]` **1.F.1** Create `GET /api/cases` — list all cases for the authenticated user:
  - Returns array of `{ caseId, referenceNumber, status, createdAt, urlCount, noticeCount, removedCount }`
  Done when: Integration test creates 2 cases → GET returns 2 items.

- [ ] `[AI]` **1.F.2** Create `src/app/(victim)/case/[caseId]/page.tsx` — case detail page.
  Display (in order):
  1. **Case header**: reference number, status badge, created date
  2. **Progress summary**: "X of Y platforms have confirmed removal"
  3. **URL list**: For each submitted URL, show:
     - Platform name (not the URL itself — never render the URL in the UI)
     - Status badge (color-coded: pending, sent, acknowledged, removed, escalated)
     - Most recent notice sent date
     - Escalation level indicator
     - "View Details" expand panel showing notice history timeline
  4. **Add more URLs** button → opens URL submission form scoped to this case
  5. **Download FIR Package** button (visible when any URL is at escalation level 3)
  6. **Support resources** section — always visible, never hidden
  Done when: Playwright test creates case with 2 URLs → dashboard shows 2 platform rows with correct statuses.

- [ ] `[AI]` **1.F.3** Add `POST /api/cases/:caseId/mark-resolved` — victim can manually mark a URL as resolved if the platform acted outside Asmita's tracking:
  - Input: `{ urlId: string, resolution: 'removed_by_platform' | 'victim_withdrew' }`
  - Updates `SubmittedUrl.status` and cancels pending escalation jobs for this URL
  - Write audit log: `CONTENT_REMOVED` or `CASE_CLOSED`
  Done when: Integration test marks URL as resolved → escalation queue job for that notice is cancelled.

---

## PHASE 1G — Audit & Proof System

> This is a Phase 1 feature, not Phase 2. Every notice sent must produce a tamper-evident record for police FIR use.

- [ ] `[AI]` **1.G.1** Create `GET /api/cases/:caseId/audit-trail` — returns the full audit log for a case:
  - Auth required; user must own case or be admin
  - Returns events sorted by `createdAt` ASC
  - Each event: `{ eventType, entityType, entityId, data (sanitized — no PII), createdAt }`
  - Never returns `ipHash` or encrypted fields to the client
  Done when: Integration test creates case → submits URL → notice sent → GET returns 3 audit events in order.

- [ ] `[AI]` **1.G.2** Add email delivery proof storage:
  - When `sendNoticeEmail()` succeeds, store the Resend `messageId` in `Notice.messageId`
  - The `messageId` (e.g., `<abc123@resend.dev>`) is the email's SMTP `Message-ID` header and proves delivery
  - This value is included in the FIR package
  Done when: Integration test sends notice → Notice record has non-null `messageId`.

- [ ] `[AI]` **1.G.3** Implement `payloadHash` verification for notices:
  - When a `Notice` row is read for inclusion in an FIR package, recompute `SHA-256(subject + '\n\n' + body)` using the template and context from that time
  - If hash doesn't match, flag in the FIR package: "⚠ Notice content may have been modified — hash mismatch"
  - In practice, if templates are updated, old notices should retain their original text — store the rendered body in `notices.renderedBody` (encrypted)
  Update schema: add `renderedBodyEncrypted TEXT` to `Notice` model.
  Done when: Unit test stores a notice with rendered body, then modifies the template, then regenerates → hash mismatch detected.

---

## PHASE 1H — Admin Panel

- [ ] `[AI]` **1.H.1** Create `src/app/(admin)/layout.tsx` — admin panel wrapper:
  - Calls `requireAdmin()` middleware
  - Navigation: Cases, Flagged URLs, Platforms, Templates, Audit Log, Response Rates
  Done when: Playwright test with victim session → redirect to /login; admin session → admin panel loads.

- [ ] `[AI]` **1.H.2** Create `src/app/(admin)/cases/page.tsx` — case management:
  - Table: reference number, status, created date, URL count, escalation count
  - Filters: status, date range, NGO-verified only
  - Click → case detail (same as victim view but with admin extras: user email, IP hash, flag reason)
  Done when: Admin can view list of cases and click into one.

- [ ] `[AI]` **1.H.3** Create `src/app/(admin)/flagged/page.tsx` — flagged URL review queue:
  - Shows all `SubmittedUrl` records with `flaggedForReview = true` and status `PENDING_REVIEW`
  - Per item: domain, flag reason, case reference, submission date
  - Actions: "Approve" (set `flaggedForReview = false`, `status = NOTICE_QUEUED`, enqueue notice) | "Reject" (set `status = REJECTED`, send victim notification explaining rejection reason)
  - Write audit log: `URL_APPROVED` or `URL_REJECTED` with admin user ID
  Done when: Playwright test admin approves a flagged URL → status changes to NOTICE_QUEUED; audit log shows admin ID.

- [ ] `[AI]` **1.H.4** Create `src/app/(admin)/platforms/page.tsx` — platform database management:
  - Table: name, tier, notice basis, grievance email (masked — show first 3 chars + ***), last verified date, response rate
  - Edit form for each platform — admin can update contacts
  - `lastContactVerifiedByHuman` checkbox — admin must manually check this after verifying a contact
  - Warning banner on any platform where `lastContactVerifiedByHuman = false` or `grievanceEmail` contains `TO_BE_VERIFIED`
  Done when: Admin edits a platform's grievance email → record updated; `lastContactVerifiedAt` and `lastContactVerifiedByHuman` updated.

- [ ] `[AI]` **1.H.5** Create `src/app/(admin)/templates/page.tsx` — notice template management:
  - List templates with `reviewedByLegal` status prominently shown
  - Unreviewed templates shown with a red "NOT REVIEWED — DO NOT USE" banner
  - Edit form: subject, body (with Handlebars preview)
  - `reviewedByLegal` toggle — can only be set to `true` by ADMIN role (not by AI agent running admin commands)
  - When toggled to `true`: require human to enter their name in `reviewedByName` field
  Done when: Playwright test admin opens template, sets `reviewedByLegal = true` with reviewer name → saved; template list shows green "Legal Reviewed" badge.

- [ ] `[AI]` **1.H.6** Create `src/app/(admin)/response-rates/page.tsx` — platform effectiveness dashboard:
  - Bar chart: per-platform response rate (% notices that received a response within 7 days)
  - Table: platform name, notices sent, acknowledged, removed, no_response, avg_response_time
  - This data drives Phase 2 partnership conversations
  - Background job (runs nightly): recompute `Platform.responseRate7d` from last 30 days of `Notice` records
  Done when: Background job runs → updates `responseRate7d` on all platforms; dashboard displays correct rates.

---

## PHASE 1I — POCSO Minor Pathway

- [ ] `[AI]` **1.I.1** Create `src/app/(minor)/page.tsx` — the minor support page. This page is shown when `ageOver18 = false` at login. It must:
  - NOT use the adult case submission flow
  - Display (in both Hindi and English):
    - CHILDLINE 1098 number prominently (large, bold, with "Call Now" link for mobile)
    - Step-by-step instructions for filing at cybercrime.gov.in for CSAM complaints
    - Link and instructions for TakeItDown.org (NCMEC — free global service for minors)
    - Links to local NGO support (iCall, TISS)
  - Have NO URL submission form
  - Have NO hash upload
  - Have NO case creation button
  Done when: Playwright test: login with `ageOver18 = false` → redirected to `/minor-support`; page contains CHILDLINE 1098; page has no URL submission form.

- [ ] `[AI]` **1.I.2** Add middleware guard in `src/app/(victim)/layout.tsx`:
  - If `ageOver18 = false` in JWT → redirect to `/minor-support`
  - This must be enforced server-side, not just client-side
  Done when: Playwright test: minor user attempts to GET `/submit` → redirected to `/minor-support`.

- [ ] `[AI]` **1.I.3** Add server-side guard in `POST /api/cases/create`:
  - Extract JWT from cookie
  - If `ageOver18 = false` → return HTTP 403 `{ error: 'minor_pathway_required' }`
  Done when: Integration test: minor user POSTs to `/api/cases/create` → 403.

- [ ] `[HUMAN]` **1.I.4** Legal review of POCSO reporting obligations. Based on the legal opinion obtained in 0.A.3, implement or document Asmita's mandatory reporting protocol if applicable. AI must NOT implement this until the legal opinion is documented.

---

## PHASE 1J — Localization (Hindi + English)

- [ ] `[AI]` **1.J.1** Set up `next-intl` or `next-i18next` for internationalization. Languages: `en` (English) and `hi` (Hindi). Default: `en`. User preference stored in a cookie.

- [ ] `[AI]` **1.J.2** Create `src/i18n/en.json` with all user-facing strings. Keys must be semantic (e.g., `auth.enterEmail`, `submit.declarationTitle`), not generic (`text1`, `label2`). This file is the source of truth; Hindi translations mirror it.

- [ ] `[GATED]` **1.J.3** Create `src/i18n/hi.json` — AI drafts Hindi translations of all strings. All Hindi text is tagged `[DRAFT — requires native speaker review]` in a separate `hi-review-status.json` file. `[HUMAN]` native Hindi speaker reviews and approves each string before launch.

- [ ] `[AI]` **1.J.4** Implement language toggle in the global header: EN | हिंदी. Persists across sessions via cookie. Does not require login.

- [ ] `[AI]` **1.J.5** Ensure all trauma-informed UI text uses the approved translations. Key strings to verify in Hindi: declaration text, OTP instructions, "what happens next" explanation, support resources section.

---

## PHASE 1K — Support Resources

- [ ] `[AI]` **1.K.1** Create `src/app/(public)/resources/page.tsx`:
  - Section 1: Emergency help (CHILDLINE 1098, Women's Helpline 1091, Police 100)
  - Section 2: Mental health support — iCall (TISS): 9152987821; list partner NGOs
  - Section 3: Legal aid — District Legal Services Authority link; how to find your state DLSA
  - Section 4: How to file a police FIR for NCII — step-by-step guide (both Hindi and English)
  - Section 5: How to use cybercrime.gov.in alongside Asmita
  - Section 6: Your rights under Indian law (plain language, not legal jargon)
  This page is publicly accessible (no login required).
  Done when: Page loads without auth; all phone numbers are clickable `tel:` links on mobile.

- [ ] `[AI]` **1.K.2** Create a persistent "Support" button visible on every page (fixed bottom-right on mobile, top-right on desktop). Opens a slide-out panel with emergency numbers and mental health links. Never hidden behind a menu.
  Done when: Playwright test opens any page → support button visible; click → slide-out panel shows CHILDLINE number.

- [ ] `[AI]` **1.K.3** Create `src/app/(public)/how-it-works/page.tsx` — plain language explanation of the three-tier notice system, timeline, and what victims can expect. No legal jargon. Available in Hindi and English.

---

## PHASE 1L — Security Hardening

- [ ] `[AI]` **1.L.1** Implement rate limiting middleware using Redis:
  - OTP requests: 3 per email per 15 minutes
  - URL submissions: 10 URLs per case per 24 hours
  - `/api/platforms/detect`: 30 per IP per minute
  - All other API routes: 100 per IP per minute
  Store counters in Redis with TTL. Return `Retry-After` header on 429 responses.
  Done when: Integration tests verify each rate limit triggers at the correct threshold and returns 429.

- [ ] `[AI]` **1.L.2** Add HTTP security headers via Next.js config or middleware:
  ```
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  ```
  Done when: Running `npx security-headers-check` (or equivalent) on the running dev server returns no missing headers.

- [ ] `[AI]` **1.L.3** Implement CSRF protection for all state-changing API routes:
  - Use the `double submit cookie` pattern or Next.js built-in CSRF for App Router
  - All POST/PUT/DELETE routes must verify CSRF token
  Done when: Integration test without CSRF token → 403; with correct CSRF token → 200.

- [ ] `[AI]` **1.L.4** Validate all API inputs with Zod schemas. No API route may access `request.body` fields without going through a Zod `.parse()` call first. Add an ESLint rule warning if `request.body` is accessed directly.
  Done when: ESLint produces a warning for a test file that accesses `req.body.email` directly.

- [ ] `[AI]` **1.L.5** Add SQL injection protection:
  - Prisma ORM parameterizes all queries by default — verify no raw SQL queries (`db.$queryRaw`) are used in user-controlled contexts
  - Run `grep -r '\$queryRaw' src/` in CI; fail build if found in a user-input context
  Done when: CI step runs the grep check.

- [ ] `[AI]` **1.L.6** Add logging for security events (failed auth, rate limit hits, flagged submissions) to a structured log (JSON, one event per line). Never log PII in cleartext — log email hashes only.
  Done when: Integration test triggers a rate limit → JSON log entry appears with `event: 'rate_limit_exceeded'` and no plaintext email.

- [ ] `[HUMAN]` **1.L.7** Before launch: conduct a security review of the entire codebase focusing on:
  - URL injection (submitted URL somehow triggers a server-side request)
  - PII leakage in logs or API responses
  - Auth bypass (minor user accessing adult routes)
  - Rate limit bypass
  Document findings and fixes in `docs/security/pre-launch-review.md`.

---

## PHASE 1M — Testing

- [ ] `[AI]` **1.M.1** Write unit tests for all modules in `src/lib/`. Minimum coverage per module:
  - `url-parser.ts`: 20 fixture tests (see 1.C.1.2)
  - `encryption.ts`: 10 tests
  - `auth/otp.ts`: 6 tests (valid, expired, used, wrong, timing-attack-safe)
  - `auth/jwt.ts`: 5 tests
  - `notice-generator.ts`: test for each template type; test NO_REVIEWED_TEMPLATE error
  - `notice-router.ts`: test each of 3 tiers; test TO_BE_VERIFIED bypass to Tier 3
  - `abuse-detection.ts`: test each flag condition
  - `fir-package-generator.ts`: smoke test (non-empty PDF buffer)
  - `audit.ts`: insert test; failed-insert-does-not-throw test
  Target: 85% line coverage across `src/lib/`. Run `vitest --coverage` in CI.

- [ ] `[AI]` **1.M.2** Write integration tests for all API routes using a test database. Test cases must cover:
  - Happy path for each route
  - Auth failure (no cookie)
  - Minor user attempting adult routes → 403
  - Rate limit enforcement
  - Duplicate URL detection
  - Flagged URL → goes to review queue (notice NOT sent)
  - Unknown platform → Tier 3 routing

- [ ] `[AI]` **1.M.3** Write Playwright E2E tests covering:
  - Full registration + OTP + age attestation → case creation → URL submission → dashboard
  - Minor age selection → redirected to /minor-support → no submit form present
  - Admin login → approve flagged URL → notice queued
  - Language toggle: switch to Hindi → all visible text changes
  - Support button visible on all pages

- [ ] `[AI]` **1.M.4** Write a test that specifically verifies the no-URL-fetch constraint:
  - Submit a URL that points to an attacker-controlled domain
  - Verify that the test server makes zero outbound HTTP requests during URL submission
  - Use a mock HTTP interceptor (`nock` or `msw`) to detect any outbound calls
  Done when: Test fails if any outbound request is detected.

---

## PHASE 1N — Public-Facing Pages

- [ ] `[AI]` **1.N.1** Create `src/app/(public)/page.tsx` — landing page:
  - Above the fold: Asmita name/logo, tagline in Hindi and English, single CTA button: "Get Help Now"
  - Section: What Asmita does (3 steps: submit links → we send notices → track removal)
  - Section: Your privacy (no images stored, no content viewed, hash of your dignity not a copy)
  - Section: Supported by / partner NGOs
  - Section: FAQ
  - Footer: Legal entity name, `notices@meriasmita.org`, links to Privacy Policy, Terms, Resources
  Tone: Calm, empowering, not clinical. Hindi + English toggle.

- [ ] `[AI]` **1.N.2** Create `src/app/(public)/privacy/page.tsx` — privacy policy:
  - In plain language (not legalese), explain what data is collected, how it's encrypted, how long it's kept, and how to request deletion
  - Must include: "We never store your images or videos. We never send your images or videos to anyone. Only the web address (URL) is used, as a reference number."
  - Available in Hindi and English

- [ ] `[GATED]` **1.N.3** Create `src/app/(public)/terms/page.tsx` — terms of use. `[AI]` drafts; `[HUMAN]` (legal advisor) reviews and approves.

---

## PHASE 1O — Deployment & Launch

- [ ] `[AI]` **1.O.1** Configure Vercel deployment:
  - Connect GitHub repo to Vercel
  - Set all env vars from `.env.example` in Vercel dashboard
  - Configure India region (ap-south-1) if available
  - Set up preview deployments for PRs

- [ ] `[HUMAN]` **1.O.2** Set up Supabase (or Railway) PostgreSQL instance in India region. Run `npx prisma db push` on production database. Confirm connection from Vercel.

- [ ] `[HUMAN]` **1.O.3** Configure Resend:
  - Add `meriasmita.org` domain to Resend
  - Set up DKIM, SPF, DMARC DNS records
  - Test DKIM signature on a sent email using `mail-tester.com`
  - Target: mail-tester score ≥ 9/10 before launch (high score = notices don't land in spam)

- [ ] `[HUMAN]` **1.O.4** Set up uptime monitoring (BetterUptime, UptimeRobot, or Freshping):
  - Monitor `https://meriasmita.org/api/health` endpoint
  - Alert to admin email if downtime > 5 minutes

- [ ] `[AI]` **1.O.5** Create `GET /api/health` endpoint:
  - Returns `{ status: 'ok', db: 'connected', redis: 'connected', timestamp: ISO }` if all services are up
  - Returns HTTP 503 if any service is down
  Done when: Health check returns 200 when DB and Redis are connected.

- [ ] `[HUMAN]` **1.O.6** Conduct closed beta with 3–5 NGO partner cases before public launch. Document issues found in `docs/beta/feedback.md`.

- [ ] `[HUMAN]` **1.O.7** Confirm all notice templates have `reviewedByLegal = true` in production database before public launch. This is a hard gate — launch must not proceed without it.

- [ ] `[HUMAN]` **1.O.8** Confirm all Tier 1 and Tier 2 platform contacts have `lastContactVerifiedByHuman = true` before public launch. No notices go to unverified contacts.

---

## PHASE 2A — Client-Side Perceptual Hashing

> Phase 2 gate: Phase 1 must be publicly live with at least 100 processed cases and documented platform response rates before Phase 2 begins.

- [ ] `[AI]` **2.A.1** Add `hashContent` column to `SubmittedUrl` table via Prisma migration:
  ```prisma
  hashContent String? // PDQ hash (hex), only for Phase 2 hash-submitted URLs
  hashAlgorithm String? // 'PDQ' | 'TMK-PDQF'
  ```
  This migration must NOT be applied to production until Phase 2 is ready.

- [ ] `[AI]` **2.A.2** Create `src/lib/client-hash.ts` (runs in browser only — never imported server-side):
  - Imports PDQ-photo algorithm compiled to WebAssembly (use `pdq-photo-hasher-wasm` or equivalent)
  - Exports `async function hashImageFile(file: File): Promise<string>` — returns 256-bit PDQ hash as hex
  - Entire computation in a Web Worker (does not block main thread)
  - File bytes never sent to server — only the resulting hash string
  Done when: Unit test in `jsdom` environment hashes a test image and returns a 64-char hex string; same image hashed twice returns identical hash; different image returns different hash.

- [ ] `[AI]` **2.A.3** Add hash upload UI to the victim submit page as an optional second pathway:
  - "I don't have a link, but I have the file" → expand section
  - File picker (images: JPEG, PNG, WebP; video: MP4, MOV — max 200MB)
  - After selection: "Computing your digital fingerprint... your file stays on your device"
  - Progress indicator while Web Worker runs
  - On completion: "Fingerprint created. Your file has NOT been uploaded." → show hash (truncated) for victim's reference
  - Submit sends only the hash to `POST /api/cases/:caseId/hashes`
  Done when: Playwright test selects a JPEG → progress shown → hash appears → file not uploaded (mock server receives hash only).

- [ ] `[AI]` **2.A.4** Create `POST /api/cases/:caseId/hashes`:
  - Input (Zod): `{ hash: string (64 hex chars), algorithm: 'PDQ' | 'TMK-PDQF' }`
  - Create a `SubmittedUrl` record with no URL fields set, but `hashContent` set
  - Status: `NOTICE_QUEUED` (hash is shared with partner platforms; no email notice needed for this pathway)
  Done when: Integration test submits a hash → record created with `hashContent` set and `urlEncrypted` null.

---

## PHASE 2B — Hash Network Infrastructure

- [ ] `[HUMAN]` **2.B.1** Prepare partnership pitch deck using Phase 1 response rate data. Include: number of cases processed, platforms with highest response rates, proof that Asmita's notice format is effective. Target first meeting: Meta India Trust & Safety team.

- [ ] `[HUMAN]` **2.B.2** Request formal hash-sharing partnership with Meta (they support PDQ format, already used in StopNCII). Contact: India Policy team at Meta.

- [ ] `[AI]` **2.B.3** Once partnership agreement is signed: implement Meta NCII hash reporting API client in `src/lib/platform-apis/meta.ts`. Follow Meta's official API documentation exactly.

- [ ] `[HUMAN]` **2.B.4** Pursue same partnership with Google (YouTube, Search), starting with Google India Trust & Safety.

- [ ] `[AI]` **2.B.5** Add TMK-PDQF video hashing:
  - `src/lib/client-hash-video.ts` — Web Worker using TMK-PDQF WebAssembly
  - Extend hash upload UI to accept video files
  - Extend `hashAlgorithm` field to support `'TMK-PDQF'`

- [ ] `[HUMAN]` **2.B.6** Pursue partnerships with Indian platforms: ShareChat, Josh, Moj, MX TakaTak. These require direct outreach to their Trust & Safety teams. Use Phase 1 response rate data as leverage.

---

## PHASE 3 — Scale & Policy

- [ ] `[GATED]` **3.1** Add regional language support: Bengali, Tamil, Telugu, Marathi, Kannada. `[AI]` creates translation key files; `[HUMAN]` native speaker reviews each language before enabling.

- [ ] `[AI]` **3.2** Implement analytics dashboard (internal only — never public):
  - Cases by state/city (to identify geographic hotspots for NGO deployment)
  - Platform response rates over time
  - Time-to-removal by platform
  - No individual victim data in analytics — all aggregated

- [ ] `[HUMAN]` **3.3** Pursue formal partnership with NCW (National Commission for Women). Asmita-generated notices with NCW backing carry more weight with Indian platforms.

- [ ] `[HUMAN]` **3.4** Engage with MeitY on using Asmita's Grievance Officer database as the basis for a public registry. This turns Asmita's research asset into a policy contribution.

- [ ] `[HUMAN]` **3.5** Begin policy advocacy for a dedicated NCII law in India (current laws are scattered across IT Act + IPC). Asmita's case data provides evidence for the advocacy case.

- [ ] `[AI]` **3.6** Multi-tenant architecture: allow partner NGOs to have their own case queue, branded interface, and NGO-specific analytics while all sharing Asmita's notice infrastructure and platform database.

---

## Appendix A — Environment Variables Reference

```bash
# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/asmita
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/asmita  # Prisma direct connection

# Encryption (generate: openssl rand -hex 32)
ENCRYPTION_KEY=<32-byte-hex>

# Auth
JWT_SECRET=<random-64-char-string>

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notices@meriasmita.org
RESEND_VICTIM_FROM_EMAIL=support@meriasmita.org

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=https://meriasmita.org
LEGAL_ENTITY_NAME=<registered name of Asmita legal entity>

# Admin
ADMIN_OTP_EMAIL=admin@meriasmita.org

# Feature flags (Phase 2)
FEATURE_HASH_UPLOAD=false           # Set true when Phase 2 hash upload is ready
FEATURE_HASH_NETWORK=false          # Set true when platform partnerships are active
```

---

## Appendix B — Data Seed File Format

`data/platforms-verified.csv` — required before running seed script. **Human-verified only. AI must not generate this file.**

Columns:
```
platform_name, domain_patterns (semicolon-separated), tier (1/2/3),
notice_basis (IT_RULES_2021|DMCA|IT_RULES_AND_DMCA|FORM_ONLY),
grievance_email (or TO_BE_VERIFIED),
grievance_name (or TO_BE_VERIFIED),
grievance_address (or TO_BE_VERIFIED),
form_url (or blank),
api_endpoint (or blank),
last_verified_date (YYYY-MM-DD),
verified_by (name of human who verified),
source_url (URL of platform's contact/legal page)
```

---

## Appendix C — Definition of Done (Phase 1 Launch)

Before the platform is opened to real victims, ALL of the following must be true:

- [ ] All Phase 1A–1N tasks marked complete
- [ ] All unit tests pass (`npm run test` exits 0)
- [ ] All integration tests pass
- [ ] All Playwright E2E tests pass
- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] ESLint exits 0 (including no-url-fetch rule)
- [ ] At least one IFF or SFLC.in attorney has reviewed all notice templates and set `reviewedByLegal = true`
- [ ] All Tier 1 + Tier 2 platform contacts verified by a human (`lastContactVerifiedByHuman = true`)
- [ ] `data/platforms-verified.csv` exists and contains at least 15 verified platforms
- [ ] POCSO reporting obligation documented by a lawyer (0.A.3)
- [ ] Legal entity registered (0.A.4)
- [ ] Email domain with DKIM/SPF/DMARC set up; mail-tester score ≥ 9/10
- [ ] Minor pathway blocks all adult routes (verified by Playwright test)
- [ ] No `<TO_BE_VERIFIED_BY_HUMAN>` values in production platform database
- [ ] Security review completed and all critical findings fixed (1.L.7)
- [ ] Hindi translations reviewed by native speaker for trauma-informed tone
- [ ] Closed beta with NGO partner completed (1.O.6)
```
