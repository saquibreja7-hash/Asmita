# Security Policy

Asmita handles workflows that can involve severe personal harm. Please report vulnerabilities privately and do not include real victim data, real NCII URLs, credentials, or sensitive case details.

## What To Report Privately

- authentication or authorization bypasses
- case-data exposure
- audit-log tampering
- stored XSS or injection
- URL handling that fetches, renders, previews, or stores intimate media
- notice dispatch bypassing required review gates
- secrets exposed in code, logs, builds, or documentation
- denial-of-service risks in intake, queues, or admin workflows

## How To Report

If GitHub private vulnerability reporting is enabled for this repository, use that channel.

If it is not enabled, contact the repository maintainer directly through the public GitHub profile and request a private disclosure channel. Do not post exploit details publicly.

## Safe Research Rules

- Use synthetic data only.
- Do not submit real NCII links.
- Do not test against real survivor cases.
- Do not contact platforms, NGOs, law enforcement, or victims while testing.
- Do not run automated scanning against third-party platforms from this codebase.

## Maintainer Response

The maintainer should acknowledge a valid private report, triage severity, prepare a fix, and publish a minimal advisory once users can update safely.
