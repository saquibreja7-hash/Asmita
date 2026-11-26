# Admin access and recovery

How people get into the admin console, and how to get back in when someone loses their authenticator.

## Who can sign in

There are two kinds of admin.

- **Owners** are listed in the Worker environment (`ADMIN_EMAILS` plus a role in `ADMIN_ROLES`). They always win, can't be changed from the console, and are how the very first admin exists. Changing them needs a redeploy.
- **Console admins** are added by a super admin at `/admin/admins` → **Add an admin**. Their role can be changed and they can be removed there. These admins are stored encrypted in the `ConsoleAdmin` table.

Adding an admin shows a one-time **enrolment code** once. Hand it over out of band (in person or by phone, never by email). The new admin signs in at `/admin` with their email code plus the enrolment code, then sets up their own authenticator. The code expires after 24 hours.

Every add, role change and removal needs a fresh authenticator code and is written to the audit log (`ADMIN_ADDED`, `ADMIN_ROLE_CHANGED`, `ADMIN_REMOVED`).

The console stops you locking yourself out:

- nobody can change or remove their own access;
- the last super admin can't be demoted or removed;
- removing an admin also clears their authenticator.

## Someone lost their authenticator

1. **Another super admin resets it.** Go to `/admin/admins` → find the admin → **Reset MFA**. This issues a new enrolment code (shown once). Hand it over; they sign in with email code + enrolment code and enrol again.
2. **Keep two super admins.** The Admins page warns when there is only one. With two, either can reset the other, so step 1 always works.
3. **Last resort, no super admin can sign in.** Someone with the production database owner connection runs, from `asmita/`:

   ```bash
   DATABASE_URL=<owner connection> node scripts/issue-admin-enrolment-code.mjs owner@example.org
   ```

   The address must be an owner (`ADMIN_EMAILS`) or an existing console admin. It prints one enrolment code; continue as in step 1. Treat this like a break-glass key: note who ran it and when.

## Legal review of templates

A notice template is sent only after a human legal reviewer records a review. A legal advisor or super admin opens `/admin/templates`, chooses **Read and review**, reads the full text, ticks the confirmation, enters their name and records the review (a fresh authenticator code is asked for). The decision and the template version go to the audit log (`TEMPLATE_LEGAL_REVIEW_RECORDED`). **Withdraw review** blocks the template again. Code and seeds never record a review.
