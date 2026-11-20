# pdq-robustness

Measures how well our PDQ matching catches ALTERED COPIES of an image, at the
production threshold (`PDQ_MATCH_THRESHOLD`, 31) and at 20/25/31/40, and how
often unrelated images false-match. WP36 of crawler v2: the numbers back the
keep-or-change decision on the threshold and tell the SSCD second-layer work
package exactly which alterations PDQ misses.

The hashing side is the production pipeline itself, imported, never copied:
`crawler/src/prepare.ts` (the crawler's decode recipe, resolving sharp from
`crawler/node_modules`) plus `asmita/src/lib/pdq/pdq.ts`. Run `npm ci` in
`crawler/` before this harness, like `tools/pdq-agreement`.

Thorn's open-source perception library (github.com/thorn-oss/perception,
Apache-2.0) is the reference implementation: `python/perception_ref.py`
hashes the same files with `perception.hashers.PDQHash` (Meta's C++ PDQ via
the `pdqhash` bindings) so the report can show that our PDQ agrees with it.
We link to the library and copy nothing from it.

## The test set is harmless by construction

Everything is generated at run time, nothing generated is committed (images
live only in `out/`, gitignored, and total a few hundred MB):

- 15 synthetic images built in code from a seeded PRNG: gradients, vector
  shapes, pseudo-text glyphs, value-noise textures and a procedural landscape
  (JPEG, PNG and WebP, 800x600);
- up to 6 curated public-domain landscape photographs fetched once from
  Wikimedia Commons, licence re-verified through the API at fetch time and
  recorded in the report and in `out/commons-manifest.json`.

Never photos of people, never anything intimate, no real-case data.

## Alterations measured

Crops (5-40%), resize (0.16x-2x), JPEG quality (30-90), rotation (1-10 deg),
mirror, borders (4%, 12%), brightness and contrast shifts, blur, an added
text sticker (small, large), screenshot-style double resampling, and four
realistic stacks (alteration + re-upload recompression). Pixel alterations are
encoded losslessly so each row measures its alteration alone; the report's
"caught prod @31" column also applies the production quality floor
(a copy below PDQ quality 50 is skipped by the crawler whatever its distance).

## Run

```bash
(cd ../../crawler && npm ci)     # the production pipeline resolves sharp from there
npm ci
npm run report                   # Node 22: builds out/, measures, writes REPORT.md
```

Then, for the perception reference (host Python 3.12; optional but recommended):

```bash
python3.12 -m venv .venv
.venv/bin/pip install "perception[pdq]"
.venv/bin/python python/perception_ref.py   # hashes out/images, writes out/perception-hashes.json
npm run report                              # re-run to fold the agreement section into REPORT.md
```

The report degrades gracefully: without the Python step it says the reference
was not measured; offline, it runs synthetic-only and says so.

`npm test` unit-tests the alteration matrix (spec ranges), the aggregation
math, and an end-to-end sanity of the production pipeline through this
harness (mild recompression inside the threshold, unrelated images far
outside it).

## Reading the result

`REPORT.md` holds the measured numbers and the recommendation. The commit
that added this harness carries the report of an actual run; regenerating
overwrites it. Per-image hashes live in `out/node-hashes.json` and
`out/perception-hashes.json`. The production threshold itself is NOT changed
by this work package; if a future run justifies a change, that is a separate
decision with its own work package.
