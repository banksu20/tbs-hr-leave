# Sick leave reminders (prepared, not enabled in production)

Apply `016_sick_notifications.sql`, then `017_paid_sick_rollover.sql` and `018_sick_acknowledgements.sql` through the existing n8n PostgreSQL maintenance node. These migrations are additive; installing 016 does not send reminders. Migration 017 updates rollover previews to the agreed 30-day paid policy from 2026 onward.

Run `patchSickNotifications()` from `scripts/patch-sick-notifications.mjs` against a fresh workflow export, review the diff, apply and publish the added clock/database branch. It reuses the existing PostgreSQL credential and LINE delivery queue. The minute clock is timezone-independent: SQL checks Bangkok time, queues once after 08:30, and catches up later that day after downtime. Approval/edit triggers also check immediately.

Before activation, review current totals with:

```sql
SELECT tbs_id, concat_ws(' ',first_name,last_name) AS name,
 tbs_sick_used(user_id,(now() AT TIME ZONE 'Asia/Bangkok')::date) AS sick_used
FROM tbs_employees
WHERE COALESCE(status,'active')='active'
 AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=tbs_employees.user_id)
ORDER BY tbs_id;
```

Then run `SELECT tbs_activate_sick_notifications();` through n8n PostgreSQL. This queues one card for the highest current-year threshold reached per employee/audience (13 sick days → employee 10-day card and CEO 10-day card), records lower thresholds without separate messages, enables future checks, and sets canonical employee quotas for 2026 onward to 30 paid sick days. Existing history/audit and Sheets projection triggers run for quota changes. Earlier-year quotas remain unchanged. A database trigger maintains 30 on subsequent quota writes. No leave is automatically rejected at 30.

Deploy the app/API after the database and workflow. Quota editing/rollover show 30 as fixed, and employee cards follow the last successfully saved app language (English fallback). The employee dashboard and leave form sync this preference using verified LINE identity. CEO cards always remain English. Both linked accounts share one preference and milestone history; reminders go to the canonical primary LINE account. CEO reminder copy is always English and uses the existing configured CEO account, independently of cancellation-notification enablement.

Recipients: employees at 5, 10, 20, 25, 30; CEO at 10 and 30. Count only approved dates in the calendar year through the as-of date, dividing stored request duration across its selected dates. Fractions are preserved. A jump across several milestones creates one card per audience using the highest new milestone and actual total. All crossed milestones are recorded transactionally. A new threshold queues one initial card per audience, then an unacknowledged alert repeats once each day at 08:30 Bangkok time. A confirmed successful delivery also prevents another daily reminder for that alert on the same Bangkok date. There is no same-day repeat and no new daily copy while an earlier copy is still pending or blocked. The existing worker retries the same job ID. A higher threshold replaces the previous alert for that audience and year; old buttons cannot dismiss it. Employee and CEO acknowledgements are independent. Outstanding reminders continue across year-end with their original year until acknowledged. A correction below the threshold suspends the alert; restoring the total resumes it unless it was acknowledged.

## Validation and boundaries

- Local PGlite tests cover SQL migrations, routing, fractional crossings, highest-only activation, future/pending exclusion, year split, aliases, language, paid quota enforcement, retry identity, and Bangkok clock.
- Browser preview uses actual SQL formatter JSON: `/scripts/previews/sick-notifications.html`. It has no API calls or message-send buttons. Regenerate with `node scripts/previews/generate-sick-fixtures.mjs`.
- This is not a payroll engine: the 30-day balance assumes approved sick days count against the paid allowance. Per-request paid/unpaid classifications are not currently stored.
- Before the first delivery attempt, unsent cards refresh their total/language and corrected totals below the threshold suppress the alert. Retried payloads retain their original body for LINE idempotency. Already-delivered cards cannot be recalled.
- Each card has an Acknowledge button opening `/sick-acknowledge` through LIFF. Viewing the link does not save anything: the recipient confirms on the page. The API verifies LINE identity and the current alert token. Linked employee accounts can acknowledge the same employee alert; only the configured recipient of a CEO alert can acknowledge it. Repeated clicks are idempotent.
- An acknowledgement stops unclaimed reminder jobs; a message already in flight can still arrive. Acknowledgement records a button press, not proof of comprehension.
- Delivery is not proof of reading. A blocked LINE account, quota exhaustion, expired credential or blocked older recipient job can delay/prevent receipt. Existing delivery status exposes pending/failing jobs.
- Real LINE rendering, acceptance and delivery still need a controlled live check. No test messages are sent by these scripts.
- HR review flags and access control are out of scope.

Apply 018 after 015; it updates the delivery claim and completion functions with sick-alert validation and successful-delivery tracking. Reapplying older delivery migrations later requires reapplying 018 last. New API: `/api/sick-acknowledgements`; workflow operation routing supports `sick-review` and `sick-acknowledge`. No production notifications or settings are changed by the local preview.

Turning the sick notification setting off pauses queued sick cards without blocking unrelated LINE results. Outstanding CEO cards follow the current configured recipient; switching accounts revokes old links. Already in-flight messages remain outside the database’s control. Language saves retry with a timeout and show a small toast after repeated failure; stale retries cannot overwrite a newer preference timestamp. The acknowledgement route bypasses the legacy employee-profile lookup, uses the current app language for employees, and always uses English for the CEO.

## Isolated live delivery checks

`tbs_sick_delivery_tests` holds explicit, recipient-bound sample totals for one-off live checks. Its records expire after 24 hours, use the production Flex formatter and authenticated acknowledgement endpoint, and are never read by the recurring scheduler. Creating a fixture requires database access; there is no public creation API. Employee and CEO-shaped cards both authenticate the fixture recipient, never the configured CEO. They do not change leave, quotas, milestones, or production acknowledgement state. Keep company-wide `enabled=false` while testing. The acknowledgement page identifies the isolated test; a real LINE click is still required to verify the full device flow.
