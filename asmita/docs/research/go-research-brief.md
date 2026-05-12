# Grievance Officer Research Brief

Status: ready for assigned researcher.

This brief defines how Asmita researchers should verify platform grievance contacts without guessing, scraping victim-submitted URLs, or relying on stale third-party lists.

## Research Goal

Build and maintain a human-verified directory of platform grievance contacts and takedown pathways for Phase 1 platforms. Each entry must support safe routing for non-consensual intimate image abuse notices.

## Required Evidence Per Platform

- Platform name and product scope.
- Domain patterns covered.
- Jurisdiction and relevant entity, if published.
- Grievance Officer or abuse contact email, if officially published.
- Official removal or abuse form URL, if available.
- Postal address only when officially published and needed.
- Date verified.
- Researcher name or reviewer ID.
- Source URL and screenshot or archived PDF stored outside the app repo.
- Notes about uncertainty, regional limitations, or form authentication requirements.

## Verification Rules

- Use official platform, regulator, court, or government pages first.
- Treat old blog posts, search snippets, forum posts, and copied lists as leads only.
- Do not enter a contact into the live database unless two reviewers agree or one reviewer plus legal advisor approves.
- Mark any bounced, complained, or unreachable contact as stale immediately.
- Re-verify every 30 days or sooner after a bounce/complaint event.
- Never paste victim-submitted URLs into external research tools.

## Phase 1 Platform Set

- Meta: Instagram and Facebook.
- Google: YouTube and Search removals.
- X / Twitter.
- WhatsApp.
- Telegram.
- ShareChat.
- Josh / Moj / MX TakaTak.
- Snapchat.
- Pornhub / Aylo.
- xVideos.
- xHamster.
- XNXX.
- Bing.

## Output Format

Researchers should deliver a spreadsheet or database import with these fields:

| Field | Required | Notes |
| --- | --- | --- |
| platform_id | Yes | Stable lowercase ID. |
| platform_name | Yes | Human-readable name. |
| domain_patterns | Yes | Comma-separated domains. |
| tier | Yes | TIER_1, TIER_2, or TIER_3. |
| notice_basis | Yes | IT_RULES_2021, DMCA, IT_RULES_AND_DMCA, EMAIL_ONLY, or FORM_ONLY. |
| grievance_email | Conditional | Required for email routing; blank if only form/API exists. |
| form_url | Conditional | Required for form handoff platforms. |
| api_endpoint | Conditional | Only after partnership or official documentation confirms access. |
| source_url | Yes | Official source used for verification. |
| source_captured_at | Yes | ISO date. |
| verified_by | Yes | Researcher/reviewer identity. |
| verified_by_human | Yes | Must be true before dispatch. |
| notes | No | Include uncertainty and access requirements. |

## Handoff

When research is complete, the researcher sends the evidence pack to the product owner and legal advisor. Engineering only seeds contacts after the evidence pack is approved; placeholders remain blocked from live dispatch.

## Maintenance Owner

Default role owner: Product Operations Lead.

Responsibilities:

- Run monthly re-verification.
- Review bounce/complaint stale-contact flags.
- Coordinate legal review for changed platform pathways.
- Keep evidence packs available for audit.
- Escalate unverified critical platform gaps to the founder.
