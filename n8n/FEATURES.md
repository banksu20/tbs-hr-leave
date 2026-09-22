# Dashboard features

Backend migrations and workflow publication were completed on 22 September 2026. The matching app changes still require a push and Vercel deployment.

## Production verification — 22 September 2026

- Backed up all three HR tables (926 leave requests) and existing TBS function definitions in database schema `tbs_release_backup_20260922_features` before applying migrations through the manual n8n PostgreSQL node.
- Applied migrations 002 and 003. Published TBS HR workflow version `79a5c823-979a-4fbf-9b4f-fdd86136f6a2`, including authenticated history and rollover branches.
- The existing public site employee API continued returning HTTP 200 after publication, confirming the deployed server can authenticate to n8n.
- With the owner's authorization, created a labelled temporary quarter-day pending request for TBS 033 through the live site API. Verified backend approval, stale/repeated approval rejection, visibility through the site API, cancellation through the site API, history, and undo through the backend.
- Cancelled the temporary request after testing and verified the employee's original active requests and quotas were unchanged. The cancelled test record and its audit history remain for traceability.
- Live rollover preview returned proposed 2027 quotas, including TBS 033. No real employee rollover was applied. Apply/repeat/stale-preview behavior is covered by isolated database tests, not a production rollover.
- New approval/history/undo/rollover UI controls are not yet verified on the public site: the matching app code must first be pushed and deployed. The maintenance workflow has been returned to a read-only readiness query and remains unpublished.

## Pending local update

The simplified navigation, overview filters, calendar/history redesign and rejection action are not deployed. To enable rejection, reapply the idempotent `002_history_and_conflicts.sql` and `003_year_rollover.sql` through the maintenance PostgreSQL node and run the workflow patch again, then publish alongside the matching app deployment. Rejection uses a revision-checked pending-only action and records `reject` separately from cancellation. Its optional reason (maximum 1,000 characters) is stored in `rejection_reason`, preserving the employee’s original reason, and appears in history. Rollover is now preview-only at the UI, API and database function levels; applying requires a future reviewed change after policy approval. No production changes were made for this update.

## Deployment order

1. Back up the HR database. The existing `001_request_safety.sql` migration must already be applied.
2. Using an n8n PostgreSQL node, apply `002_history_and_conflicts.sql`, then `003_year_rollover.sql`, then `004_line_decisions.sql`. Do not use the destructive legacy root schema. These migrations add history storage, audit/overlap triggers, carryover expiry and shared LINE decision checks; they do not seed or replace employee records.
3. Export the current TBS HR draft privately. Run `node scripts/patch-dashboard-features.mjs INPUT.json OUTPUT.json`. The script requires the existing dashboard Header Auth credential and retains unrelated nodes/connections. Keep exports outside git; they may contain credentials/expressions.
4. Run `node scripts/patch-line-decisions.mjs OUTPUT.json COMBINED.json` on the feature patch. Review and import the combined inactive draft into the existing workflow. New authenticated branches are `GET dashboard-history` and `POST dashboard-rollover`. Create/update/delete use `tbs_dashboard_request_v2`; LINE decisions use the same guarded transition via `tbs_line_decision`. Only successful LINE decisions continue to existing sheet updates and notifications. Get-all and quota reads use expiry-aware allowances. See `TRANSITION.md` for verification and limitations.
5. Verify the Vercel server secret matches n8n before publishing. Deploy the app and publish the reviewed n8n draft together. Test using an isolated test employee, including a rejected overlap, undo, history and rollover preview. Rollover must not be applied to real employees as a smoke test.

## Behavior and limitations

- Pending requests can be approved after confirmation of the entire request. The get-all query supplies a database revision; stale revisions, inactive employees and already handled requests are rejected. Approval changes only status, rechecks overlaps and records history. This action updates the HR database; it does not send LINE/email notifications or synchronize Google Sheets.
- The department filter is a dropdown. Monthly chart filters select annual, sick and personal leave. Monthly CSV and PDF exports allow choosing a month and individual employees within the current department/search filters. Only approved leave contributes; zero-use selected employees remain included. Exports require complete live data. PDFs include bundled Thai fonts and repeated table headers. CSV cells are protected against formula interpretation. Email delivery is deferred.
- History captures future inserts, meaningful updates and deletes on all three HR tables, atomically with each write. Existing history is not invented. It has cursor pagination across all years. No individual identity is asserted while login is disabled; database changes outside instrumented operations are labelled unidentified.
- Cancellation is soft deletion. Undo is available only for a cancellation recorded through the new dashboard mutation function, while the record still matches that event. It restores the previous status and rechecks active employment and overlaps. Earlier rejected requests cannot be safely identified as cancellations and have no undo button.
- All dates in a request are checked for overlap against non-rejected leave. Known opposite half-days are allowed. Quarter-day or legacy unknown periods on a shared date are conservatively treated as conflicts. The database guard covers other database writers too; their existing workflow error handling may need review. Existing overlapping records are not rewritten. Notes-only edits remain allowed.
- Calendar uses selected year, department and search filters, with a month and approved/pending selector. It shows half-day periods and excludes rejected leave.
- Rollover suggests a configurable five-day cap and March 31 expiry; this is a draft, not an adopted HR policy. The operator must explicitly confirm HR approval in the UI. All active employees are included; existing target-year quotas and incomplete source quotas are skipped. Source annual/sick/personal totals are copied. Only unused newly allocated annual days carry; previous carryover is consumed first and does not carry again. Pending leave reserves days.
- Rollover is preview-only. No apply control is offered; direct API and database apply calls are rejected, including with a preview token. Existing next-year quotas are shown as skipped.
- Carryover is valid through its expiry date and consumed first by leave dated on or before expiry. On the following day (Bangkok time), unused carryover stops contributing to the displayed allowance. No scheduled expiry job is needed. Historical views use today's expiry state. Backdated edits recalculate balances and are recorded in history.
- Public CEO access is unchanged, per the owner's earlier instruction. An audit trail is not a substitute for access control.

## Verification

`npm test`, `npm run typecheck`, and `npm run build`. Database tests use disposable local PGlite fixtures, never production data.

## Retiring the boss’s Excel ledger

The CEO dashboard reads/writes PostgreSQL through n8n. Overview, Roster and Sheet are views of the same saved records. CSV/PDF exports are reporting snapshots, not editable master copies. Retain the final Excel workbook as an archive and reconcile starting balances before relying exclusively on the dashboard.

The agreed transition is to use the dashboard as the boss’s main management tool while retaining existing employee/LINE Google Sheets connections temporarily. The older workflow uses Sheets for registration, submission and approval, and combines sheet history/calendar data with database records. No such integrations have been disabled in this local update. The database migration of those paths is a later phase, gated by the checks in `TRANSITION.md`; it has not been completed or scheduled automatically.
