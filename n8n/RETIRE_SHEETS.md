# Retire database-to-Sheets exports

Apply SQL020 and disable/disconnect `Deliver saved HR changes` from `Claim sheet sync`, then publish. The queue function becomes a no-op; eight obsolete jobs are retained with retirement metadata, not marked delivered. Existing spreadsheet contents, LINE jobs, calendar sync and history are preserved. Reapplying older queue migrations requires reapplying SQL020 afterward.

Legacy registration/history/calendar reads still use Sheets; this change retires outbound database exports, not all Google Sheets dependencies.

`Resolve profile account` now returns the database department as profileDepartment, and `Respond Found` uses it before the legacy Sheets value. Dale (TBS038) is assigned AI Engineering in the database; the CEO filter labels it AI. No other employee was reassigned.
