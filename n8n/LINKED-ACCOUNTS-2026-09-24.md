# Alice: two LINE accounts, one employee

Owner authorized TBS030 as the main employee and exclusion of test records on 24 September 2026.

## Live changes

- Applied 009 through the n8n PostgreSQL maintenance node (execution 596199).
- Published main workflow version `08d0f2f3-edaa-470d-b628-afed907f336d`: profile lookup, history, quota and submissions resolve linked account IDs. Existing Sheets integrations remain configured. Dashboard employee listing excludes linked secondary identities.
- Applied guarded 010 transaction (596201). Genuine approved request #1063 moved from TBS033 to TBS030. Requests #1054, #1059, #1060 and #1061 remain rejected under the inactive secondary identity, outside shared history and balances. No records were permanently deleted.
- TBS030 allowances were preserved exactly. Secondary allowances were not added to them.
- Original employee, request, quota, history, Sheet-link and job snapshots are retained privately in `tbs_account_merge_archive`, key `alice-033-to-030-20260924`. These contain HR data; do not export them into Git.
- Verified unique Sheet header `Name :  Alice` is linked to TBS030 for 2026. Its sync completed successfully. The isolated TBS033 test-tab job is blocked to prevent further writes from the archived identity; its old content is preserved.
- Notification routing remembers the submitting LINE account in `tbs_request_accounts`. Future decisions notify the account that submitted the request, while both accounts see the same history and quota. This migration sent no new notifications.
- Old dashboard edits cannot reactivate or change secondary employee/quota/request rows. Existing approval revision/token guards remain intact.

## Verification

- Production profile/quota/history calls succeeded for both accounts (596205–596210). Histories match, with 11 genuine records and no test records. Current quotas: annual 3, personal 3, sick unlimited; 2026 sick taken 2.5 days.
- Live dashboard API shows only TBS030, including three genuine 2026 requests.
- Live PostgreSQL submission verification for both accounts passed and was rolled back (596222); no test leave or messages persisted.
- Calendar sync replaced its own TBS033 entry with TBS030 for 24 September (596213). Repeat run 596219 made zero changes. Manual calendar events were preserved.
- Full existing test suite plus initial merge test passed (63 tests). Additional workflow-routing/idempotence test passed in the two-test linked-account suite.

## Maintaining this configuration

Apply migrations 001–008 before 009. If older migrations replace the submission or sync functions, reapply 009 afterward. Apply `patchLinkedAccounts` from `scripts/patch-linked-accounts.mjs` after other workflow patch functions, to retain account routing and roster exclusion.

010 is a one-time guarded merge, not a general employee merge API. It refuses unexpected additional secondary requests, changed employee identity, active sync leases, or existing conflicting links. A repeated completed merge is a no-op. Do not use TBS033 for future testing: it now belongs to the real employee.

No frontend deployment is required for this merge. The actual interactive LINE login on her devices was not performed; backend paths for both existing accounts were verified.
