# Open tools: sources read and facts not confirmed

One section per tool in `src/lib/lab/open-tools/catalogue.ts`, for WP150
(docs/lab/open-tools-spec.md, Part D). Every URL below was read on
22 November 2026, and each tool's `sources` list in the catalogue names the
URLs its facts came from. Facts the spec's Part D gives but no official page
states, and facts we could not confirm and therefore left out, are recorded
per tool. The spec's Part D facts (owner-checked 22 November 2026) are
themselves an allowed source; where a claim rests on Part D alone, that is
said.

General note on licence names: the catalogue shows SPDX-style short names
(BSD-3-Clause, BSD-2-Clause, MIT, Apache-2.0, CC-BY-4.0). The clause counts
for the ThreatExchange licences were read from the licence texts themselves:
the repository-root `LICENSE` carries three conditions (BSD-3-Clause), while
`vpdq/LICENSE.txt` and `tmk/LICENSE.txt` carry two (BSD-2-Clause). Part D
says "BSD" for all three; the pages therefore say the more precise name,
with the licence file linked.

## Matching and hashing

### PDQ (`pdq`)
Read: the directory README
(https://github.com/meta/ThreatExchange/tree/main/pdq, fetched as
raw.githubusercontent.com/meta/ThreatExchange/main/pdq/README.md) and the
repository licence (https://github.com/meta/ThreatExchange/blob/main/LICENSE,
"BSD License for ThreatExchange software").

Confirmed from the README: perceptual, DCT-based ("P"); a quality metric ("Q")
for filtering junky images; C++, PHP, Python, Java and WASM implementations
(November 2025 note); recommended thresholds, distance 31 or less for a
match and quality 49 or below to discard; the dihedral-hash caveat.

