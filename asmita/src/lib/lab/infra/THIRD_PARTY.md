# Third-party pieces used by the infrastructure scanner (WP114)

Recorded per the research-tools spec's licence rule: only pieces whose
licence allows a public NGO web service are used, each with its name,
licence, URL and pinned version.

| Piece | Licence | URL | Version / pin |
|---|---|---|---|
| `tldts` (npm) — Public Suffix List parsing for registrable domains | MIT | https://github.com/remusao/tldts | 7.5.5 (package.json) |
| Public Suffix List data, bundled inside `tldts` | MPL 2.0 | https://publicsuffix.org/list/ | as bundled by tldts 7.5.5 |
| Keccak-f[1600] round constants and rotation offsets | Public reference (Keccak Reference, Bertoni, Daemen, Peeters, Van Assche) — constants are reproduced in every independent implementation | https://keccak.team/keccak_specs_summary.html | — (implemented here from the algorithm description; correctness verified against the published test vectors below) |

Verified against, nothing copied from:

- js-sha3 (MIT, https://github.com/emn178/js-sha3) — used offline during
  development to check this repository's own Keccak implementation
  round-constants and end-to-end hashes of "" and "abc".
- BIP-173 and BIP-350 bech32 test vectors (public specification documents)
  for the Bitcoin address validators.
- EIP-55 checksum example addresses for the Ethereum validator.
- IANA RDAP bootstrap files (https://data.iana.org/rdap/dns.json,
  ipv4.json, ipv6.json) — public registry data, fetched at scan time and
  cached 24 h; never committed.
- crt.sh (https://crt.sh) — Sectigo's public Certificate Transparency
  search, queried at scan time; results are never committed.
