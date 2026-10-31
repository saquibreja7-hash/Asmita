# Planning archive (May 2026)

These are the pre-development planning documents that are still referenced. They describe the original Phase 1 (URL-only) design on Vercel. They are historical: the product has since added on-device PDQ fingerprinting, moved hosting to Cloudflare Workers, and moved production data to Supabase (Mumbai).

For current rules, read the root `CLAUDE.md`. For current deployment, read `docs/infra/cloudflare-migration.md`.

| File | Why it is kept |
|---|---|
| `PRD_Asmita.md` (+ `.pdf`) | Product requirements v0.2. Section 4 is still the list of verified legal citations. |
| `ncii-india-system-design.md` | System design, including PDQ rollout gates (§10). Referenced by `tests/unit/pdq-reference-vectors.test.ts`. |

The TRD, implementation plan, UX/UI plan, TODO lists and PDF scripts were removed on 2026-10-31. They are in git history before that date.
