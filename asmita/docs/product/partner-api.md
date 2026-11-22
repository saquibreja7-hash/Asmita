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
Asmita to share with partner platforms, a second copy of the same feed shaped
for Meta's Hasher-Matcher-Actioner (`/signals`), and an endpoint to tell
Asmita what you did with them. You poll a feed with a cursor or checkpoint,
store the hashes, match candidate content against them, remove what matches
after a person confirms it, and report the outcome back. When a survivor
withdraws her agreement, the feed tells you to delete her fingerprints — as an
explicit deletion record on `/signals` — and you must.

**Both feeds run about a minute behind.** An event is served only once it is
at least 60 seconds old (by Asmita's database clock), on `/fingerprints` and
`/signals` alike. Two changes written at the same moment can be committed in
the opposite order to their sequence and timestamp; holding back the newest
minute lets every such change settle before your cursor or checkpoint moves
past it, so no event (a withdrawal least of all) is ever skipped. Expect any
change, deletions included, to reach you within the settle window plus your
own poll interval — a few minutes at most with the polling suggested below.

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
- Each key carries the scopes it was issued with: `feed` (read
  `/fingerprints` and `/signals`) and `outcomes` (post to `/outcomes`). Keys
  are issued with both by default; a key used on a route outside its scopes
  gets `403 {"error":"insufficient_scope"}`. Ask Asmita for a narrower or
  wider key rather than working around it.
- Requests are rate limited per key and per source IP (`429 {"error":"rate_limited"}`).
  Each feed allows 300 requests/hour per key under its own bucket, outcome
  reporting 600/hour; if you need more, tell us before scripting around it.
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
- `frames` — for videos, **the full list of frame hashes** (the frames whose
  quality clears Asmita's publishing bar), not only the best frame.
- `caseRef` — the case reference. Quote it in replies to Asmita; it is all you
  ever learn about the case.

`nextCursor` is present when more events may follow: poll again immediately
with `cursor=<nextCursor>`. When it is absent you are up to date; poll again on
your own schedule (every 1 to 5 minutes is plenty). Events from the last 60
seconds are not served yet (see "Both feeds run about a minute behind" above):
a page stops short of the first one, with no `nextCursor`, and they arrive on
a later poll with the same cursor.

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

## The HMA signal feed

`GET /api/partner/v1/signals?checkpoint=<opaque>&page_size=<1..800>`

The same events as `/fingerprints`, shaped the way Meta's open-source
Hasher-Matcher-Actioner (HMA) consumes a signal exchange, so an HMA deployment
can consume this feed through a small exchange plugin instead of a hand-written
poller. `page_size` defaults to 500; the response carries at most `page_size`
records. Every response is `Cache-Control: no-store`.

```json
{
  "checkpoint": "eyJ0IjoxNzAwMDAwMDAwMDAwLCJzIjo0Mn0",
  "has_more": true,
  "records": [
    {
      "id": "6f96...-...-...",
      "signal_type": "pdq",
      "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "deleted": false,
      "updated_at": 1700000000,
      "tags": ["asmita", "ncii", "survivor_consented"]
    },
    {
      "id": "0f6e...-...-...",
      "signal_type": "vpdq",
      "hash": null,
      "deleted": true,
      "updated_at": 1700000100,
      "tags": ["asmita", "ncii", "survivor_consented"]
    }
  ]
}
```

- `id` — the fingerprint id, the same `fingerprintId` the rest of the partner
  API uses.
- `signal_type` — `pdq` (an image) or `vpdq` (a video).
- `hash` — for a live record: the 64-hex **lowercase** PDQ hash for `pdq`, or
  the vPDQ signal string for `vpdq` (below). `null` on a deletion record.
- `deleted` — `false` for an addition, `true` for a withdrawal. **A deletion is
  explicit and unambiguous**: delete the hash, every derived index entry and
  any stored metadata for that `id` when you see `deleted: true`, even if you
  never saw an addition for it. Deletion records are kept forever, so a
  re-import cannot resurrect anything Asmita withdrew.
- `updated_at` — when the event happened, unix seconds.
- `tags` — the same three tags on every record; they say what the data is, and
  carry nothing about any case or survivor.

**The checkpoint.** `checkpoint` is opaque: echo it back on the next request,
unchanged. Internally it names the last event's `(created time, sequence)`
pair, records come in strict `(created, seq)` order — the sequence number
breaks ties within one millisecond — and the checkpoint Asmita returns only
ever moves forward, so a normal paging loop never misses an event and never
sees one twice. Omit `checkpoint` (or send it empty) to read from the
beginning; anything else that is not a checkpoint Asmita minted is
`400 {"error":"invalid_checkpoint"}`. `has_more` is `true` while more records
may follow: poll again immediately with the returned checkpoint. When it is
`false`, poll again on your own schedule. A page may serve fewer records than
it walked past — an addition that stopped being shareable between your polls
is skipped while the checkpoint still advances — so an empty or short page
with `has_more: true` is never a stall: keep following the checkpoint. Records
from the last 60 seconds are held back until they settle (see "Both feeds run
about a minute behind" above), so a deletion reaches you within about a
minute plus your poll interval, never instantly.

**Quality.** Asmita does not publish a hash whose quality is below 50 — HMA
does not filter imported hashes by quality, so Asmita filters before
publishing, and a low-quality fingerprint simply never appears. For videos,
frames below 50 are dropped from the frame list; a video with no frame left
is never published.

**vPDQ.** A video's `hash` is exactly python-threatexchange's vPDQ signal
string: a JSON list of `"<hash>,<quality>,<timestamp>"` feature strings, with
the timestamp to three decimal places —

```json
"hash": "[\"e3b0...b855,80,0.000\", \"cd5e...31aa,72,1.000\"]"
```

— so an exchange plugin can hand it to `VPDQSignal` unchanged. The same frame
list (bare hashes) is on the `/fingerprints` route's `frames` field.

**Human review, always.** A hash match is a high-signal indicator for review,
not an automatic removal decision: route every match to a person who confirms
the content before anything is blocked or taken down, exactly as Asmita's own
analysts do. That is the condition of receiving this data (CDT's guidance on
hash matching says the same).

Errors: `400 invalid_checkpoint` or `400 invalid_page_size`, plus the auth,
scope and rate-limit codes above; the feed allows 300 requests/hour per key.

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

## Emails to your channel address

Alongside the API, an Asmita admin records a channel email address for your
organisation. Two kinds of email arrive there, and nothing needs to be
configured on your side:

- **Notice copies.** When Asmita dispatches a takedown notice for content on
  your domains, the same notice that went to your grievance contact is copied
  to your channel address — the same subject, text and signed PDF, never a
  second notice instead of the first.
- **Crawler alerts.** If you gave Asmita written permission to monitor your
  public pages, then when Asmita's crawler finds a possible match on your
  service and an Asmita analyst accepts it, your channel address receives an
  alert with the case reference, the page URL on your domain and the
  fingerprint id. No image or video is ever sent.

Report what you did with either through `POST /api/partner/v1/outcomes`
above; the outcome feeds the same per-partner metrics.

## Running Hasher-Matcher-Actioner (HMA)?

Platforms that run Meta's open-source Hasher-Matcher-Actioner (HMA, now
community-supported through ROOST) can consume this feed with a small exchange
package instead of writing a poller:
`integrations/hma/tx-extension-asmita/` in Asmita's public repository. The
package is a `SignalExchangeAPI` implementation that pages through
`/api/partner/v1/signals` (the HMA-shaped feed above: opaque checkpoint,
explicit deletion records, vPDQ signal strings), forwarding your partner key,
and maps every `deleted: true` record to a deletion, so withdrawals propagate
automatically, within minutes (the feed's settle window plus HMA's fetch
interval). Its README covers building the wheel, registering the exchange
on current HMA (Open Media Match) and the python-threatexchange CLI, and
reporting outcomes back. It is not part of the Asmita application, and it
carries the ThreatExchange BSD licence notice (BSD-3-Clause, with Meta's
ThreatExchange credited in its NOTICE). The admin console's partner page
shows the same three steps under "Connect with HMA".

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
