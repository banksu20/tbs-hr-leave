import OverQuotaNotice from './OverQuotaNotice';
import {employeeData} from "@/lib/employeeData";
import EmployeeCancellations from "./EmployeeCancellations";
import { useState, useEffect, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import liff from "@line/liff";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer, Palmtree, CalendarDays, Users, Plus, ChevronRight, ShieldCheck, GraduationCap, FileCheck2, Car, Clock3 } from "lucide-react";
import { fetchSops } from "@/lib/sop";
import { loadTravel, money, monthSummary } from "@/lib/travel";
import { clock, loadAttendance } from "@/lib/attendance";
import HolidaysModal from "./HolidaysModal";
import { useLeaveQuota } from "@/hooks/useLeaveQuota";
import tbsLogo from "@/image/TBS-Logo.png";
import { useLanguage } from "@/hooks/useLanguage";
import TeamCalendar from "./TeamCalendar";
import { loadTeamMonth, savedTeamMonth, teamDepartments } from "@/lib/teamCalendar";
import { loadCompanyHolidays, savedCompanyHolidays, type CompanyHoliday } from "@/lib/companyHolidays";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";

const LIFF_ID = "2008617589-89gR1Y3Y";

type KnownProfile = { userId: string; displayName: string; pictureUrl?: string };
type KnownRegistration = { name: string; department: string };
type Tone = { card: string; label: string; badge: string; track: string; stroke: string };

const tones: Record<'sick' | 'vacation' | 'personal', Tone> = {
  sick: { card: 'from-rose-50 border-rose-100 hover:border-rose-200', label: 'text-rose-600', badge: 'bg-rose-500', track: '#ffe4e6', stroke: '#f43f5e' },
  vacation: { card: 'from-sky-50 border-sky-100 hover:border-sky-200', label: 'text-sky-600', badge: 'bg-sky-500', track: '#e0f2fe', stroke: '#0ea5e9' },
  personal: { card: 'from-amber-50 border-amber-100 hover:border-amber-200', label: 'text-amber-600', badge: 'bg-amber-500', track: '#fef3c7', stroke: '#f59e0b' },
};
const RING = 2 * Math.PI * 30;

const bangkokNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

function splitName(registered: string | null) {
  const parts = (registered || "").split('|').map(p => p.trim().replace(/[()]/g, "")).filter(Boolean);
  if (parts.length >= 3) return { full: `${parts[0]} ${parts[1]}`, nick: parts[2] };
  if (parts.length === 2) return { full: parts[0], nick: parts[1] };
  return { full: parts[0] || "", nick: parts[0] || "" };
}

