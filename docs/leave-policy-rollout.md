# Leave policy and registration rollout

Release implementation and verification notes. Database migrations and private n8n operations applied on 9 October 2026; frontend publication is verified separately.

## Final policy

All times use Asia/Bangkok. Sick: before 08:30 on the first leave date. Personal: before 16:30 on the preceding working day. Full-time annual: before 16:30 one calendar day before. Intern annual: before 16:30 three calendar days before. Exactly the cutoff is late. Sick/personal emergencies require an explanation; annual has no emergency override.

Full-time personal allowance is 3 per calendar year; annual uses individual entitlements and eligible carryover. Sick has 30 paid days, without blocking further sick requests. Dan/Alex remain quota-exempt recordkeeping profiles. Intern allowances cover the whole term: 4 months = sick 2/personal 3/annual 2; 6 months = sick 3/personal 3/annual 3. University activity requires supporting evidence and HR review.

New requests require reasons. Approved and pending days reserve allowance, using fractional days. Approval and amendments revalidate allowance under the employee row lock; stale revisions are refused. Pending cancellation releases the cancelled dates; requested cancellation of approved leave releases nothing until approval.

Personal reminders are employee-only Flex cards at the next 08:30 run after >=2 approved personal days have occurred. One per full-time calendar year, or one per internship; acknowledgement does not change balances, and absence of acknowledgement does not cause daily repeats. Existing sick notification settings are preserved. New personal notices default off until rollout activation.

Three consecutive working days with sick absence, including half-days, trigger a medical-certificate reminder. Files can be uploaded with the request or later from employee history. PDF/PNG/JPEG, up to 2 MB each and three per request. Files are kept in a private database table, accessed through verified LINE identity or scoped dashboard sessions, and downloaded as attachments with nosniff. Unattached files can be removed by their owner; stale orphans are cleaned on the next upload. Attached evidence follows the HR record retention policy (no automatic purge in this release).

## Registration and access

The same LIFF app and ProfileSetup form now offer Full-time / Intern. The server verifies LINE identity and ignores user-supplied account IDs. Registrations stay pending until a reviewer activates them. Nam's HR dashboard can activate only interns; Admin/CEO activate either group. Existing employees cannot use registration to reclassify themselves.

Intern activation requires 4/6-month programme and start/end dates, assigns a unique TBSInterns code, and enables requests. Existing interns have a terms editor; terms are locked once non-rejected leave exists. Intern approval and cancellation requests route to Nam. Intern LINE decisions require Nam's verified account; Admin/CEO retain their agreed dashboard authority.

The login form is larger and centered, with generated Daniel Parsons and HR clipart in the page background and essential labels only. Reference: https://tbs-marketing.com/team/daniel/ . No passwords changed.

## Company calendar

HR, Admin and CEO manage the shared calendar from their account menu. The app calendar and working-day calculations use the same database. Each relevant year must be explicitly confirmed. There is no estimated public-holiday fallback. Calendar saves use a revision check to prevent overwriting another user's changes. Include adjacent years for requests around New Year.

## Deployment sequence

1. Back up the production database and main n8n workflow. Review current/future personal allowances normalized to 3 by migration 021. Existing records are not automatically rejected.
2. Apply 021, 022, existing 023, then 024–032 in sequence. Never reapply an earlier migration alone after later wrappers: reapply the full ordered chain.
3. Apply `patchLeavePolicy` to a fresh workflow export and publish together with the app. The patch adds private operations, updates quota reporting and disables the old public register-user/submit-leave triggers. Those old endpoints must not bypass the new verified APIs. Existing LINE messages continue using their existing handlers; intern cards use the new verified decision page.
4. The 2026 national holiday list from Office Holidays is confirmed by the user and seeded with English/Thai names. HR must confirm 2027 and any other required years. Test local and then isolated Dale-only production fixtures. Do not create fake leave for staff or send them test notifications.
5. Enable `tbs_leave_policy_settings.personal_notifications_enabled` during authorized rollout. Existing qualifying users will receive their one notice on the next 08:30 run. Existing sick notification settings remain unchanged.
6. Verify live workflow/API versions, a controlled LINE delivery and acknowledgement, quota changes and calendar outbox processing. No Google Sheets sync is restored.

## Validation and limits

Run `npm test`, `npm run typecheck`, `npm run build`. Tests include real migrations/transactions in PGlite and API-to-database integration with identity and transport mocked. Coverage includes quotas, calendar boundaries, emergencies, intern scopes, registration, evidence ownership and notification payloads. This is not a multi-connection production PostgreSQL stress test or proof of actual LINE delivery.

Local previews: `/scripts/previews/dashboard-access.html`, `/scripts/previews/intern-registration.html`, `/scripts/previews/leave-policy.html`. They intercept all fetches and cannot affect real records or send messages. The registration preview uses the same form/review components as production.

## Release review fixes

- Database evidence guard covers university activity inserts, edits and approvals, including dashboard mutations. Employee submission attaches validated files inside the same transaction.
- Medical reminder is skipped when that request already has a certificate. Later upload removes its unsent, unleased reminder; messages already in delivery cannot be recalled.
- Calendar title, day/month labels and holiday names follow the app language. Both language names are editable by HR. Regional and government-only holidays are excluded from the approved 2026 seed.
- Intern cancellation routing and verified LINE decisions tested for Nam; generic approver wording replaces CEO-only text for this shared flow.
- Existing employee card colours, spacing and history layout retained. Login artwork remains background decoration.
- Local full suite: 159 passed, plus language regression test (160 total); typecheck and production build passed. Existing bundle-size warning remains.
- Production snapshots are stored in restricted schema tbs_policy_backup_20261009. Workflow exports are retained outside the repository. Migration preserved 960 leave requests and 36 employee records.
