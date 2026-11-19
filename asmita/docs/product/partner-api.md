# Asmita partner API

This is the technical integration guide for platform engineers whose organisation
joined Asmita's partner programme through `/for-platforms` and was onboarded by
an admin. What the programme is, what we share and what we never share is on
that page; this document is only about the wire.

Everything here is served under `/api/partner/v1/` on Asmita's site. All
examples use `example.test` domains and synthetic hashes, as everything in this
repository does.

## What you get, in one paragraph

An append-only feed of image fingerprints (PDQ hashes) that survivors asked
Asmita to share with partner platforms, and an endpoint to tell Asmita what you
did with them. You poll the feed with a cursor, store the hashes, match
candidate content against them, remove what matches after a person confirms
it, and report the outcome back. When a survivor withdraws her agreement, the
feed tells you to delete her fingerprints, and you must.

## Authentication

Every request carries a bearer key that an Asmita admin issues you in the
partner console. The key is shown once at issue time and only a hash of it is
stored, so keep it in your secret manager — Asmita cannot show it again, only
replace it. Send it on every call:

```
Authorization: Bearer ppk_...
```

- A missing, wrong or revoked key gets `401 {"error":"unauthorized"}` — the same
  answer for all three, so nothing about the key is revealed.
- A valid key of a suspended partner gets `403 {"error":"partner_suspended"}`.
- Requests are rate limited per key and per source IP (`429 {"error":"rate_limited"}`).
  The feed allows 300 requests/hour per key, outcome reporting 600/hour; if you
  need more, tell us before scripting around it.
- Keys can be revoked by either side at any time; a revoked key stops working
  immediately.

## The fingerprint feed

`GET /api/partner/v1/fingerprints?cursor=<last seq>&limit=<1..500>`

Returns at most `limit` (default and maximum 500) events with sequence numbers
greater than `cursor`, oldest first. `cursor` is the `seq` of the last event you
processed; omit it (or send `cursor=0`) to read the feed from the beginning.

```json
{
  "events": [
    {
      "seq": 17,
      "type": "add",
      "fingerprintId": "6f96...-...-...",
      "kind": "image",
      "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "caseRef": "ASMITA-7K2P-M4QX"
    },
    {
      "seq": 18,
      "type": "withdraw",
      "fingerprintId": "0f6e...-...-...",
      "kind": "image",
      "caseRef": "ASMITA-9W3R-T8VY"
    }
  ],
  "nextCursor": 18
}
```

The meaning of each field:

- `seq` — the monotonic sequence number. Store it; it is your cursor.
- `type` — `"add"` or `"withdraw"`.
- `fingerprintId` — Asmita's id for this fingerprint. Quote it when you report
  an outcome.
- `kind` — `"image"` (a PDQ hash) or `"video"` (a list of frame hashes; vPDQ).
- `hash` — the 64-character hex PDQ hash, present on `add` events for images.
- `frames` — the frame hashes, present on `add` events for videos.
- `caseRef` — the case reference. Quote it in replies to Asmita; it is all you
  ever learn about the case.

`nextCursor` is present when more events may follow: poll again immediately
with `cursor=<nextCursor>`. When it is absent you are up to date; poll again on
your own schedule (every 1 to 5 minutes is plenty).

Rules of the feed:

- **An `add` means "store this hash and match against it."** Match PDQ with a
  Hamming distance of at most 31, and always require a human to review a match
  before you act on it (see below).
- **A `withdraw` means "delete everything about this fingerprintId, now."** Delete
  the hash, any derived index entry, and any stored metadata. This is a
  survivor withdrawing her consent or her account being erased; it is the
  programme's central promise, and partners are expected to be able to prove
  they did it. A `withdraw` may arrive for a `fingerprintId` you never saw (an
  `add` that was withdrawn before you first polled); treat it as a no-op.
- The feed is append-only and the sequence never rewinds, so a normal poll loop
  never misses anything. Events you already processed are never re-sent with
  different content; the only later event for a fingerprint is a `withdraw`.
