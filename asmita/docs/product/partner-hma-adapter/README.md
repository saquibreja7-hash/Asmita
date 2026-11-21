# Asmita exchange adapter for Hasher-Matcher-Actioner (HMA)

A small, self-contained `SignalExchangeAPI` implementation that lets a
platform running Meta's open-source Hasher-Matcher-Actioner subscribe to
Asmita as a hash bank: HMA pulls the image fingerprints (PDQ) of survivors
who agreed to share them straight from Asmita's partner feed, and deletes
them again the moment a survivor withdraws.

This is an **example**, not part of the Asmita application: nothing in
`asmita/` imports it. It is written against
[python-threatexchange](https://github.com/facebook/ThreatExchange)
(BSD licence, copy in `LICENSE-THREATEXCHANGE.txt`), the library that HMA,
[Open Media Match](https://github.com/facebook/ThreatExchange/tree/main/hasher-matcher-actioner)
(OMM, the current HMA) and the ThreatExchange CLI all use for exchanges.
HMA has no plug-in HTTP exchange, so an exchange is always a Python class the
deployment registers — this file is that class, and it is all you need.

## What it does

- Polls `GET /api/partner/v1/fingerprints` on a schedule HMA already owns
  (the fetcher task), authenticating with the **partner key** an Asmita admin
  issued you (`Authorization: Bearer ppk_...`). The key is a secret: it goes
  in your secret manager, never in a config file you commit.
- Stores each event under **Asmita's fingerprint id**, so a later "withdraw"
  event — which names only the id — becomes an exact deletion of the record,
  whether or not this deployment ever saw the hash. Withdrawals propagate as
  deletions on the next sync; that is the programme's central promise.
- Converts `add` events into `pdq` signals (images) or `vpdq` signals (video),
- Uses the feed's monotonic `seq` as its checkpoint, so a restarted or
  re-synced deployment resumes exactly where it stopped. The feed is
  append-only; nothing is ever re-fetched from the beginning by accident.
- Carries nothing but the fingerprint id, the kind, the hash(es) and the case
  reference into HMA. Asmita's feed contains no URLs, no images and no
  survivor data (see `asmita/docs/product/partner-api.md`).

## Requirements

- An Asmita partner account and a partner key (an admin issues it once; see
  `docs/product/partner-api.md` for the API contract).
- `python-threatexchange` — you already have it if you run HMA/OMM, since it
  is the library HMA fetches exchanges through. This adapter needs no other
  dependency (it uses only the standard library besides python-threatexchange).
- Image matching needs the `pdq` signal type, which HMA installs by default.
  Video (vPDQ) needs the optional `threatexchange.extensions.vpdq` package and
  `VPDQSignal` in your `signal_types`; without it, video events are skipped
  with a warning.

## Registering the exchange

### Current HMA — Open Media Match (OMM)

1. Put `asmita_signal_exchange.py` somewhere your OMM deployment can import
   it (copying it next to your config file is fine).
2. In your OMM config file (the one `OMM_CONFIG` points at), import the module
   and add the class to the exchange list:

   ```python
   from asmita_signal_exchange import AsmitaSignalExchangeAPI

   STORAGE_IFACE_INSTANCE = DefaultOMMStore(
       signal_types=[PdqSignal, VideoMD5Signal],
       exchange_types=[
           ...
           AsmitaSignalExchangeAPI,
       ],
   )
   ```

3. Create the exchange with the curator API:

   ```
   POST /c/exchanges
   {"bank": "ASMITA", "api": "asmita", "api_json": {"name": "ASMITA", "enabled": true, "api_base_url": "https://meriasmita.org"}}
   ```

4. Give it the partner key: `flask auth asmita` (writes the key to the
   credential store, prompts on stdin), or `POST /c/exchanges/asmita/credentials`
   with `{"key": "ppk_..."}`. The environment variable `ASMITA_PARTNER_KEY` and
   the file `~/.asmita_partner_key` are read as fallbacks by the CLI and older
   deployments.
5. That is all: the background fetcher pulls on its schedule, the indexer
   folds the signals into your index, and `/c/exchange/asmita/status` shows
   the checkpoint (the last feed `seq` processed).

### python-threatexchange CLI

Package the file as an extension and register it:

```python
# threatexchange_asmita/__init__.py  (a tiny package with TX_MANIFEST)
from threatexchange.extensions.manifest import ThreatExchangeExtensionManifest
from asmita_signal_exchange import AsmitaSignalExchangeAPI

TX_MANIFEST = ThreatExchangeExtensionManifest(apis=(AsmitaSignalExchangeAPI,))
```

```
threatexchange config extensions add threatexchange_asmita
export ASMITA_PARTNER_KEY=ppk_...
threatexchange collab edit asmita --api_base_url https://meriasmita.org
threatexchange fetch   # or leave it to your normal cron
```

### Archived HMA 1.0 (branch HMA_1.0_archive)

Copy the module into the deployment image and add its dotted class path in
the UI (`add_signal_exchange_api`), then create a collaboration that imports
into a bank. The adapter speaks the same `SignalExchangeAPI` version HMA 1.0
fetches through, so add/withdraw behaviour is identical.

## Reporting outcomes back

HMA does not call exchange write-backs during fetch or match, so this adapter
does not post outcomes (matching does not automatically report anything —
that is correct: a human confirms a match first). Report what your reviewers
decided with a small job of your own against `POST /api/partner/v1/outcomes`
(the schema and the domain rule are in `docs/product/partner-api.md`); a
`removed` outcome for a link Asmita knows updates that survivor's case.

## Known limits

- Video `add` events carry bare frame hashes; the adapter synthesises the
  per-frame quality (100) and timestamps (30 fps) that the vPDQ format wants.
  If Asmita starts publishing per-frame quality or real timestamps, prefer
  those and drop the synthesis.
- The feed is global to every ACTIVE partner: all partner platforms receive
  the same fingerprint set. The adapter has no per-bank filtering; if you want
  only signals relevant to your domains, that is your matching pipeline's job
  (Asmita's hashes are for finding and blocking, not for identifying whose
  platform something was on).
- `not_found`/`blocked_reupload` outcomes and every question about the feed
  itself go through Asmita's partner channel, not through this adapter.

## Licence and attribution

The adapter is original Asmita code. It implements an interface published by
the ThreatExchange project and copies none of its source;
`LICENSE-THREATEXCHANGE.txt` carries that project's BSD licence as
attribution. Meta's name identifies the upstream project and its licence only;
nothing here is endorsed by or affiliated with Meta.
