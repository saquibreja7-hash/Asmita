# On-call Alert Routing

Status: configured in code; production webhook destination must be supplied by infrastructure owner.

Set `ON_CALL_WEBHOOK_URL` in staging and production to route critical alerts into the chosen incident channel.

## Alert Classes

- `critical`: failed notice dispatch after retry, suspected privacy/security incident, audit persistence failure.
- `warning`: platform contact bounce, repeated rate-limit events, escalation backlog.
- `info`: deployment health, scheduled review reminders.

## Local Behavior

When `ON_CALL_WEBHOOK_URL` is not configured, `sendOnCallAlert` writes a structured warning to server logs and returns `delivered: false`. This keeps local development safe while making missing production routing visible.