- An `add` is only ever served while the fingerprint is still shareable: if a
  survivor withdraws between your polls, you receive the `withdraw` without ever
  seeing the `add`'s hash. A page can therefore be empty or short while
  `nextCursor` still advances — keep following the cursor.
- Every response carries `Cache-Control: no-store`. Do not cache pages; cache
  the cursor.

Errors: `400 invalid_cursor` or `400 invalid_limit` for malformed parameters,
`401`/`403`/`429` as above. All errors are JSON bodies with an `error` code and
nothing else — Asmita logs counts only, and so should you.

### Matching, and the human in the loop

PDQ is a perceptual hash: two hashes within a Hamming distance of 31 are
probably the same image or a near copy, and distance 0 means byte-identical
hashes. A distance of 31 is Asmita's reporting threshold (the same one its
crawler uses); treat anything beyond it as not a match. Perceptual hashes also
match lookalikes — a different person in a similar scene, a meme template — so
**never act on a match automatically**: route it to a human reviewer who
confirms the content before removal, exactly as Asmita's own analysts do. If
you see false matches, tell us the `fingerprintId` and the distance: we review
the fingerprint and withdraw it if it is too broad.

Use the fingerprints only to find and remove content that Asmita's notices and
this feed cover, and to block re-uploads of it. Never use them to identify,
profile or search for people. If you cannot honour that, the programme is not
for you.

## Reporting outcomes

`POST /api/partner/v1/outcomes`

Tell Asmita what happened. Body (JSON, strict — unknown fields are rejected,
the body is capped at 32 KB):

```json
{
  "fingerprintId": "6f96...-...-...",
  "url": "https://forum.example.test/watch/123",
  "outcome": "removed",
  "note": "Removed by the trust & safety team, re-upload block in place"
}
```

- `outcome` — one of `removed` (you took the content down), `blocked_reupload`
  (you configured a re-upload block), `not_found` (nothing matching was on your
  service), `not_our_content` (the page or domain is not yours).
- `fingerprintId` and `url` are both optional, but at least one is required.
  `url` must be a page on **your own registered domains** — a report about
  anyone else's pages is refused with `403 {"error":"url_not_on_partner_domain"}`.
  Register every domain you want to report about (including CDN or mirror
  hosts) with Asmita when you are onboarded; an admin can add more at any time.
- `note` is optional, up to 500 characters, for anything a human at Asmita
  should read.

The response is `200 {"ok":true}` when the report was recorded — nothing more:
not whether Asmita knew the URL, not any case data. Outcomes appear on the
case's admin page in Asmita's console, and feed Asmita's per-partner metrics.
A `removed` outcome that names a link Asmita was already told about marks that
reported link removed on the survivor's case, the same way a removal recorded
by an Asmita admin does.

Errors: `400 invalid_payload` (malformed body), `413 payload_too_large`,
`404 unknown_fingerprint` (an id Asmita never sent you), `400 invalid_url`,
`403 url_not_on_partner_domain`, plus the auth and rate-limit codes above.

## Running Hasher-Matcher-Actioner (HMA)?

Platforms that run Meta's open-source Hasher-Matcher-Actioner (HMA, now
community-supported through ROOST) can consume this feed with a small exchange
adapter instead of writing a poller: see
`asmita/docs/product/partner-hma-adapter/` in Asmita's public repository. The
adapter is a `SignalExchangeAPI` implementation that pages through this feed
(forwarding your partner key), maps `add` events to PDQ signals under the
`fingerprintId`, and turns every `withdraw` into a deletion, so withdrawals
propagate as deletions automatically. Its README covers registration for
current HMA (Open Media Match) and the python-threatexchange CLI. The adapter
is an example, not part of the Asmita application, and carries the
ThreatExchange BSD licence notice.

## What we ask of every partner

1. Keep the key in a secret manager; tell Asmita immediately if it leaks. Give
   each integration its own key so a compromise can be revoked alone.
2. Delete withdrawn fingerprints promptly and completely, and be ready to
   demonstrate it.
3. Route every match through a human before acting.
4. Use fingerprints only for removal and re-upload blocking of the reported
   content.
5. Tell us outcomes — they are how survivors learn their case moved, and how
   Asmita decides which fingerprints are doing their job.
