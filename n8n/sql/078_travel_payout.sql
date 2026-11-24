BEGIN;
ALTER TABLE tbs_travel_settings ADD COLUMN IF NOT EXISTS payout_notify_user text;
ALTER TABLE tbs_travel_settings ADD COLUMN IF NOT EXISTS last_payout_month date;

CREATE OR REPLACE FUNCTION tbs_travel_payout(month date) RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH t AS (
  SELECT x.id,x.user_id,x.trip_date,x.status,tbs_trip_json(x,false) j FROM tbs_trips x
  WHERE x.trip_date>=month AND x.trip_date<(month+interval '1 month')::date AND x.status IN ('submitted','approved','paid','flagged')
 ),p AS (
  SELECT t.user_id,
   count(*) FILTER (WHERE t.status<>'flagged') trips,
   count(*) FILTER (WHERE t.status='flagged') flagged,
   COALESCE(sum((j->>'km')::numeric) FILTER (WHERE t.status<>'flagged'),0) km,
   COALESCE(sum((j->>'kmAmount')::numeric) FILTER (WHERE t.status<>'flagged'),0) km_amount,
   COALESCE(sum((j->>'receiptAmount')::numeric) FILTER (WHERE t.status<>'flagged'),0) receipt_amount,
   COALESCE(sum((j->>'total')::numeric) FILTER (WHERE t.status<>'flagged'),0) total,
   COALESCE(sum((j->>'total')::numeric) FILTER (WHERE t.status='paid'),0) paid,
   COALESCE(sum((j->>'total')::numeric) FILTER (WHERE t.status IN ('submitted','approved') AND (j->>'originalsWaiting')::int=0),0) ready,
   COALESCE(sum((j->>'total')::numeric) FILTER (WHERE t.status IN ('submitted','approved') AND (j->>'originalsWaiting')::int>0),0) held,
   COALESCE(sum((j->>'originalsWaiting')::int) FILTER (WHERE t.status<>'flagged'),0) paper,
   jsonb_agg(jsonb_build_object('id',t.id,'date',t.trip_date,'status',t.status,'clients',j->'clients','km',j->'km','kmAmount',j->'kmAmount',
    'receiptAmount',j->'receiptAmount','total',j->'total','originalsWaiting',j->'originalsWaiting') ORDER BY t.trip_date,t.id) lines
  FROM t GROUP BY t.user_id
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',p.user_id,
  'code',CASE WHEN e.employment_type='intern' THEN 'INT-'||lpad(COALESCE(e.intern_number,0)::text,3,'0') ELSE 'TBS-'||lpad(COALESCE(e.tbs_id,0)::text,3,'0') END,
  'name',concat_ws(' ',e.first_name,e.last_name),'nickname',e.nickname,'department',e.department,
  'trips',p.trips,'flagged',p.flagged,'km',p.km,'kmAmount',p.km_amount,'receiptAmount',p.receipt_amount,'total',p.total,
  'paid',p.paid,'ready',p.ready,'held',p.held,'paperMissing',p.paper,'lines',p.lines) ORDER BY e.department,e.first_name),'[]'::jsonb)
 FROM p JOIN tbs_employees e ON e.user_id=p.user_id;
$$;

