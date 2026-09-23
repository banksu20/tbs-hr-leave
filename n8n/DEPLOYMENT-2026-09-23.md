# Deployment and verification — 23 September 2026

## Applied

- The live app serves the build from commit `75ad0a9`.
- Migrations 001–007 were applied through the n8n PostgreSQL maintenance node. Existing leave was not reseeded.
- Main workflow `pcJFDAUvfT2LYIwT` published version `3c55bdee-1e3e-4597-8360-f8a984fc8455`: shared revision/token decision guards, database-first submission, durable Sheets/LINE delivery, and verified sheet destinations.
- 33 employee/year links are stored. TBS030 was not used for testing or linked. TBS033 has an isolated `TEST TBS033 - Leave 2026` tab; it never targets the real Alice section.
- User chose database values as final for legacy discrepancies. The reconciliation policy is recorded for TBS001, 007, 009, 016, 021 and 028.
- CEO login remains disabled per the user's instruction.

## Verified

- 43 automated tests pass.
- Nine assertions against the production database passed inside a rolled-back transaction: both decision directions, first decision wins, stale edits/buttons, rejection reason, history, and queued delivery.
- Live app API: TBS033 request 1059 created, approved, stale edit refused with 409, then cancelled with current revision.
- Live LINE rejection endpoint: an old decision against 1059 was refused. Request 1061 was edited from 30 to 31 December; its old revision was refused, its current rejection succeeded, and its reason appeared in history.
- Replay of an old Approve postback through the published workflow refused the decision and sent the refusal response. This is a replay test, not a human LINE click.
- Isolated Sheets writes and LINE notification requests returned HTTP 200 and were acknowledged in the delivery queue. Notification API acceptance does not prove human receipt.
- Completed tests 1059 and 1061 are Rejected and no longer consume quota. Audit history is intentionally retained.

## Still pending

1. n8n refused the final `Claim sheet sync` and `Project current sheet` updates because a user is editing the main workflow. Those two updates add the `databaseAuthoritative` reconciliation policy. Close the editor, re-read the draft for concurrent changes, apply the local versions, then publish. Do not assume the current active version already honors that policy.
2. After publishing, enqueue the verified real employee sections for reconciliation (exclude TBS030), run the worker, inspect acknowledgements and verify Sheet results. All 32 real-account projections passed the read-only preflight with the approved policy. No real legacy section has yet been overwritten by this reconciliation.
3. Request 1060 is Pending for the actual LINE button test. A card labelled `TEST TBS033 — APPROVE THIS` was sent only to TBS033 and accepted by LINE. User was asked to click it. Verify the callback, dashboard, Sheet, notification and second-click refusal, then cancel the test request and verify cleanup. Normal configured manager FYIs may run on the successful click.

The maintenance workflow `Ln3BwcSN2e2GHZWa` was returned to two nodes with a read-only readiness query. No migration or message-send query remains armed there. Additional code changes in this work are uncommitted.
