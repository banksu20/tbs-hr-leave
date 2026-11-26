BEGIN;
ALTER TABLE tbs_attendance_settings ALTER COLUMN work_minutes SET DEFAULT 480;
UPDATE tbs_attendance_settings SET work_minutes=480,updated_at=now() WHERE singleton AND work_minutes=420;
COMMIT;
