# Planning archive (May 2026)

These are the pre-development planning documents, moved here from the repo root on 2026-10-31. They describe the original Phase 1 (URL-only) design on Vercel. They are historical: the product has since added on-device PDQ fingerprinting, moved hosting to Cloudflare Workers, and moved production data to Supabase (Mumbai).

Use them for background and original reasoning. For current rules, read the root `CLAUDE.md`. For current deployment, read `docs/infra/cloudflare-migration.md`.

| File | What it was |
|---|---|
| `PRD_Asmita.md` | Product requirements v0.2. Section 4 is still the list of verified legal citations. |
| `TRD_Asmita.md` | Technical requirements v0.1 |
| `IMPLEMENTATION_PLAN_Asmita.md` | Six-phase month-by-month plan |
| `UXUI_DESIGN_PLAN_Asmita.md` | Original visual language. Superseded by `docs/design/`. |
| `ncii-india-system-design.md` | System design, including PDQ rollout gates (§10) |
| `TODOS.md` | Agent task list and the original FORBIDDEN list. The rules that still apply now live in the root `CLAUDE.md`. |
| `TODO_Asmita.md` | Pre-development project tracker |
| `pdf-scripts/` | Scripts that rendered the PDFs. They expect the Markdown files at the repo root and need `marked` and `puppeteer`. |
