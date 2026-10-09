BEGIN;
-- User-approved source: https://www.officeholidays.com/countries/thailand/2026
-- National Holiday entries only. Regional, government-only and observances excluded.
-- Seed once; preserve later HR edits when migrations are reapplied.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_calendar_years WHERE year=2026) THEN
 INSERT INTO tbs_work_calendar(day,working,note,local_name) VALUES
 ('2026-01-01',false,'New Year''s Day','วันขึ้นปีใหม่'),
 ('2026-01-02',false,'New Year''s Day Holiday','วันหยุดพิเศษช่วงปีใหม่'),
 ('2026-03-03',false,'Makha Bucha Day','วันมาฆบูชา'),
 ('2026-04-06',false,'Chakri Day','วันจักรี'),
 ('2026-04-13',false,'Songkran','วันสงกรานต์'),
 ('2026-04-14',false,'Songkran','วันสงกรานต์'),
 ('2026-04-15',false,'Songkran','วันสงกรานต์'),
 ('2026-05-01',false,'Labour Day','วันแรงงานแห่งชาติ'),
 ('2026-05-04',false,'Coronation Day','วันฉัตรมงคล'),
 ('2026-05-31',false,'Visakha Bucha Day','วันวิสาขบูชา'),
 ('2026-06-01',false,'Visakha Bucha Day (substitute)','วันหยุดชดเชยวันวิสาขบูชา'),
 ('2026-06-03',false,'H.M. Queen''s Birthday','วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
 ('2026-07-28',false,'H.M. King''s Birthday','วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
 ('2026-07-29',false,'Asahna Bucha Day','วันอาสาฬหบูชา'),
 ('2026-08-12',false,'H.M. Queen Mother''s Birthday','วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง'),
 ('2026-10-13',false,'King Bhumibol Memorial Day','วันนวมินทรมหาราช'),
 ('2026-10-23',false,'Chulalongkorn Day','วันปิยมหาราช'),
 ('2026-12-07',false,'King Bhumibol''s Birthday (substitute)','วันหยุดชดเชยวันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9'),
 ('2026-12-10',false,'Constitution Day','วันรัฐธรรมนูญ'),
 ('2026-12-31',false,'New Year''s Eve','วันสิ้นปี')
 ON CONFLICT(day) DO UPDATE SET working=excluded.working,note=excluded.note,local_name=excluded.local_name;
 INSERT INTO tbs_calendar_years(year) VALUES(2026);
 END IF;
END $$;
COMMIT;
