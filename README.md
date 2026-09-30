

### Employee cancellation approvals

Employees open **Cancel leave / ยกเลิกวันลา** in their LINE employee dashboard and choose the dates. Pending leave cancels immediately. Approved leave (including today and past dates) creates a separate cancellation request: the original leave, quota usage and Calendar projection do not change while it is pending.

The boss reviews these in **CEO → More → Pending requests → Cancellation requests**. Approving removes only the selected dates; rejecting preserves the leave. Changes to the underlying request expire an outstanding cancellation rather than applying a decision to different details. Decisions and submissions are recorded in change history. Existing Sheet/Calendar workers see changes only after actual cancellation. Calendar edits follow the existing managed-event rules; manually created events are not removed.

Employee requests use server-verified LINE access tokens (channel `2008617589`), resolve linked accounts, and never trust a browser-supplied employee ID. Boss decisions use the dashboard's existing access policy; this feature does not add CEO login. Cancellation decisions are made in the dashboard; existing LINE leave-approval buttons do not decide cancellation requests.

Backend installation: apply `n8n/sql/011_employee_cancellation.sql` through an n8n PostgreSQL node, then apply `scripts/patch-employee-cancellations.mjs` to the current workflow and publish. It reuses the authenticated dashboard webhook credential and database credential. Deploy the Vercel app for `/api/cancellations` and the new controls. No new environment variable is needed. Do not expose the n8n shared secret to the browser.

Verified 30 September 2026: migration applied via maintenance execution `626037`; isolated transaction test `626042` verified request/reject/partial approval/repeated-decision refusal and rolled back all fixture records. Workflow published as `dbfc123a-9240-480b-883c-d8f6f464ea44`. Actual employee LINE sign-in and boss clicks still need checking after the app is deployed.
