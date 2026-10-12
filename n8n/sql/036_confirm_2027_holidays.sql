BEGIN;
-- User-approved source: https://www.officeholidays.com/countries/thailand/2027
-- National Holiday entries only. Regional, government-only and observances excluded.
-- Seed once; preserve later HR edits when migrations are reapplied.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_calendar_years WHERE year=2027) THEN
 INSERT INTO tbs_work_calendar(day,working,note,local_name) VALUES
 ('2027-01-01',false,'New Year''s Day','วันขึ้นปีใหม่'),
 ('2027-02-21',false,'Makha Bucha','วันมาฆบูชา'),
 ('2027-02-22',false,'Makha Bucha (in lieu)','วันหยุดชดเชยวันมาฆบูชา'),
 ('2027-04-06',false,'Chakri Day','วันจักรี'),
 ('2027-04-13',false,'Songkran','วันสงกรานต์'),
 ('2027-04-14',false,'Songkran','วันสงกรานต์'),
 ('2027-04-15',false,'Songkran','วันสงกรานต์'),
 ('2027-05-01',false,'Labour Day','วันแรงงานแห่งชาติ'),
 ('2027-05-03',false,'Labour Day (in lieu)','วันหยุดชดเชยวันแรงงานแห่งชาติ'),
 ('2027-05-04',false,'Coronation Day','วันฉัตรมงคล'),
 ('2027-05-20',false,'Visakha Bucha Day','วันวิสาขบูชา'),
 ('2027-06-03',false,'H.M. Queen''s Birthday','วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
 ('2027-07-19',false,'Asahna Bucha Day','วันอาสาฬหบูชา'),
 ('2027-07-28',false,'H.M. King''s Birthday','วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
 ('2027-08-12',false,'H.M. Queen Mother''s Birthday','วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง'),
 ('2027-10-13',false,'The Passing of King Bhumibol','วันนวมินทรมหาราช'),
 ('2027-10-25',false,'Chulalongkorn Day','วันหยุดชดเชยวันปิยมหาราช'),
 ('2027-12-06',false,'King Bhumibol''s Birthday','วันหยุดชดเชยวันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9'),
 ('2027-12-10',false,'Thailand Constitution Day','วันรัฐธรรมนูญ'),
 ('2027-12-31',false,'New Year''s Eve','วันสิ้นปี')
 ON CONFLICT(day) DO UPDATE SET working=excluded.working,note=excluded.note,local_name=excluded.local_name;
 INSERT INTO tbs_calendar_years(year) VALUES(2027);
 END IF;
END $$;
COMMIT;
