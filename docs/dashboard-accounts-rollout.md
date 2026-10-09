# Dashboard accounts and intern separation

Account migration 023 is applied and Admin, CEO and HR accounts are provisioned. The protected n8n dispatcher is published. Website release is being verified separately; leave-policy migrations 021/022 are not part of this release.

## Roles

- Admin: all leave records, plus create/disable accounts, change roles, reset passwords.
- CEO: all leave records, no account/password administration.
- HR: intern leave only; review, edit, approve/reject, cancel and archive/restore interns. No full-time data, general history, quota editor, delivery administration or rollover.

Admin and CEO switch between Full-time and Interns. Each group has its own query/cache key, tables and approvals. Full-time overview/export uses only full-time records. Interns are excluded from employee rollover. HR has no Full-time tab, and server/database authorization rejects guessed employee/request IDs.

Interns have explicit `employment_type='intern'` and a unique persistent `intern_number`; the visible format is `TBSInterns-001`. Codes are not inferred from departments and are retained on archive/reclassification. Existing employee IDs remain stable for historical references.

Intern allowances and deadline rules are deliberately unconfigured. New intern requests fail with an explanatory message. Standard employee quota reminders do not apply to interns. Existing intern leave can still be reviewed. Do not enable requests or copy employee quotas until HR supplies intern policy.

Archive hides interns from the active table but retains history; Show archived interns offers Restore. Archive does not cancel existing leave or remove calendar entries. Permanent erasure is not implemented: the user has not chosen it over archiving.

## Authentication

Passwords use per-password random salts and scrypt hashes; no plaintext password is sent to n8n. Sessions use random 256-bit opaque cookies, with only SHA-256 token hashes stored in the database. Cookies are HttpOnly/SameSite=Strict, Secure in production, and expire after eight hours. Disabled accounts and password/role edits revoke sessions. Login attempts have durable username/IP windows. Account changes are audited. The old public bypass, API-token fallback and static CEO cookie are removed.

Browser persistence of leave records is removed; old localStorage caches are cleared. Logout clears React Query data. Authorization is rechecked by the server, not trusted from a role picker or browser storage.

## Release sequence

1. Apply migration 023 after backup and review; it also supports the existing production schema without migrations 021/022. Existing people default to employee; no real person is automatically classified as an intern.
2. Apply `patch-dashboard-accounts.mjs` to a fresh main n8n export and publish. The dashboard auth dispatcher must retain its existing Header Auth credential. It must not be exposed as an unauthenticated webhook.
3. Set a new, private `DASHBOARD_BOOTSTRAP_PASSWORD` (8–128 characters) in the server deployment environment. Do not reuse the n8n webhook secret or expose this as a VITE variable. Do not paste it in chat. First successful sign-in as `admin` creates the initial Admin account only if no accounts exist.
4. Deploy the matching app/API together. Sign in as admin; create named CEO and HR accounts using Accounts. Remove the bootstrap environment value after setup; normal password hashes then handle sign-in.
5. Classify verified interns under Interns → Classify interns. Confirm the person: this grants HR access to that person's existing leave history.
6. Live verification must cover full-time/intern read isolation, direct-ID mutation denial, reset/logout/session expiry, and permitted intern approval/cancellation. Local SQL tests use PGlite, not a multi-connection production PostgreSQL stress test.

Local visual preview: `/scripts/previews/dashboard-access.html`. Use usernames `admin`, `ceo`, or `hr` with any nonempty demo password. Every request is intercepted and no real account is changed. This preview is not imported by the production app.
