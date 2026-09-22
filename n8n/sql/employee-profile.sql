WITH p AS (SELECT $1::jsonb AS body), updated AS (
  UPDATE tbs_employees SET
    tbs_id = COALESCE((p.body->>'empNo')::int, tbs_id),
    first_name = COALESCE(split_part(p.body->>'name', ' ', 1), first_name),
    last_name = CASE WHEN p.body->>'name' IS NULL THEN last_name
      WHEN strpos(p.body->>'name', ' ') = 0 THEN ''
      ELSE substr(p.body->>'name', strpos(p.body->>'name', ' ') + 1) END,
    nickname = COALESCE(p.body->>'nickname', nickname),
    department = COALESCE(p.body->>'department', department)
  FROM p WHERE user_id = p.body->>'userId' RETURNING user_id
)
SELECT EXISTS(SELECT 1 FROM updated) AS ok,
  CASE WHEN EXISTS(SELECT 1 FROM updated) THEN 200 ELSE 404 END AS "statusCode",
  CASE WHEN NOT EXISTS(SELECT 1 FROM updated) THEN 'Employee not found' END AS error;
