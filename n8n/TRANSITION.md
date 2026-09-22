# Dashboard-first transition

## Agreed operating model

The boss manages leave decisions, employee details and allowances in `/ceo`. Overview, Roster and Sheet read the same PostgreSQL records through n8n. CSV/PDF downloads are reporting snapshots. Archive the last manual Excel ledger after comparing employee starting balances; do not import it repeatedly or keep editing it as a second master.

Keep the existing Google Sheets connections and employee/LINE flows connected during this phase. Do not delete spreadsheets, revoke credentials or disable legacy nodes as part of the dashboard feature patch. The boss must be able to approve through either LINE or the dashboard. Apply the shared database decision guard before declaring both paths protected: the first decision wins, and later conflicting or repeated actions must stop before legacy sheet writes or success notifications.

Dashboard approval/rejection does not currently synchronize old sheets or send decision notifications. Employee-facing legacy sheet values may therefore lag the dashboard. This must be resolved before declaring the whole system database-only.

## Remaining dependencies

The reviewed TBS HR workflow includes these legacy paths. Reinspect the current workflow before implementing changes, as the live graph may change.

| Process | Existing nodes | Database replacement and required check |
| --- | --- | --- |
| Registration | Find in Users Sheet; Add to Users Sheet; Add user to DB | Use stable LINE user ID in the employee table; verify existing/new users, duplicate submissions and inactive employees. |
| Leave submission | Read CEO Sheet; Calculate Math & Grid; Batch Update CEO Sheet; Save to DB | Save a validated request directly, preserving dates, half-day period, reason and pending status; remove dependency on sheet row coordinates. Verify full days, half days, multi-date and cross-year requests, overlap rejection and retries. |
| Approver routing | Get CM; Find Final Approver | Preserve the intended approver routing without relying on a spreadsheet response to continue. Test without delivering real notifications. |
| LINE approval/rejection | Check Current Status; Update Status to Approved; Clear Leave Data; Get Status Before Reject | Use database request IDs and guarded pending-state transitions. Old messages must not reverse a dashboard decision or create a second decision. Test both dashboard-first and LINE-first orderings. |
| Quota updates | Get Current Quota; Update New Quota | Calculate balances from database requests and allowances; do not copy stale sheet totals back. Check that rejecting/cancelling releases reserved leave once only. |
| Employee history | Find Name from UserID (History); Read CEO Sheet (History); Merge Sheet & DB History | Return database history with the existing response contract. Reconcile sheet-only historical records before removing the fallback. Match by stable employee identity, not nickname. |
| Employee calendar | Read Users Sheet (Cal); Read CEO Sheet (Cal); Format Calendar Data | Produce the existing calendar response from database records, preserving department/month/status filtering and separate employees with similar names. |

## Migration sequence

1. Back up the latest workflow and database; retain an archive of legacy sheets. Read/reconcile any sheet-only historical leave and employee records before removing sheet reads. Record unmatched rows for review rather than guessing identities.
2. Prepare the replacement branches in an isolated draft with test data. Keep all real notification delivery disabled in the test copy. Preserve the live workflow until the replacement passes.
3. Test registration, submission, decisions, balances, history and calendar using the cases above. Verify response contracts used by the employee site and LINE; passing CEO-dashboard tests alone is insufficient.
4. Compare the same test employee and dates through both the employee-facing and CEO-facing views. Test stale old LINE buttons after a dashboard decision, duplicate deliveries, rejected requests and failure recovery.
5. After passing, switch the reviewed branches together. Database writes must be authoritative before any notification is delivered. Verify an authorized test employee end to end, cancel the temporary requests and confirm the original balances.
6. Retire sheet reads/writes only after verification. Keep the archived spreadsheets and previous workflow for rollback; do not restore stale sheet balances over decisions made after the switch.

## Current status

- CEO dashboard already reads/writes the database.
- Dashboard-first guidance is added locally.
- Existing live Google Sheets connections are unchanged.
- A shared LINE/database decision guard is prepared locally in migration 004 and `patch-line-decisions.mjs`. It is not published. Full legacy database replacement, historical reconciliation and end-to-end migration tests are outstanding.
- This document does not start a scheduled migration or authorize sending test notifications.

## Enable shared LINE/dashboard decisions

Back up the current workflow and database. Apply the updated 002 migration, then 004, through an n8n PostgreSQL node. Generate the feature patch first, then run `node scripts/patch-line-decisions.mjs FEATURES.json COMBINED.json` on the private export. Review the combined inactive draft before publication. Keep the original export outside git for rollback.

The LINE patch routes the decision through PostgreSQL before sheet updates or success notifications. It retains legacy Sheets integrations and notification content, but bypasses sheet-based decision checks. A rejection records its reason separately from the original request reason. History identifies the channel as LINE without claiming the actor is an authenticated individual.

Local tests cover both orderings: LINE first then dashboard, and dashboard first then LINE. No real notifications are sent by these tests. The existing LINE webhook authentication and approver permissions are unchanged. Legacy messages without a valid database request ID and matching employee ID fail closed.

Publication and a real LINE click test are still required. Use a temporary request for the authorized test employee; check that one decision succeeds, the second is blocked, history records one decision, and the dashboard refresh agrees. Keep notification recipient selection explicit. A sheet or notification failure after the database decision does not undo that decision; repair delivery separately rather than repeating the approval. Dashboard-originated decisions still do not send LINE notifications or synchronize the old spreadsheet.
