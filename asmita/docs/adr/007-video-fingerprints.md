# ADR 007: Video fingerprints (vPDQ)

**Status:** Proposed (19 November 2026). Phase 1 and 2 may be built and tested; real-case use waits for the legal sign-off below. Phase 3 needs this ADR accepted and a security review.

## Context

Asmita fingerprints survivors' photos on their own device (PDQ) and its crawler matches those fingerprints on the web (ADR 006). Much non-consensual intimate content is video. The owner decided on 19 November 2026 to add videos.

## Decision

1. **Survivor side (Phase 1).** A survivor can fingerprint a video in her browser with vPDQ: one frame per second, the PDQ hash of each frame, near-duplicate frames dropped, at most 1,000 frames and 60 minutes. The video and its frames never leave her device; only frame hashes, qualities and timestamps are sent. This extends the existing no-media rule; it does not relax it.
2. **Notices.** A video fingerprint is listed in the fingerprint annex as one entry with its frame hashes (at most 200). What she signs is what is sent, as for images.
3. **Crawler, previews only (Phase 2).** The crawler compares video preview images it already sees (posters, thumbnails, preview sprites) with survivors' video frame hashes, under every rule of ADR 006. No video bytes are fetched.
4. **Crawler, video sampling (Phase 3, not yet decided).** Fetching parts of videos (byte ranges, stream segments) and decoding frames in memory would extend ADR 006's allowed fetches. It is deferred until this ADR is accepted and the decoder sandbox has been reviewed for ffmpeg.

## For legal sign-off

- The fingerprint annex wording for video fingerprints (platform-facing).
- That her existing consent and authorisation wording covers video fingerprints, or what to add.
- Phase 3: whether fetching segments of a publicly posted video to compare it in memory is acceptable on the same basis as images.
- The written procedure for suspected child sexual abuse material applies to video matches too.

## Consequences

- More fingerprints per survivor: the crawler's matcher needs an index (Phase 2).
- Browsers cannot read every format (for example HEVC on some devices); survivors get a clear message and nothing is sent.
- Bandwidth and compute rise sharply only in Phase 3, which has its own budgets.
