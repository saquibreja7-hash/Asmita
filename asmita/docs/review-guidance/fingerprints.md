# Fingerprints: review guidance

> Draft: not reviewed. Written from the code and existing console docs; it
> carries no legal advice and nothing in it replaces the owner's word.

## What this queue holds

Perceptual fingerprints (PDQ and video PDQ) a survivor submitted for
proactive blocking, waiting in pending review before a hash advisory can go
to the platforms she chose. Only the 64-character digest, the algorithm and
the quality score travel; the image itself never reached the server and is
never shown anywhere.

## Deciding

- **Approve fingerprint** records the approval. Once every fingerprint the
  survivor signed for is approved, the signed hash advisory goes to each
  platform she named, exactly as the Fingerprints page sends it. Approving
  one by one is safe: dispatch re-checks and skips a platform already sent.
- **Reject fingerprint** records the rejection. Rejecting a fingerprint that
  is part of a signed notice voids that signature, and the survivor must
  sign the current set again before anything can be sent. The screen warns
  when this applies.

## Good practice

A low-quality digest matches too broadly; the quality score is on the card.
The case reference links to the full case, and the case's other open items
are listed under the card. Your reason is internal and encrypted: it is
never sent to the survivor or a platform, and it never appears in a notice.

## Development only

In local development a flag can auto-approve fingerprints and bypass the
legal template review. Those bypasses must never reach a deployed
environment; production behaviour is unaffected by them.
