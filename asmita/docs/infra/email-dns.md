# Email DNS Setup â€” meriasmita.org

Status: domain purchased (meriasmita.org), Google Workspace active for human
mailboxes, Resend selected for application sending. DNS records below are
pending human setup. Do not send real notices until Resend shows the domain
as Verified AND legal templates are approved.

## Mail architecture

| Concern | Provider | Addresses |
|---|---|---|
| Human inboxes (receiving + replying) | Google Workspace | hello@, grievance@, partners@, security@, press@, dmarc@ |
| Application sending (notices, OTPs, advisories) | Resend | notice@meriasmita.org, update@meriasmita.org |

Replies from platforms to `notice@meriasmita.org` are received by Google
Workspace (MX stays with Google), so create `notices@` and `updates@` as
Workspace users or aliases â€” otherwise platform acknowledgements bounce.

## DNS records to add (at the domain registrar / DNS host)

### 1. MX â€” receiving (Google Workspace)

Set during Workspace signup; verify it is the current single-record form:

```
@   MX   1   smtp.google.com.
```

### 2. SPF â€” ONE record combining both senders

A domain must have exactly ONE SPF TXT record. Merge Google + Resend:

```
@   TXT   "v=spf1 include:_spf.google.com include:amazonses.com ~all"
```

Note: Resend sends via Amazon SES infrastructure; confirm the exact include
Resend's dashboard shows for the domain (it may instead provide an SPF value
on a subdomain like `send.meriasmita.org` â€” if so, add THAT record verbatim
and keep the root SPF as Google-only).

### 3. DKIM â€” two signatures, different selectors (no conflict)

- Google: Admin console â†’ Apps â†’ Gmail â†’ Authenticate email â†’ generate â†’
  add the `google._domainkey` TXT record â†’ click "Start authentication".
- Resend: Dashboard â†’ Domains â†’ Add `meriasmita.org` â†’ add the
  `resend._domainkey` (or similar) TXT/CNAME records it lists.

### 4. DMARC â€” one policy for the domain

Start at quarantine, move to reject after 2 weeks of clean reports:

```
_dmarc   TXT   "v=DMARC1; p=quarantine; rua=mailto:dmarc@meriasmita.org; fo=1"
```

After 2 clean weeks: change `p=quarantine` â†’ `p=reject`.

### 5. Resend webhook (delivery proof)

After domain verification, configure the Resend webhook to
`https://meriasmita.org/api/webhooks/resend` so EmailDeliveryProof records
populate.

## Checklist before first real notice

- [ ] Resend dashboard shows meriasmita.org **Verified**
- [ ] `notices@` and `updates@` exist in Google Workspace (user or alias)
- [ ] Send a test from Resend to a Gmail account; check "show original" â†’
      SPF=pass, DKIM=pass, DMARC=pass
- [ ] Reply to that test email; confirm the reply lands in the Workspace inbox
- [ ] DMARC reports arriving at dmarc@meriasmita.org
- [ ] RESEND_API_KEY + EMAIL_FROM env vars set in Vercel
- [ ] Legal templates approved (separate gate)
