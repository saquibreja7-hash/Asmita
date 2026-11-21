# tx-extension-asmita

A `SignalExchangeAPI` for [python-threatexchange](https://github.com/meta/ThreatExchange)
(BSD, Meta) that lets a platform running Meta's open-source
Hasher-Matcher-Actioner (HMA / Open Media Match) subscribe to Asmita as a
hash bank: HMA pulls the image fingerprints (PDQ) and video fingerprints
(vPDQ) of survivors who consented to sharing, straight from Asmita's HMA
signal feed, and deletes them again the moment a survivor withdraws her
consent.

This package is the supported successor of the example adapter that used to
live in `asmita/docs/product/partner-hma-adapter/` in the Asmita repository.
It is not part of the Asmita application: nothing in `asmita/` imports it,
and running it is entirely the platform operator's choice. Its only
dependency is `threatexchange>=1.2.18,<2` (the library HMA itself fetches
exchanges through); the code uses nothing outside it and the standard
library.

## What it does

- Polls `GET /api/partner/v1/signals` (the contract is documented in
  `asmita/docs/product/partner-api.md`) on the schedule HMA already owns,
  authenticating with the **partner key** an Asmita admin issued you
  (`Authorization: Bearer …`). The key is a secret: it goes in your secret
  manager, never in a committed config.
- Pages the feed with the opaque checkpoint Asmita serves; the checkpoint
  never moves backwards, and a restart resumes exactly where it stopped.
- Yields one update record per Asmita fingerprint: live records carry the
  signal (a `pdq` hash or a `vpdq` feature list) and the programme tags,
  and the bank indexes exactly what a survivor's device hashed.
- Turns every `deleted: true` tombstone into an explicit deletion
  (`None` under the same fingerprint), so a withdrawn fingerprint is
  removed from your index on the next sync — the programme's central
  promise. The fingerprint id — not the hash — is the update key on both
  sides of that: Asmita never serves the hash of a withdrawn fingerprint
  again, so a tombstone could not name it, and keying by id makes every
  deletion address exactly the record its addition created. Two survivors
  who hold the same image are two independent records, so one withdrawal
  never removes the other's signal.
- Carries nothing but the fingerprint id, the signal value and the tags
  into HMA. Asmita's feed contains no URLs, no images and no survivor data.
- Reports review outcomes back through `report_opinion` (see below).

A hash match is a high-signal indicator for human review, not an
automatic removal decision (CDT guidance); nothing in this package changes
that on either side.

## Requirements

- An Asmita partner account and a partner key with the **feed** scope (an
  admin issues it once; the console shows the scopes when it is issued).
- HMA / Open Media Match 1.2.x (the image is `ghcr.io/meta/threatexchange/hma`),
  or any deployment that installs python-threatexchange exchanges.
- Image matching needs the `pdq` signal type, which HMA installs by default.
  Video (vPDQ) needs the optional `threatexchange.extensions.vpdq` package
  and `VPDQSignal` in your `signal_types`; while it is missing, video
  records are skipped and nothing breaks.

## Installing

Asmita does not publish this package to PyPI (the owner distributes the
wheel). Build it from the Asmita repository:

```bash
cd integrations/hma/tx-extension-asmita
python -m build --wheel          # produces dist/tx_extension_asmita-…-py3-none-any.whl
```

Then copy the wheel into your image build and `pip install` it, or host it
on your own package index.

## Registering the exchange (HMA / Open Media Match)

1. Derive your image from the official one and install the wheel:

   ```dockerfile
   FROM ghcr.io/meta/threatexchange/hma:1.2.2
   COPY tx_extension_asmita-1.0.0-py3-none-any.whl /wheels/
   RUN pip install /wheels/tx_extension_asmita-1.0.0-py3-none-any.whl
   ```

2. In your OMM config (the file `OMM_CONFIG` points at), import the class
   and add it to the exchange list:

   ```python
   from threatexchange.signal_type.pdq.signal import PdqSignal
   from tx_extension_asmita import AsmitaSignalExchangeAPI

   STORAGE_IFACE_INSTANCE = DefaultOMMStore(
       signal_types=[PdqSignal, ...],
       exchange_types=[
           ...
           AsmitaSignalExchangeAPI,
       ],
   )
   ```

3. Create the exchange with the curator API (the key is stored per exchange
   and never echoed back):

   ```http
   POST /c/exchanges
   {
     "bank": "ASMITA_NCII",
     "api": "asmita",
     "api_json": {"base_url": "https://<your Asmita deployment>/api/partner/v1"},
     "credential_json": {"api_key": "<the key you were shown>"}
   }
   ```

   `base_url` must be set (its default is a placeholder that refuses to
   run): your Asmita host plus the `/api/partner/v1` path.

4. That is all: the background fetcher pulls on its schedule (every 240 s
   by default), the indexer folds the signals into your index, and
   `GET /c/exchange/<name>/status` shows the fetch status. A withdrawal
   deletes the signal from the bank on the next fetch.

### python-threatexchange CLI

The package carries a `TX_MANIFEST`, so the CLI can load it as an
extension:

```bash
threatexchange config extensions add tx_extension_asmita
export TX_ASMITA_API_KEY=ppk_...
threatexchange fetch
```

## Reporting outcomes back

HMA does not call exchange write-backs during fetch or match (feedback
write-back is not implemented in HMA today), so a human decision has to be
reported by the CLI or your own tooling. `report_opinion` maps the
opinion categories to Asmita's outcome vocabulary and posts them to
`POST /api/partner/v1/outcomes`:

- `POSITIVE_CLASS` → `blocked_reupload` — the platform blocked re-uploads
  of this fingerprint's content.
- `NEGATIVE_CLASS` → `not_our_content` — the content was not the
  survivor's.

For example, with the CLI:

```bash
threatexchange label ASMITA_NCII photo --as-hash pdq -- <64-hex pdq hash>
```

The interface hands the exchange the signal value, not Asmita's fingerprint
id, so the id is resolved by reading the feed's addition history (one
full pass) before posting. The key needs the **outcomes** scope for this;
a key without it is refused with `insufficient_scope`.

## Known limits

- The feed is global to every active partner: all partner platforms receive
  the same fingerprint set. If you want only signals relevant to your
  domains, that is your matching pipeline's job (Asmita's hashes are for
  finding and blocking, not for identifying whose platform something was
  on).
- A withdrawal is one record like any other: no refetch, no extra paging.
- HMA pickles the fetched metadata (`AsmitaSignalMetadata`) and the
  checkpoint (`AsmitaCheckpoint`) — the classes and their fields are a
  stored format. Upgrades must only add fields with defaults.
- Video matching additionally needs the `vpdq` extension compiled into your
  image (it ships as source only); without it video records are skipped.
- Every question about the feed itself goes through Asmita's partner
  channel, not through this package.

## Licence and attribution

This package is original Asmita code under the BSD-3-Clause licence (the
text is in `LICENSE`). It implements interfaces published by Meta's
ThreatExchange project and copies none of its source; `NOTICE` carries the
attribution. Meta's name identifies the upstream project and its licence
only; nothing here is endorsed by or affiliated with Meta.