function BalanceCard({ label, Icon, tone, loading, configured, unlimited, remaining, total, th, onClick }: {
  label: string; Icon: ComponentType<{ className?: string }>; tone: Tone; loading: boolean; configured: boolean; unlimited: boolean;
  remaining: number | null | undefined; total: number | null | undefined; th: boolean; onClick: () => void;
}) {
  const known = configured && !unlimited && remaining !== null && remaining !== undefined && total !== null && total !== undefined && total > 0;
  const left = known ? Math.max(Number(remaining), 0) : 0;
  const used = known ? Math.max(Number(total) - Number(remaining), 0) : 0;
  const empty = known && left <= 0;
  const share = known ? Math.min(1, left / Number(total)) : unlimited ? 1 : 0;
  const blank = ' ';
  return (
    <button type="button" onClick={onClick} className={`group relative flex flex-col items-center rounded-2xl border bg-linear-to-b/srgb to-white px-2 pt-3 pb-3.5 text-center shadow-xs transition active:scale-[0.97] hover:shadow-sm ${tone.card}`}>
      <span className={`flex items-center gap-1 text-xs font-bold ${tone.label}`}><Icon className="h-3.5 w-3.5" />{label}</span>
      <span className="relative mt-2 grid h-[76px] w-[76px] place-items-center">
        <svg viewBox="0 0 72 72" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="36" cy="36" r="30" fill="none" stroke={tone.track} strokeWidth="7" />
          {!loading && share > 0 && <circle cx="36" cy="36" r="30" fill="none" stroke={tone.stroke} strokeWidth="7" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - share)} className="transition-[stroke-dashoffset] duration-700" />}
        </svg>
        {loading ? <Skeleton className="h-6 w-8" /> : (
          <span className="relative flex flex-col items-center leading-none">
            <span className={`text-2xl font-extrabold ${empty ? 'text-rose-500' : 'text-slate-900'}`}>{!configured ? '—' : unlimited ? '∞' : known ? left : '—'}</span>
            {known && <span className="mt-0.5 text-[10px] font-medium text-slate-400">{th ? 'วัน' : left === 1 ? 'day' : 'days'}</span>}
          </span>
        )}
      </span>
      <span className={`mt-2 text-[10px] font-medium leading-tight ${empty ? 'text-rose-500' : 'text-slate-500'}`}>
        {loading ? blank : !configured ? (th ? 'ยังไม่กำหนด' : 'Not set') : unlimited ? (th ? 'ไม่จำกัด' : 'No limit') : known ? (empty ? (th ? 'ใช้ครบแล้ว' : 'All used') : (th ? `ใช้ไป ${used} จาก ${total}` : `${used} of ${total} used`)) : blank}
      </span>
      <span className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow-xs ${tone.badge}`}><Plus className="h-3 w-3" strokeWidth={3} />{th ? 'ขอลา' : 'Request'}</span>
      <OverQuotaNotice remaining={remaining} configured={configured} unlimited={unlimited} loading={loading} language={th ? 'th' : 'en'} />
    </button>
  );
}

const Dashboard = ({ employeePreview = false, profile, registration }: { employeePreview?: boolean; profile?: KnownProfile | null; registration?: KnownRegistration | null } = {}) => {
  const navigate = useNavigate();
  const [openOnLoad] = useState(() => new URLSearchParams(window.location.search).get("open"));
  const [showHolidaysModal, setShowHolidaysModal] = useState(openOnLoad === "holidays");
  const [showTeamCalendar, setShowTeamCalendar] = useState(openOnLoad === "team");
  const [userId, setUserId] = useState<string | null>(profile?.userId ?? null);
  const [userName, setUserName] = useState<string>(profile?.displayName ?? "");
  const [pictureUrl, setPictureUrl] = useState<string | undefined>(profile?.pictureUrl);
  const [pictureFailed, setPictureFailed] = useState(false);
  const [registeredName, setRegisteredName] = useState<string | null>(registration?.name ?? null);
  const [userDept, setUserDept] = useState<string>(registration?.department ?? "");
  const now = bangkokNow();
  const year = Number(now.date.slice(0, 4));
  const [holidays, setHolidays] = useState<CompanyHoliday[] | null>(() => savedCompanyHolidays(year));
  const [offToday, setOffToday] = useState<number | null>(null);
  const [isIntern, setIsIntern] = useState(false);
  const [sopPending, setSopPending] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<{ open: string | null; workToday: boolean } | null>(null);
  const [travel, setTravel] = useState<{ open: boolean; configured: boolean; client: string; total: number; trips: number; paper: number } | null>(null);

  const { t, language } = useLanguage();
  const th = language === 'th';

  const { policyConfigured, unlimitedLeave, remainingDays, sickRemaining, annualTotal, sickTotal, personalRemaining, personalTotal, isLoading: isQuotaLoading, refetch: refreshQuota } = useLeaveQuota(userId);

  const Boom_userId = "Uc229f2377a2b8839adab478d92c0c26f";
  const cleanDept = userDept?.trim();
  const isTechTeam = cleanDept === "Web Developer" || cleanDept === "UX/UI Designer";
  const isCreativeTeam = userId === Boom_userId && (cleanDept === "Graphic" || cleanDept === "Content");
  const displayDeptName = isTechTeam ? "DEV & UX/UI" : isCreativeTeam ? "Graphic & Content" : cleanDept;
  const isCeo = !employeePreview && (userId === (import.meta.env.VITE_CEO_USER_ID || "Uc229f2377a2b8839adab478d92c0c26f") || import.meta.env.DEV);

  const { full: fullName, nick } = splitName(registeredName);
  const firstName = nick || userName || (th ? 'คุณ' : 'there');
  const greeting = now.hour < 12 ? (th ? 'สวัสดีตอนเช้า' : 'Good morning') : now.hour < 17 ? (th ? 'สวัสดีตอนบ่าย' : 'Good afternoon') : (th ? 'สวัสดีตอนเย็น' : 'Good evening');
  const initials = (firstName || '?').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (employeePreview || !liff.getAccessToken()) return;
    let active = true;
    fetchSops().then(docs => { if (active) setSopPending(docs.filter(d => !d.acceptedAt).length); }).catch(() => undefined);
    loadAttendance().then(a => { if (active) setAttendance(a.eligible ? { open: a.open?.in ?? null, workToday: a.workToday } : null); }).catch(() => undefined);
    loadTravel().then(t => { if (active) setTravel(t.eligible ? { open: !!t.trip, configured: t.configured, client: t.trip?.stops.at(-1)?.clientName ?? '', ...monthSummary(t.recent) } : null); }).catch(() => undefined);
    return () => { active = false; };
  }, [employeePreview]);

  useEffect(() => { if (profile?.pictureUrl) { setPictureUrl(profile.pictureUrl); setPictureFailed(false); } }, [profile?.pictureUrl]);

  useEffect(() => {
    if (!userId) return;
    const key = `tbs_is_intern_${userId}`;
    try { if (localStorage.getItem(key) === '1') setIsIntern(true); } catch { void 0; }
    let active = true;
    const token = employeePreview ? 'preview' : liff.getAccessToken();
    if (!token) return;
    fetch('/api/leave-policy', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'sick', dates: [], daysPerDate: 1 }) })
      .then(r => r.ok ? r.json() : null)
      .then(result => {
        if (!active || !result?.ok) return;
        const intern = result.isIntern === true;
        setIsIntern(intern);
        try { if (intern) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { void 0; }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [userId, employeePreview]);

  useEffect(() => {
    let active = true;
    loadCompanyHolidays(year).then(list => { if (active) setHolidays(list); }).catch(() => undefined);
    return () => { active = false; };
  }, [year]);

  useEffect(() => {
    if (!userDept || !userId) return;
    const departments = teamDepartments(userDept, userId);
    if (!departments.length) return;
    const today = bangkokNow().date;
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1;
    let active = true;
    const count = (data: Record<string, unknown[]>) => { if (active) setOffToday(Array.isArray(data[today]) ? data[today].length : 0); };
    const saved = savedTeamMonth(departments, y, m);
    if (saved) count(saved);
    const timer = window.setTimeout(() => { loadTeamMonth(departments, y, m).then(count).catch(() => undefined); }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [userDept, userId]);

  useEffect(() => {
    if (profile && registration) return;
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if(!liff.isLoggedIn()){
          liff.login();
          return;
        }
        const lineProfile = await liff.getProfile();
        setUserId(lineProfile.userId);
        setUserName(lineProfile.displayName);
        setPictureUrl(lineProfile.pictureUrl);
        fetchRegisteredName();
      } catch (err) {
        console.error("LIFF error:", err);
      }
    };
    initLiff();
  }, [profile, registration]);

  const fetchRegisteredName = async () => {
    try {
      const data = await employeeData('check-user');
      if(data.found) {
        setRegisteredName(data.name);
        if (data.department) setUserDept(data.department);
      }
    } catch (err) {
      console.error("Error fetching registered name:", err);
    }
  };

  const nextHoliday = holidays?.find(h => h.date >= now.date);
  const holidayLine = (() => {
    if (!holidays) return th ? 'วันหยุดประจำปีของบริษัท' : 'This year’s days off';
    if (!nextHoliday) return th ? 'ไม่มีวันหยุดเหลือในปีนี้' : 'No more this year';
    const n = dayDiff(now.date, nextHoliday.date);
    const when = n === 0 ? (th ? 'วันนี้' : 'today') : n === 1 ? (th ? 'พรุ่งนี้' : 'tomorrow') : (th ? `อีก ${n} วัน` : `in ${n} days`);
    const day = new Date(nextHoliday.date + 'T12:00:00+07:00').toLocaleDateString(th ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
    return th ? `ถัดไป ${day} · ${when}` : `Next: ${day} · ${when}`;
  })();
  const teamLine = offToday === null ? (displayDeptName || (th ? 'ทีมของคุณ' : 'Your team')) : offToday === 0 ? (th ? 'วันนี้ไม่มีใครลา' : 'Everyone’s in today') : (th ? `วันนี้ลา ${offToday} คน` : `${offToday} off today`);

  const balances = [
    { key: 'sick' as const, label: th ? 'ลาป่วย' : 'Sick', Icon: Thermometer, remaining: sickRemaining, total: sickTotal },
    { key: 'vacation' as const, label: th ? 'พักร้อน' : 'Annual', Icon: Palmtree, remaining: remainingDays, total: annualTotal },
    { key: 'personal' as const, label: th ? 'ลากิจ' : 'Personal', Icon: CalendarDays, remaining: personalRemaining, total: personalTotal },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="relative overflow-hidden bg-linear-to-br/srgb from-sky-500 via-sky-600 to-indigo-600 px-5 pt-7 pb-20 text-white rounded-b-[2rem]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-4 pr-14 md:max-w-2xl md:mx-auto">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/20 ring-2 ring-white/40 grid place-items-center text-lg font-bold">
            {pictureUrl && !pictureFailed
              ? <img src={pictureUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setPictureFailed(true)} />
              : initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-sky-100">{greeting},</p>
            <h1 className="truncate text-2xl font-extrabold leading-tight">{registeredName ? firstName : <Skeleton className="h-7 w-32 bg-white/30" />}</h1>
            <p className="mt-0.5 text-xs leading-snug text-sky-100">{[fullName !== firstName ? fullName : '', displayDeptName].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      </header>

      <main className="relative -mt-14 flex w-full flex-col gap-4 px-4 md:max-w-2xl md:mx-auto">
        <section className="rounded-3xl bg-white p-4 shadow-md shadow-slate-200/60 border border-slate-100">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="text-sm font-bold text-slate-800">{th ? 'วันลาคงเหลือ' : 'Your leave balance'}</h2>
            <span className="text-[11px] font-medium text-slate-400">{isIntern ? (th ? 'ตลอดการฝึกงาน' : 'Whole internship') : th ? `ปี ${year + 543}` : year}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {balances.map(b => (
              <BalanceCard key={b.key} label={b.label} Icon={b.Icon} tone={tones[b.key]} loading={isQuotaLoading} configured={policyConfigured} unlimited={unlimitedLeave}
                remaining={b.remaining} total={b.total} th={th} onClick={() => navigate(`/leave-request?type=${b.key}`)} />
            ))}
          </div>
          {isIntern && (
            <button type="button" onClick={() => navigate('/leave-request?type=university')} className="group mt-2 flex w-full items-center gap-3 rounded-2xl border border-violet-100 bg-linear-to-r/srgb from-violet-50 to-white p-3 text-left shadow-xs transition active:scale-[0.98] hover:border-violet-200 hover:shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600"><GraduationCap className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-violet-700">{th ? 'กิจกรรมมหาวิทยาลัย' : 'University activity'}</span>
                <span className="block text-[11px] text-slate-500">{th ? 'ไม่จำกัดวัน · แนบหลักฐานจากมหาวิทยาลัย' : 'No day limit · attach proof from your university'}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs"><Plus className="h-3 w-3" strokeWidth={3} />{th ? 'ขอลา' : 'Request'}</span>
            </button>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setShowHolidaysModal(true)} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-xs transition active:scale-[0.98] hover:border-emerald-200 hover:shadow-sm">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CalendarDays className="h-5 w-5" /></span>
            <span className="text-sm font-bold text-slate-800 leading-snug">{t('company_holidays')}</span>
            <span className="mt-0.5 text-[11px] font-medium text-emerald-600 leading-snug">{holidayLine}</span>
          </button>

          <Dialog open={showTeamCalendar} onOpenChange={setShowTeamCalendar}>
            <DialogTrigger asChild>
              <button type="button" className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-xs transition active:scale-[0.98] hover:border-indigo-200 hover:shadow-sm">
                <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Users className="h-5 w-5" /></span>
                <span className="text-sm font-bold text-slate-800 leading-snug">{t('team_calendar')}</span>
                <span className="mt-0.5 text-[11px] font-medium text-indigo-600 leading-snug">{teamLine}</span>
              </button>
            </DialogTrigger>
            <DialogContent className="w-[90%] max-w-md rounded-2xl p-0 border-0 overflow-hidden bg-transparent shadow-none">
              <DialogTitle className="sr-only">{t('team_calendar')}</DialogTitle>
              {userDept ? (
                <TeamCalendar department={userDept} userId={userId ?? undefined} />
              ) : (
                <div className="p-8 bg-white rounded-2xl text-center"><Skeleton className="w-full h-64" /></div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <button type="button" onClick={() => navigate("/sops")} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-xs transition active:scale-[0.98] ${sopPending ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white hover:border-cyan-200'}`}>
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${sopPending ? 'bg-amber-100 text-amber-700' : 'bg-cyan-50 text-cyan-600'}`}><FileCheck2 className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800">{th ? 'ระเบียบบริษัท' : 'Company SOPs'}</span>
            <span className={`block text-[11px] font-medium ${sopPending ? 'text-amber-700' : 'text-slate-500'}`}>{sopPending ? (th ? `รออ่านและกดยอมรับ ${sopPending} เรื่อง` : `${sopPending} to read and accept`) : (th ? 'วัฒนธรรม วิธีทำงาน และกติกาข้อมูล' : 'Culture, how we work and data rules')}</span>
          </span>
          {!!sopPending && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{sopPending}</span>}
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </button>

        {attendance && (
          <button type="button" onClick={() => navigate("/attendance")} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-xs transition active:scale-[0.98] ${attendance.open ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white hover:border-emerald-200'}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${attendance.open ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}><Clock3 className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">{th ? 'ลงเวลาทำงาน' : 'Clock in'}</span>
              <span className={`block text-[11px] font-medium ${attendance.open ? 'text-emerald-700' : 'text-slate-500'}`}>{attendance.open ? (th ? `ทำงานตั้งแต่ ${clock(attendance.open)}` : `Working since ${clock(attendance.open)}`) : attendance.workToday ? (th ? 'กดลงเวลาเข้าและออก ดูชั่วโมงของฉัน' : 'Clock in and out, see my hours') : (th ? 'วันนี้เข้าออฟฟิศ ไม่ต้องลงเวลา' : 'Office day today, no clock-in needed')}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </button>
        )}

        {travel?.configured && (
          <button type="button" onClick={() => navigate("/travel")} className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-4 text-left shadow-xs transition active:scale-[0.98] ${travel.open ? 'border-sky-200 bg-linear-to-r/srgb from-sky-50 to-indigo-50' : travel.paper ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white hover:border-sky-200'}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br/srgb from-sky-500 to-indigo-600 text-white shadow-sm shadow-sky-600/20"><Car className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">{th ? 'เบิกค่าเดินทาง' : 'Travel claims'}</span>
              {travel.open
                ? <span className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-sky-700"><span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" /></span><span className="truncate">{th ? 'กำลังเดินทาง' : 'Trip in progress'}{travel.client ? ` · ${travel.client}` : ''}</span></span>
                : travel.paper
                  ? <span className="block text-[11px] font-semibold text-amber-700">{th ? `ส่งใบเสร็จตัวจริงให้บัญชี ${travel.paper} ใบ` : `${travel.paper} paper receipt${travel.paper > 1 ? 's' : ''} to hand in`}</span>
                  : <span className="block text-[11px] font-medium text-slate-500">{travel.trips ? (th ? `เดือนนี้ ฿${money(travel.total)} · ${travel.trips} ทริป` : `฿${money(travel.total)} this month · ${travel.trips} trip${travel.trips > 1 ? 's' : ''}`) : (th ? 'ไปพบลูกค้า บันทึกระยะทางและใบเสร็จ' : 'Client visits, distance and receipts')}</span>}
            </span>
            {travel.open ? <span className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white">{th ? 'เปิด' : 'Open'}</span> : !!travel.paper && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{travel.paper}</span>}
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </button>
        )}

        {isCeo && (
          <button type="button" onClick={() => navigate("/ceo")} className="flex w-full items-center gap-3 rounded-2xl bg-slate-900 p-4 text-left shadow-xs transition active:scale-[0.98]">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/15 text-amber-400"><ShieldCheck className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">{th ? 'ระบบจัดการหลังบ้าน' : 'CEO dashboard'}</span>
              <span className="block text-[11px] text-slate-400">{th ? 'อนุมัติคำขอและจัดการพนักงาน' : 'Approve requests and manage staff'}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </button>
        )}
      </main>

      <EmployeeCancellations userId={userId} onChanged={refreshQuota} />

      <footer className="py-6 flex flex-col items-center border-t border-slate-100 bg-white mt-auto">
        <img src={tbsLogo} alt="TBS Logo" className="h-7 w-auto opacity-80" />
        <span className="text-[10px] font-medium text-slate-400 mt-2 tracking-wide">
          © {new Date().getFullYear()} TBS MARKETING
        </span>
      </footer>

      <HolidaysModal open={showHolidaysModal} onOpenChange={setShowHolidaysModal} />
    </div>
  );
};

export default Dashboard;
