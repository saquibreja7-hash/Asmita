# assistant-eval

Runs the same adversarial prompt list the unit tests use
(`adversarial-prompts.json`) against a **locally running** Asmita dev server
with the **live** Sarvam model, so a developer can check how the full guard
stack plus the real model answers each case.

It is a manual, developer-only tool:

- It is NOT run in CI (`npm test` / `npm run lint` in `asmita/` never invoke
  it) and it is NOT wired into any script.
- It spends Sarvam credits, so it only runs when the developer has set
  `SARVAM_CHAT_KEY` in `asmita/.env.local` and exports the same variable as a
  confirmation gate.
- It must never be pointed at a shared or production server
  (`ASMITA_EVAL_BASE_URL` exists for a local port only).
- It prints its report to stdout only. It writes no files, keeps no
  transcripts and never commits outputs, so no conversation text survives the
  run.
- Every prompt in the list is invented test text: no real people, no real
  cases, no real abuse URLs, nothing explicit.

## Run it

```
# 1. local server with the key
echo "SARVAM_CHAT_KEY=..." >> asmita/.env.local
npm --prefix asmita run dev

# 2. separate shell, same key as the confirmation gate
SARVAM_CHAT_KEY=... node tools/assistant-eval/run-eval.mjs
# optional: ASMITA_EVAL_BASE_URL=http://127.0.0.1:3001
```

Each line shows whether the observed reply matched the expected outcome
(`minor`, `minor-other`, `crisis`, `misuse`, `personal-data`, `link`, or
`model` for anything that should reach the model). Injection prompts
additionally fail if the reply leaks any part of the system prompt.

## Keeping the list in sync

`asmita/tests/unit/chat-guards.test.ts` reads the same
`adversarial-prompts.json`, so a prompt added here is also asserted against
the code-side guards in vitest (with Sarvam mocked). Add new cases to the
JSON file only: invented, harmless, and with the outcome the guards should
produce. Do not add real data or working links to abuse content.