CREATE OR REPLACE FUNCTION tbs_travel_payout_month(v text) RETURNS date LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN COALESCE(v,'')~'^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN (v||'-01')::date END;
$$;

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_payout(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_payout;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; b jsonb:=COALESCE(payload->'body','{}'::jsonb); m date; n integer; r jsonb; who text; BEGIN
 IF op NOT IN ('travel-payout','travel-payout-paid','travel-settings','travel-settings-save') THEN RETURN tbs_dashboard_auth_before_payout(payload); END IF;
 IF op IN ('travel-settings','travel-settings-save') THEN
  who:=NULLIF(btrim(COALESCE(b->>'payoutNotify','')),'');
  IF op='travel-settings-save' AND who IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=who AND user_id~'^U[0-9a-f]{32}$' AND COALESCE(status,'active')='active') THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose someone with LINE for the month-end reminder.');
  END IF;
  r:=tbs_dashboard_auth_before_payout(payload);
  IF (r->>'ok') IS DISTINCT FROM 'true' THEN RETURN r; END IF;
  IF op='travel-settings-save' AND b ? 'payoutNotify' THEN UPDATE tbs_travel_settings SET payout_notify_user=who WHERE singleton; END IF;
  RETURN jsonb_set(r,'{settings,payoutNotify}',COALESCE((SELECT to_jsonb(payout_notify_user) FROM tbs_travel_settings WHERE singleton),'null'::jsonb));
 END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 m:=tbs_travel_payout_month(b->>'month');
 IF m IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a month.'); END IF;
 n:=0;
 IF op='travel-payout-paid' THEN
  WITH done AS (
   UPDATE tbs_trips x SET status='paid',paid_at=now()
   WHERE x.trip_date>=m AND x.trip_date<(m+interval '1 month')::date AND x.status IN ('submitted','approved')
    AND (NULLIF(b->>'userId','') IS NULL OR x.user_id=b->>'userId')
    AND NOT EXISTS(SELECT 1 FROM tbs_trip_receipts r WHERE r.trip_id=x.id AND r.needs_original AND r.original_received_at IS NULL)
   RETURNING x.id
  ),audit AS (
   INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) SELECT actor.id,'travel-mark-paid',id::text FROM done RETURNING 1
  ) SELECT count(*) INTO n FROM audit;
 END IF;
 RETURN jsonb_build_object('ok',true,'month',to_char(m,'YYYY-MM'),'marked',n,'people',tbs_travel_payout(m));
END $$;

CREATE OR REPLACE FUNCTION tbs_travel_payout_reminder(ts timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE s tbs_travel_settings%ROWTYPE; today date:=(ts AT TIME ZONE 'Asia/Bangkok')::date; m date; p jsonb; ready numeric; held numeric; paper integer; people integer; flagged integer; base text; BEGIN
 m:=(date_trunc('month',today)-interval '1 month')::date;
 SELECT * INTO s FROM tbs_travel_settings WHERE singleton FOR UPDATE;
 IF s.payout_notify_user IS NULL OR s.payout_notify_user!~'^U[0-9a-f]{32}$' OR s.last_payout_month>=m OR (ts AT TIME ZONE 'Asia/Bangkok')::time<'07:00' THEN RETURN 0; END IF;
 UPDATE tbs_travel_settings SET last_payout_month=m WHERE singleton;
 p:=tbs_travel_payout(m);
 SELECT COALESCE(sum((x->>'ready')::numeric),0),COALESCE(sum((x->>'held')::numeric),0),COALESCE(sum((x->>'paperMissing')::int),0),
  count(*) FILTER (WHERE (x->>'ready')::numeric>0),COALESCE(sum((x->>'flagged')::int),0)
  INTO ready,held,paper,people,flagged FROM jsonb_array_elements(p) x;
 IF ready=0 AND held=0 AND flagged=0 THEN RETURN 0; END IF;
 SELECT app_url INTO base FROM tbs_email_fallback_settings WHERE singleton;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',s.payout_notify_user,jsonb_build_object('to',s.payout_notify_user,'messages',jsonb_build_array(jsonb_build_object('type','text',
  'text','Travel claim / เบิกค่าเดินทาง: สรุปเดือน '||to_char(m,'MM/YYYY')||E'\n'
   ||'พร้อมจ่าย / Ready to pay: '||ready||' THB ('||people||' คน / people)'||E'\n'
   ||'รอใบเสร็จตัวจริง / Waiting for paper: '||held||' THB ('||paper||' ใบ / receipts)'||E'\n'
   ||'รอตรวจ / Needs your check: '||flagged||E'\n'
   ||COALESCE(base,'https://tbs-hr-leave.vercel.app')||'/ceo?view=travel&tab=payout&month='||to_char(m,'YYYY-MM')))));
 RETURN 1;
END $$;

CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
BEGIN
 IF channel IN ('line','email') AND pg_try_advisory_xact_lock(hashtext('tbs_travel_daily')) THEN
  BEGIN
   PERFORM tbs_travel_daily();
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Travel daily run skipped: %',SQLERRM;
  END;
  BEGIN
   PERFORM tbs_travel_payout_reminder();
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Travel payout reminder skipped: %',SQLERRM;
  END;
 END IF;
 RETURN QUERY SELECT * FROM tbs_claim_line_batch_before_travel(channel);
END $$;
COMMIT;
