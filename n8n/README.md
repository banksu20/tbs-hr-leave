# TBS HR fixes — deployment sequence

All repository changes are uncommitted. On 2026-09-21 the additive database migration was applied successfully through the PostgreSQL node in maintenance workflow `Ln3BwcSN2e2GHZWa` (execution `582013`). The three HR tables were backed up inside database schema `tbs_release_backup_20260921`; all 924 existing leave requests were preserved.

Nine SQL/history fixes are saved as an unpublished draft in workflow `pcJFDAUvfT2LYIwT`. The published workflow is unchanged. Header Auth, the matching server environment variables, and app deployment remain outstanding. The user does not have access to the owning Vercel account; hosting must be resolved before release.

## Files

- `sql/001_request_safety.sql`: additive migration on the existing n8n PostgreSQL database. Adds `half_day_period` and request-validation/date-allocation functions. Does not insert, delete, or rewrite existing employee records.
- `sql/get-all-leaves.sql`, `sql/get-quota.sql`: include cross-year requests and allocate balances by selected date.
- `sql/employee-profile.sql`: update `tbs_id`, matching the read query.
- `../scripts/patch-n8n-workflow.mjs`: patch a fresh exported workflow without recreating nodes or their connections. Fixes the history reference, uses structured SQL parameter arrays, and configures Header Auth on dashboard webhooks.

The original export and generated inactive patch are in the user's Downloads folder, outside git. Full workflow exports may contain sensitive expressions and must remain private.

## Apply together

1. Back up the database and export the current workflow. Confirm that `leave_requests`, `leave_quotas`, and `tbs_employees` are the existing production tables. Run **only** `sql/001_request_safety.sql` against that database. Do **not** run the legacy root `postgres_schema.sql`, which contains table truncation statements.
2. In n8n, create/select an **HTTP Header Auth** credential named `TBS dashboard server`, with header name `x-ceo-webhook-secret`. The account owner must enter the secret in the credential UI. Put the same value in the app server's **`CEO_WEBHOOK_SECRET`** environment variable. Never expose it through a `VITE_` variable or browser bundle.
3. Configure server `CEO_PASSWORD` and optionally `CEO_SESSION_SECRET`. Production now rejects access when `CEO_PASSWORD` is absent. A logged-in CEO session can save without a browser `CEO_API_TOKEN` header.
4. Generate the private workflow patch using the real credential ID:
   ```sh
   node scripts/patch-n8n-workflow.mjs /path/to/export.json /path/to/fixed.local.json HEADER_CREDENTIAL_ID
   ```
   Without the credential ID the export contains `CONFIGURE_HEADER_AUTH_BEFORE_PUBLISHING`; that draft is intentionally not ready to publish.
5. Import/review the patched workflow as a draft, retaining the original workflow identity and credential references. It is exported inactive to prevent accidental activation. Confirm all seven dashboard webhooks use the intended Header Auth credential. Publish the workflow and deploy the app in the same maintenance window; the old app's invalid IDs and partial edits are deliberately rejected by the new workflow.
6. Verify read-only behavior: CEO login, both selected years, cross-year balances, and employee history. Test authenticated create/update/delete using an approved test employee in a staging database before production writes. An unauthenticated write must fail before SQL runs.

## Editing semantics

Database rows represent complete leave requests, not individual days. Dashboard row IDs are stable display keys; `requestId` remains the database ID. Editing any part of a multi-date request opens a form showing all its dates, including dates in another year. Removing it requires explicit confirmation for the entire request. The SQL function checks the original date list under a row lock and rejects a stale or partial target.

Historical half-day requests with no period are preserved; the user must select morning/afternoon when editing them. New half-day requests always store the period. Quota calculations preserve the existing policy of reserving all non-rejected requests, including pending leave.

## Validation

`npm test` exercises an isolated PostgreSQL-compatible PGlite database, API validation, authentication, workflow patch structure, failed saves and year-cache isolation. `npm run typecheck` checks both app and API; `npm run build` builds the frontend. These checks never call production webhooks.
