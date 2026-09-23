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

## Final follow-up after commit a720f25

- Final reconciliation nodes were validated and published as `a0df23cd-08d2-4016-9cc5-b3ec6382f130` after the editor was closed. Concurrent editor changes were only JSON property ordering in HTTP response options.
- All 32 verified real employee sections reconciled. Together with the isolated test tab, the queue reports 33 completed Sheet jobs, zero pending jobs and zero problem jobs (execution 590275).
- Read-back verification succeeded (590276): Bill's 4 August row is 0.5 day as recorded in the database; the real Alice section is identical to its pre-change snapshot; the TBS033 test tab has no leave rows, zero days taken and its full 3 personal days remaining.
- The user cannot access the CEO LINE account to click request 1060. It was cancelled through the live dashboard API with its current revision (HTTP 200). All test requests are now Rejected; history is retained.
- A real human LINE approval remains unverified. Do not describe the replay/database tests as a human click. The issued test buttons now refer to cancelled requests and should be refused.
- The maintenance workflow has been restored to two nodes with a read-only readiness query. No migration, queue insertion or notification query remains armed there.

No further Vercel deployment was required for these n8n updates. This operational note was updated after commit a720f25.

## Editable rollover follow-up (database applied; app deployment still needs verification)

- Rollover now loads source-year allowances into an editable employee table: base annual, sick (including unlimited), personal, unused annual/carryover, expiry and note. There is no shared carryover cap.
- The displayed source annual total includes old carryover. The next-year base is source total minus old carryover (`annual_total` is already that base in storage). New carryover is stored separately and the UI displays the combined annual allowance.
- Apply recomputes the reviewed snapshot under database locks and rejects stale previews. Existing target-year quota rows are skipped, source-year rows remain unchanged, and quota history / Sheets outbox triggers remain active.
- Before deploying the updated app, apply the revised `sql/003_year_rollover.sql` through the n8n maintenance PostgreSQL node. The existing `dashboard-rollover` webhook query supports the response shape; no new endpoint is needed. The follow-up migration was applied through the maintenance PostgreSQL node in execution 590532. No real employee rollover has been run.
- New-year Sheets exports still require verified employee links and the corresponding new-year Sheet destination. Do not claim successful Sheets synchronization until those exist and delivery is verified.

- Live database verification passed in execution 590538 using only TBS033 and temporary source/target years 2098/2099. Checked edited quota values, separate carryover, source preservation, stale-token rejection and repeated-apply protection. All test writes, history and queued updates were rolled back; temporary quotas are absent. This verifies the live database function, not the deployed browser-to-API flow.
- The maintenance node was restored to its original read-only readiness query after verification.
