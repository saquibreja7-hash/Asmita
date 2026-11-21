# Asmita audit remediation

Work proceeds in order. Each phase has a verification checkpoint. The November technical and design-pattern reports, visual assessment and raw detector CSV are the baseline. The 303 detector occurrences share ten rules and are tracked by rule and component below.

| Phase | Scope | Acceptance |
|---|---|---|
| A | Technical F1–F4. Chat focus and list semantics, accurate platform deadline versus follow-up cadence, English and Hindi navigation at narrow and intermediate widths | Keyboard and axe check in open chat, header fit checks, public wording agrees with the case ladder |
| B | Technical F5–F7 and design-pattern priorities 1 and 3–6. Action-first Get Help, Minor Support, Start, Talk and Check Image. Direct filing for synthetic images, consistent labels and sequence, Hindi wording and privacy boundaries, progress and headings, result announcements, offline recovery and safe exit where filing begins | Walk the adult and minor branches with synthetic inputs, check help controls and both languages on mobile |
| C | Technical F8, editorial structure from design-pattern priority 5 and all ten detector rules. Eyebrows and kickers, small contents text, tight leading, line length, stacked icons, nested cards, uppercase copy, edge-aligned retired-link text, single-word final lines. Project diagnostics and remaining audit verification | Rerun browser and detector samples and record the disposition of each remaining finding |

## Phase A implementation

- F1 and F2. Chat uses a browser modal at both widths. Opening it contains focus, Escape restores focus to the original button, and the conversation log contains a semantic list. Typing uses a separate announcement.
- F3. The homepage and workflow use the case ladder’s duration constants. The bilingual FAQ and workflow name receipt of a qualifying complaint as the platform deadline trigger. Asmita’s follow-up and 24-hour helpline appear as separate information.
- F4 and design-pattern priority 2. The header uses compact navigation until the whole desktop menu and its actions fit. Intermediate widths keep the current File a complaint button visible alongside Menu. The footer language control follows the current locale when the viewport changes. The bilingual under-18 banner names its destination. Mobile Escape returns focus to Menu.

## Phase B implementation

- F5 and the action-first layout. Mobile Get Help, Start, Minor Support, Talk and Check Image expose a useful control within the first viewport. Talk keeps the call notice ahead of microphone activation and exposes the phone alternative near the top.
- F6 and progress. Eligibility, registration and filing entry expose a page heading. Task stage and current question use separate labels, and the wizard keeps its focus transition. Track retains a single page heading while using the shared form.
- F7 and triage. The first actions cover immediate help, under-18 support and filing. Each scenario retains its evidence advice. The synthetic-image scenario links directly to filing and offers the checker as a separate choice. The checker gives a route to file irrespective of the result.
- Filing copy follows actual task order in English and Hindi. The optional deeper check names its consent and data boundary. The local checker announces the result, and the visible button supplies the file chooser’s keyboard entry point.
- Quick Exit is available on triage and filing entry screens. Offline recovery explains retry, reconnection and phone alternatives. The home help section names the AI assistant explicitly and distinguishes the emergency human resources.

## Phase C implementation

- Redundant hero labels and section kickers were removed. Topic breadcrumbs, timeline markers, verification dates and useful trust copy retain their functions. Resources, FAQ, guides and the directory expose useful content sooner. Home and educational pages keep editorial illustrations where they introduce the subject.
- Contents text grew to 12 px. FAQ and supporting copy have looser leading. Long legal and checker copy sits on a narrower measure. Paragraph wrapping uses `text-wrap: pretty` where appropriate, and legal headings use normal case. The retired link has its own inset.
- Delivery channels use text-first rows. The optional fingerprint disclosure has a simpler boundary inside the filing form and retains its progressive disclosure.
- `DESIGN.md` and `PRODUCT.md` document the current system. The stylesheet is split by established roles and the audited chat and supporter surfaces use semantic tokens.
- Dependabot covers the app and crawler. Existing CI dependency scanning continues. The root README contains setup instructions, and the app-level Impeccable check finds them. Root-level workspace discovery can produce a different result.
- Two large case-operation files remain. The changes split the stylesheet that prompted the UI maintenance finding. Splitting case operations requires separate backend work with its own regression coverage.
- The project uses manual browser and source detector runs. Installing an editor hook requires a supported local harness and its install consent. Existing operational monitors handle delivery, escalation and crawler checks. External error tracking still needs a provider decision and a data-handling plan for a service that handles survivor reports.

## Verification scope

- Before integrating the newer platform partner surface and navigation from `master`, Impeccable completed 82 rendered scans across 41 routes and states with zero primary flags and zero advisories. The baseline contained 204 primary flags and 99 advisories. The reconciliation CSV accounts for every original occurrence by route, viewport and rule. The source scan also returned zero findings.
- Axe reported zero violations in 80 public-page and viewport checks. The opened chat also passed a separate axe check and keyboard interaction assertions.
- The local production build compiled and passed TypeScript. The unit suite passed 1,247 tests with three skips. All 20 targeted Playwright checks passed across desktop and mobile. The chat API checks ran over local HTTPS to exercise production cookies. The mobile walkthrough confirmed direct deepfake filing, both age paths, the image result announcement and five task controls in the initial viewport.
- After the rebase, the production build passed again. The filing link and partner page styles were checked in Chromium, and the bilingual header fit at 320, 390, 1024, 1100, 1280 and 1440 px.
- The audit covers public, pre-authentication and synthetic edge states in local Chromium. Signed-in case workflows, live integrations, screen-reader speech and production performance require separate validation.