Not confirmed externally, taken from Part D and cross-checked against
Asmita's own port: the 256-bit length written as 64 hexadecimal characters
and the 0 to 100 quality range. The canonical algorithm document
(https://github.com/meta/ThreatExchange/blob/main/hashing/hashing.pdf) is
linked from the README but was not read (a 25.9 MB PDF); Asmita's
implementation (asmita/src/lib/pdq/pdq.ts, validated against Meta's
reference vectors) uses exactly this shape, so the claim is safe.

### vPDQ (`vpdq`)
Read: the directory README (raw.githubusercontent.com/meta/ThreatExchange/
main/vpdq/README.md via https://github.com/meta/ThreatExchange/tree/main/vpdq)
and https://github.com/meta/ThreatExchange/blob/main/vpdq/LICENSE.txt.

Confirmed: one frame per second sampling as the typical rate; PDQ per frame;
two-direction match percentages with example thresholds; clip (subsequence)
matching; TMK comparison table (fixed-length versus variable-length);
pruning; ffmpeg requirement; Python binding installed with pip; frame
numbers and timestamps unused in comparison; FAISS integration through
python-threatexchange. Also confirmed from the licence text: two-clause BSD.

Part D gives no audiences for vPDQ; the catalogue gives it the same three
as PDQ (platform, ngo, researcher). Part D says "Effort: low to medium
(needs ffmpeg)"; the single-valued effort field is set to medium with a note.

### TMK+PDQF (`tmk-pdqf`)
Read: the directory README (raw.githubusercontent.com/meta/ThreatExchange/
main/tmk/README.md via https://github.com/meta/ThreatExchange/tree/main/tmk)
and https://github.com/meta/ThreatExchange/blob/main/tmk/LICENSE.txt.

Confirmed: fixed-length hashes and easy indexing; aimed at whole near-identical
videos; weak at clips; ffmpeg prerequisite; two-stage scoring with suggested
thresholds of 0.7; single-machine status notes dated 2019; FAISS query tool;
the Tech Coalition benchmark reference. Licence text: two-clause BSD.

Part D gives no audiences; the catalogue uses platform and researcher, the
two for which a whole-video index is a realistic ask.

### Hasher-Matcher-Actioner (`hma`)
Read: the directory README (raw.githubusercontent.com/meta/ThreatExchange/
main/hasher-matcher-actioner/README.md via
https://github.com/meta/ThreatExchange/tree/main/hasher-matcher-actioner),
the architecture document
(https://github.com/meta/ThreatExchange/blob/main/website/content/hma/architecture.md,
fetched as raw.githubusercontent.com/meta/ThreatExchange/main/website/
content/hma/architecture.md) and the repository licence.

Confirmed: banks; hash, match, action pipeline; PDQ for images and other
signal types (MD5 named for video in the architecture doc, which is why the
page says "other signal types such as video hashes"); Flask REST API;
PostgreSQL as the only service dependency; published Docker images
(ghcr.io/meta/threatexchange/hma); docker-compose demo; the programmes it
names (NCMEC Hash Sharing, GIFCT HSDB, StopNCII.org, ThreatExchange);
exchange and algorithm extensibility through python-threatexchange plugins;
single-instance operation possible. "It does not decide what to do with a
match" is Part D's framing; the README's description of the action step
("logging the content or enqueuing it for human review") supports it.

### SSCD (`sscd`)
Read: the repository README (https://github.com/facebookresearch/
sscd-copy-detection, fetched as raw.githubusercontent.com/facebookresearch/
sscd-copy-detection/main/README.md), the repository metadata
(https://api.github.com/repos/facebookresearch/sscd-copy-detection,
"archived": true) and the licence
(https://github.com/facebookresearch/sscd-copy-detection/blob/main/LICENSE,
MIT).

Confirmed: archived read-only status; MIT licence; CVPR 2022 paper
(arXiv 2202.10261); TorchScript models; 512-number descriptors (1024 for
sscd_disc_large); cosine similarity comparison; sscd_disc_mixup as the
recommended default; the calibration point (DISC pairs above 0.75 cosine
similarity are copies with 90 per cent precision); the note that models
retrained in this codebase differ slightly from the published pretrained
ones. "Catches crops, colour filters, overlays and screenshots" is Part D's
fact, consistent with the paper's DISC augmentation set that the README
names (blur, overlays, screenshots).

### Coop (`coop`)
Read: the README (https://github.com/roostorg/coop, fetched as
raw.githubusercontent.com/roostorg/coop/main/README.md); the architecture
doc (https://github.com/roostorg/coop/blob/main/docs/development/
architecture.md); the HMA integration doc
(https://github.com/roostorg/coop/blob/main/docs/integrations/hma.md); the
NCMEC integration doc
(https://github.com/roostorg/coop/blob/main/docs/integrations/ncmec.md); the
review-console doc
(https://github.com/roostorg/coop/blob/main/docs/user/review-console.md,
fetched as raw.githubusercontent.com/roostorg/coop/main/docs/user/
review-console.md); the repository tree
(https://api.github.com/repos/roostorg/coop/git/trees/main?recursive=1);
the licence (https://github.com/roostorg/coop/blob/main/LICENSE, Apache-2.0);
the docs site is listed as docsUrl (https://roostorg.github.io/coop/latest)
without a separate read.

Confirmed: React front end, Node.js back end, PostgreSQL, Scylla, ClickHouse
and Redis (architecture doc technology table); REST and GraphQL APIs;
routing and proactive rules; appeals with their own routing; user strikes;
bulk actioning; metrics; production users Kyodo, Notion, Musubi, UpScrolled
(README, linked from the page as the source); "The platform owns its policy.
Coop is the plumbing" (README); HMA integration including exchanges named
"NCMEC, StopNCII, ThreatExchange" (HMA doc); NCMEC CyberTipline reporting
for registered platforms (NCMEC doc); wellness settings blur, greyscale and
muted video, organisation defaults with per-reviewer overrides
(review-console doc); the integration folders for several classifier services
(google-content-safety, openai-csam-classifier, openai-moderation,
zentropi-cope, seen in the repository tree).

## Review and rules

### Osprey (`osprey`)
Read: the README (https://github.com/roostorg/osprey, fetched as
raw.githubusercontent.com/roostorg/osprey/main/README.md), the repository
root listing (https://api.github.com/repos/roostorg/osprey/contents) and the
licence (https://github.com/roostorg/osprey/blob/main/LICENSE.md,
Apache-2.0; the file is named LICENSE.md, not LICENSE).

Confirmed: rules engine and investigation console for real-time event
processing at scale; originally developed at Discord, open sourced through
ROOST; SML ("Some Madeup Language") rules with user-defined functions;
entity labels through a labels service (Postgres example); analysts query
and chart past events into new rules; adopters Bluesky, Discord and
Matrix.org (README, linked from the page as the source); Docker demo with
sample data and the exact curl command; Python project (uv.lock, Python
example plugins). "Built for event volumes of larger platforms, more than a
small app needs" is Part D's fact, consistent with the README's
"real-time event processing at scale".

### Altitude (`altitude`)
Read: the README (https://github.com/Jigsaw-Code/altitude, fetched as
raw.githubusercontent.com/Jigsaw-Code/altitude/main/README.md), the overview
document (https://github.com/Jigsaw-Code/altitude/blob/main/docs/overview.md)
and the licence statement in the README ("Apache 2.0; see LICENSE").

Confirmed: web application to triage and decide on flagged content from
counter-terrorism databases; part of Tech Against Terrorism, which offers
free bespoke onboarding support; connections to the Terrorist Content
Analytics Platform and the GIFCT Hash-Sharing Database, with login
credentials required; targets, signals, cases and reviews as the overview's
entities; the OpenAPI spec; verdict webhooks; prerequisites Git, GNU Make
and Docker. The overview does not mention HMA, so, as the spec requires, the
page does not say Altitude is built on it.

## Detection models

### NCII Prompt Guard (`ncii-prompt-guard`)
Read: the 3-class model card (https://huggingface.co/hfmlsoc/
ncii-prompt-guard-3c), the 5-class model card
(https://huggingface.co/hfmlsoc/ncii-prompt-guard-5c), the model metadata
(https://huggingface.co/api/models/hfmlsoc/ncii-prompt-guard-3c) and the
ROOST notes (https://github.com/roostorg/model-community/tree/main/
ncii-prompt-guard, fetched as raw.githubusercontent.com/roostorg/
model-community/main/ncii-prompt-guard/README.md).

Confirmed: 268 million parameters (268,100,096 in the model metadata);
fine-tuned from microsoft/harrier-oss-v1-270m (base_model tags and the ROOST
notes); MIT licence (card licence field and the ROOST notes); the 3-class
labels low, review, block and the 5-class labels safe, suggestive-ambiguous,
sexualizing-exposure, intimate-exposure, explicit-sexual-activity; about 0.90
block recall at about 0.93 block precision on the test split at the
documented operating point (0.902 recall, 0.926 precision in the model card
and its model-index); CPU-optimised standard transformers pipeline; the
deployer chooses thresholds; prompt-only vision, cannot adjudicate consent;
trained mainly on English ("Out of scope: languages beyond English (small
Spanish/Chinese slices only)"); the training dataset is gated, access on
request. The code snippet is the one the spec's Part D gives, with the
3-class model id exactly.

One discrepancy recorded: the model cards describe the architecture as a
"Gemma-3 text encoder" while the metadata and the ROOST notes give the base
model as microsoft/harrier-oss-v1-270m. Both are official statements; the
page follows Part D and the ROOST notes for the base model and does not name
the architecture family.

### gpt-oss-safeguard (`gpt-oss-safeguard`)
Read: the README (https://github.com/openai/gpt-oss-safeguard, fetched as
raw.githubusercontent.com/openai/gpt-oss-safeguard/main/README.md) and the
licence (https://github.com/openai/gpt-oss-safeguard/blob/main/LICENSE,
Apache-2.0). The ROOST notes
(https://github.com/roostorg/model-community/tree/main/gpt-oss-safeguard) are
listed as docsUrl.

Confirmed: safety reasoning models built on gpt-oss; bring your own policy;
classification with reasoning returned; two sizes, 20b (21B parameters,
3.6B active) and 120b (117B parameters, 5.1B active, fits a single 80 GB GPU
such as an H100 or MI300X); harmony response format required; permissive
Apache 2.0 licence; sample policy and golden set in the repository; a
prompting guide and a model card are linked from the README (the model card
is an arXiv page, not read separately). "Slower and costlier than a small
classifier" is Part D's fact, consistent with the sizes the README gives.

### GenD (`gend`)
Read: the repository README (https://github.com/yermandy/GenD, fetched as
raw.githubusercontent.com/yermandy/GenD/main/README.md), the paper listing
(https://arxiv.org/abs/2508.06248, cited from the README; the paper itself
not read), the detector preprocessing script
(raw.githubusercontent.com/yermandy/GenD/main/detector.py) and the face
detector module it imports
(raw.githubusercontent.com/yermandy/GenD/main/src/retinaface.py), the
InsightFace README (https://github.com/deepinsight/insightface, fetched as
raw.githubusercontent.com/deepinsight/insightface/master/README.md) and the
licence (https://github.com/yermandy/GenD/blob/main/LICENSE, MIT).

Confirmed: WACV 2026 paper "Deepfake Detection that Generalizes Across
Benchmarks", authors Yermakov, Čech, Matas and Fritz (README bibtex); 14
benchmark datasets spanning 2019 to 2025; face-swap and reenactment training
data; preprocessing detects and aligns a face first (5-point landmarks in the
repository's own detector.py and retinaface.py); Hugging Face model
collection; Gradio demo. The InsightFace README confirms the licence split
that drives the page's limit: code MIT, models "available for non-commercial
research purposes only". The page says the repository's default detector
"builds on InsightFace's models": the repository module is a RetinaFace
detector, and RetinaFace's pretrained weights are distributed under
InsightFace's non-commercial policy; worded to claim no more than that.
"Failure cases across demographics" and "independent research shows heavy
JPEG compression and low resolution hurt deepfake detectors in general" are
Part D's facts; the general compression claim is consistent with the
benchmark literature the paper surveys but was not re-verified against a
second source, and the page presents it as a caveat, not a number.

### YuNet (`yunet`)
Read: the model zoo README (https://github.com/opencv/opencv_zoo/tree/main/
models/face_detection_yunet, fetched as
raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/
README.md), the demo script (raw.githubusercontent.com/opencv/opencv_zoo/main/
models/face_detection_yunet/demo.py), the model folder licence
(https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/
LICENSE, MIT, Shiqi Yu) and the zoo licence
(https://github.com/opencv/opencv_zoo/blob/main/LICENSE, Apache-2.0).

Confirmed: light-weight and fast; model source Shiqi Yu's libfacedetection;
faces of roughly 10x10 to 300x300 pixels from the training scheme; OpenCV
DNN demo on CPU; box plus five landmarks (the demo reshapes each detection's
landmark slice into five points: eyes, nose tip, mouth corners); the
exact demo command quoted on the page.

## Provenance

### C2PA and Content Credentials (`c2pa`)
Read: the standards body site (https://c2pa.org), the public verify tool
(https://contentcredentials.org/verify), the c2pa-rs repository and its
licence files (https://github.com/contentauth/c2pa-rs,
https://github.com/contentauth/c2pa-rs/blob/main/LICENSE-MIT,
https://github.com/contentauth/c2pa-rs/blob/main/LICENSE-APACHE, the last
two fetched as raw files) and the c2pa-js licence
(https://github.com/contentauth/c2pa-js/blob/main/LICENSE, MIT).

Confirmed: the Coalition for Content Provenance and Authenticity publishes
the open standard; Content Credentials as its name for the signed record;
the c2pa-rs dual MIT/Apache-2.0 licence and the c2pa-js MIT licence; the
public verify tool and its supported formats. "Many platforms and messaging
apps strip this metadata when files are uploaded or forwarded" is Part D's
fact, echoed by the verify tool's own note that Content Credentials are
"still rolling out" and that inspected content "may not have information to
view"; the page states it as a caveat, not as a measured claim.

## Free services (not open source)

### StopNCII.org (`stopncii`)
Read: the site home page (https://stopncii.org) and the how-it-works page
(https://stopncii.org/how-it-works/). The HMA README was also read (under
HMA above) for the exchange claim.

Confirmed: free tool; operated by the Revenge Porn Helpline, part of SWGfL;
hashes created on the person's own device and the image never uploaded;
hashes shared with participating platforms that detect and remove matching
content; periodic re-checking; a case number to check status and withdraw;
18 or older at the time the image was taken; "StopNCII.org cannot remove
images from the whole internet, only the participating platforms"; the HMA
README names StopNCII.org among the exchanges its project ships plugins for.
Per the spec, the partner list was checked to exist (the partners page is
linked from the home page) but partners are not listed on our page.

### Take It Down (`take-it-down`)
Read: the service home page (https://takeitdown.ncmec.org/).

Confirmed: free service provided by the National Center for Missing &
Exploited Children; for nude, partially nude or sexually explicit images or
videos taken when the person was under 18; a hash value created on the
device, "Only the hash value will be provided to NCMEC"; the person can
remain anonymous; works with public or unencrypted online platforms that
have agreed to participate; the site points adults to stopncii.org. No
separate platform-joining page was read, so the page says only that
platforms that have agreed to participate can use the hashes.

## From Asmita

### Asmita fingerprint feed (`asmita-fingerprint-feed`)
Read: Asmita's own repository and docs. The public repository exists at
https://github.com/saquibreja7-hash/Asmita (checked through the GitHub API:
public, default branch master, Apache-2.0). Sources used for the page are
the partner API guide
(https://github.com/saquibreja7-hash/Asmita/blob/master/asmita/docs/product/partner-api.md,
identical in content to asmita/docs/product/partner-api.md in this
repository) and the site's own /for-platforms page (recorded as the internal
path "/for-platforms", the spec's instruction). The HMA exchange adapter
directory (asmita/docs/product/partner-hma-adapter/, with its README,
asmita_signal_exchange.py and the ThreatExchange BSD licence notice) was
also read.

Confirmed from those documents: append-only cursor feed of additions and
withdrawals; PDQ hashes for images, vPDQ frame hashes for videos; case
reference on every event; withdrawal means delete everything about the
fingerprint id; a person reviews every match; outcomes reported back through
the same API and shown on the survivor's case; fingerprints only for
finding, removing and blocking re-uploads, never for identifying or
profiling anyone.

One reconciliation recorded: Part D says "An HMA plugin is being built (say
'in development', no dates)", while the repository documents and ships an
exchange adapter as an example ("This is an example, not part of the Asmita
application"). The page says the adapter "is published in the repository as
an example and is in development; it is not part of the Asmita application",
which is true under both statements.

## Directories

### ROOST awesome-safety-tools (`awesome-safety-tools`)
Read: the README (https://github.com/roostorg/awesome-safety-tools, fetched
as raw.githubusercontent.com/roostorg/awesome-safety-tools/main/README.md)
and the licence (https://github.com/roostorg/awesome-safety-tools/blob/main/
LICENSE, Creative Commons Attribution 4.0 International).

Confirmed: a collection of open source tools for online safety; grouped by
job (hash matching, classification, AI for safety, decentralised platforms,
user safety tools, research infrastructure); "This list is not an
endorsement" in its own header; contributions by pull request; entries carry
a one-line note and a repository link.

### ROOST Model Community (`roost-model-community`)
Read: the README (https://github.com/roostorg/model-community, fetched as
raw.githubusercontent.com/roostorg/model-community/main/README.md) and the
licence (https://github.com/roostorg/model-community/blob/main/LICENSE,
Creative Commons Attribution 4.0 International).

Confirmed: partner models including ncii-prompt-guard and
gpt-oss-safeguard, each with a resource folder; the guide to using open
safety models across Detection, Investigation, Review and Enforcement
stages; policy prompt packs; bi-weekly office hours, sprints and Discord;
partner models "free to access, platform-agnostic in deployment, and have no
commercial or output restrictions in their licenses". The eligibility
criteria file is linked from the README but was not read separately; the
page quotes only the README's wording.

## Re-checks for the how-we-choose page (WP155)

Read again on 22 November 2026, before writing
`src/app/(public)/lab/open-tools/how-we-choose/page.tsx`. The page's
own method text (what "open" means here, the five checks, the three
refusals, the suggest-a-tool instructions) is the spec's Part C3
wording, and the three not-open-source services it names (StopNCII.org,
Take It Down, the Asmita partner feed) come from Part D and the checks
above. The only tool facts the page states itself are the two ROOST
links and their licence, both re-confirmed at their repositories:

- https://github.com/roostorg/awesome-safety-tools — the repository page
  describes "a directory of open source tools for online trust and
  safety", shows the CC-BY-4.0 licence, and keeps its own header line
  that the list "is not an endorsement, but rather an attempt to
  organize and map the available technology".
- https://github.com/roostorg/model-community — the repository page
  describes "making open safety AI models accessible and beneficial to
  the safety community", shows the CC-BY-4.0 licence, and lists the
  partner-model folders (gpt-oss-safeguard among them).

Both re-reads confirmed what the two directory entries already say. No
other source was read for WP155; no new tool fact entered the build.
