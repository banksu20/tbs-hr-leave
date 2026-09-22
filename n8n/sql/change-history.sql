-- Keyset pagination; the cursor is the last event id returned.
SELECT COALESCE(jsonb_agg(to_jsonb(events) ORDER BY events.id::bigint DESC),'[]'::jsonb) AS events
FROM (
  SELECT h.id::text, h.changed_at AS "changedAt", h.entity, h.record_id AS "recordId", h.user_id AS "userId",
    concat_ws(' ',e.first_name,e.last_name) AS "employeeName", e.department,
    h.action, h.actor, h.before_value AS "before", h.after_value AS "after",
    (h.action='cancel' AND h.after_value=to_jsonb(r) AND e.status='active'
      AND NOT EXISTS(SELECT 1 FROM tbs_change_history newer WHERE newer.entity=h.entity AND newer.record_id=h.record_id AND newer.id>h.id)) AS "canRestore"
  FROM tbs_change_history h
  LEFT JOIN tbs_employees e ON e.user_id=h.user_id
  LEFT JOIN leave_requests r ON h.entity='leave_requests' AND r.id::text=h.record_id
  WHERE ($1::text IS NULL OR h.user_id=$1) AND ($2::bigint IS NULL OR h.id<$2::bigint)
  ORDER BY h.id DESC LIMIT 50
) events;
