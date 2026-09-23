# Approved leave calendar sync

Workflow: [TBS HR — Google Calendar sync](https://n8n.womenrefugeeroute.org/workflow/NV1I1fI5NizJ9cWF).

Published 23 September 2026. Runs every five minutes in Asia/Bangkok; no Vercel deployment needed. The separate workflow reads PostgreSQL and never changes leave records or sends LINE/email messages.

## Rules

- Staff Leave calendar: `50cpt8b361qli1poevjsqrt5vo@group.calendar.google.com`.
- Fixed import cutoff: 2026-09-23. Only Approved leave is projected.
- One deterministic event per employee/date. Multiple requests that total at most one day combine; totals over one day are flagged for review.
- Existing manual events are preserved. A matching employee/date skips creation, including partial-day overlap. User confirmed Ruj = TBS-002. Unknown or ambiguous names conservatively block possible duplicates and appear in planner warnings.
- Only events marked `tbsHrSync=tbs-hr-approved-v1` can be updated/cancelled. Existing manual events do **not** follow later dashboard changes automatically.
- Change or cancel managed leave through the dashboard. Calendar-only edits can be overwritten on the next sync. Do not move managed events outside the listing window.
- Calendar titles show employee and leave duration; reasons and leave types are omitted. Half days are all-day entries labelled AM/PM when available, not guessed working hours.
- No attendees; sendUpdates=none; reminders disabled on managed events.
- ETags protect updates against intervening calendar changes; deterministic IDs prevent duplicate inserts on retries. A run can partially succeed; subsequent runs compare current state again.
- All calendar pages must load successfully before planning writes. Workflow timeout is 240 seconds.

## Source and validation

`scripts/patch-calendar-sync.mjs` exports node configurations and connections for updating this workflow through the n8n connector. It reads `n8n/sql/calendar-snapshot.sql` and embeds `n8n/js/calendar-projection.mjs`. It contains credential references, never credential secrets.

Run `node --test tests/calendar-sync.test.mjs` (9 tests passed).

Live evidence on 23 September 2026:

- Execution 591919: isolated calendar create/edit/cancel/restore/cancel test passed; test event cancelled, test workflow archived. No real leave records changed.
- Execution 591950: added Nam's 1 December leave; skipped 9 employee-days covered by existing events; zero warnings.
- Execution 591955: zero further operations; all pre-existing event ETags unchanged.
- Published version: 6fc85a20-027d-4468-9885-805c4ddde706.

## Outstanding OAuth setup

Google Cloud project `geo-n8n-498507` currently has External / Testing OAuth status. The Publish app button is disabled pending Branding configuration. Calendar access works now, but testing refresh tokens expire after seven days. Complete Branding, switch the OAuth app to production, then reconnect the n8n Google Calendar credential. Publishing the n8n workflow does not change Google's OAuth status.

Reference: https://developers.google.com/identity/protocols/oauth2#expiration
