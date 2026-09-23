-- Explicit per-year employee links. Never resolve an ambiguous nickname at write time.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_sheet_employee_links (
 user_id text NOT NULL REFERENCES tbs_employees(user_id),
 year integer NOT NULL,
 sheet_name text,
 database_authoritative boolean NOT NULL DEFAULT false,
 header text NOT NULL CHECK (length(trim(header)) > 5),
 evidence text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,year), UNIQUE(year,header)
);
ALTER TABLE tbs_sheet_employee_links ADD COLUMN IF NOT EXISTS sheet_name text;
ALTER TABLE tbs_sheet_employee_links ADD COLUMN IF NOT EXISTS database_authoritative boolean NOT NULL DEFAULT false;
COMMIT;
