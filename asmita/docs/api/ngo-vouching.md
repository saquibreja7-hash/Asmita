# NGO Vouching API

Status: documented and key issuance helper implemented. Live keys must only be issued after an NGO partner agreement is signed.

## Authentication

NGO API keys use the prefix `ngo_`. Store only the SHA-256 hash server-side. The plaintext key is shown once to the partner.

## Intended Use

The vouching API is for approved NGO workers to attest that a beta case came through a partner support workflow. It must not be used to upload intimate media or bypass victim consent.

## Key Lifecycle

- Issue with `issueNgoApiKey(partnerName)`.
- Store the returned `record`; share the returned `secret` through an approved secure channel.
- Revoke immediately if a partner leaves, a device is lost, or suspicious access appears.
- Rotate at least quarterly.

## Request Shape

```json
{
  "caseReference": "ASMITA-2026-00001",
  "ngoWorkerReference": "partner-local-id",
  "attestation": "Victim requested NGO-assisted beta support."
}
```

## Production Gate

Do not enable live vouching until NGO MOU, privacy review, access logging, and abuse handling are complete.
