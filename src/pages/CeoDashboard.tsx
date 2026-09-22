import PendingRequests from "@/components/ceo/PendingRequests";
import YearRollover from "@/components/ceo/YearRollover";
import TeamCalendar from "@/components/ceo/TeamCalendar";
import ChangeHistory from "@/components/ceo/ChangeHistory";
import LeaveRecordDialog from "@/components/ceo/LeaveRecordDialog";
import { LeaveRequestUpdate } from "@/lib/api";
import { useState, useEffect, useMemo } from "react";
import { 
  Users, Calendar, Clock, Plus, Trash2, Edit, FileText, X,
  Search, AlertCircle, CheckCircle2, LayoutGrid, BarChart3,
  AlertTriangle, TrendingUp, Palmtree, Thermometer, CalendarDays,
  Building, RotateCw, ShieldCheck, FileSpreadsheet, Upload, Download, Sparkles, Check, ArrowRight, ChevronRight, Filter, UserPlus
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Employee, LeaveRecord } from "@/data/mockEmployees";
import tbsLogo from "@/image/TBS-Logo.png";

import SheetView from "@/components/ceo/SheetView";
import QuickAddLeaveModal from "@/components/ceo/QuickAddLeaveModal";
import { useEmployeesData } from "@/hooks/useEmployeesData";
import OverviewDashboard from "@/components/ceo/OverviewDashboard";
import RemoveEmployeeDialog from "@/components/ceo/RemoveEmployeeDialog";
import ManageRoster from "@/components/ceo/ManageRoster";
import { useLeaveMutations } from "@/hooks/useLeaveMutations";
import DataSourceBanner from "@/components/ceo/DataSourceBanner";
import { findByEmpNo, formatEmpCode, nextEmpNo, parseEmpNo, searchEmployees } from "@/lib/employeeMatch";
import { normalizeDateInput } from "@/components/ceo/leaveSheetUtils";
import { LeaveType } from "@/components/ceo/leaveSheetUtils";

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";


const KNOWN_DEPARTMENTS = ["SEO", "Web Developer", "UX/UI Designer", "Graphic", "Content", "PBN", "SEM", "Account", "Sale"];

export default function CeoDashboard() {
  // Selected Year & Department Filters
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedDept, setSelectedDept] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"overview" | "roster" | "sheet" | "removed" | "calendar" | "history" | "rollover" | "pending">(
    () => (localStorage.getItem("tbs_ceo_view_mode") as "overview" | "roster" | "sheet" | "removed" | "calendar" | "history" | "rollover" | "pending") || "overview"
  );
  const [compactRows, setCompactRows] = useState<boolean>(
    () => localStorage.getItem("tbs_ceo_density") === "compact"
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals & Forms
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [employeeToRemove, setEmployeeToRemove] = useState<Employee | null>(null);

  // Sync & Import States
  

  // Column indexes for import mapping

  // Form States for Add Leave in Modal
  const [modalLeaveForm, setModalLeaveForm] = useState({ date: "", sick: "", annual: "", personal: "", note: "" });

  // Form States for Add & Edit Profile

  const [editEmpCode, setEditEmpCode] = useState("");
  const [editEmpName, setEditEmpName] = useState("");
  const [editEmpNickname, setEditEmpNickname] = useState("");
  const [editEmpDept, setEditEmpDept] = useState("SEO");
  const [editEmpStartDate, setEditEmpStartDate] = useState("");
  const [quotaAnnual, setQuotaAnnual] = useState(12);
  const [quotaSick, setQuotaSick] = useState(30);
  const [quotaPersonal, setQuotaPersonal] = useState(3);
  const [quotaCarried, setQuotaCarried] = useState(0);

  // Departments List


  const {
    employees,
    source: dataSource,
    isLoading: isLoadingEmployees,
    isFetching: isFetchingEmployees,
    error: employeesError,
    lastUpdated: employeesUpdatedAt,
    partial: employeesPartial,
    warning: employeesWarning,
    refetch: refetchEmployees,
  } = useEmployeesData(selectedYear);

  useEffect(() => {
    localStorage.setItem("tbs_ceo_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("tbs_ceo_density", compactRows ? "compact" : "comfortable");
  }, [compactRows]);

  const leaveMutations = useLeaveMutations(selectedYear);

  const activeEmployees = employees.filter((emp) => emp.status !== "inactive");
  const removedEmployees = employees.filter((emp) => emp.status === "inactive");

  const departments = useMemo(() => {
    const present = new Set(activeEmployees.map((e) => e.department).filter(Boolean));
    const ordered = KNOWN_DEPARTMENTS.filter((d) => present.has(d));
    const extra = [...present].filter((d) => !KNOWN_DEPARTMENTS.includes(d)).sort();
    return ["All", ...ordered, ...extra];
  }, [activeEmployees]);

  // Date & Calculation Helpers
  function formatDate(dateStr: string) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function sumLeaves(leaves: LeaveRecord[] | undefined, type: string, year: string) {
    if (!leaves || !Array.isArray(leaves)) return 0;
    return leaves
      .filter((l) => l.type === type && l.date && l.date.startsWith(year) && (l.status === "Approved" || !l.status))
      .reduce((sum, l) => sum + (l.days || 0), 0);
  }

  // Calculate Summary Metrics
  const totalEmployeesCount = activeEmployees.length;
  let totalSickTaken = 0;
  let totalAnnualTaken = 0;
  let totalPersonalTaken = 0;

  const todayIso = new Date().toISOString().split("T")[0];
  const onLeaveToday = activeEmployees.filter((emp) =>
    emp.leaves ? emp.leaves.some((l) => (l.status === "Approved" || !l.status) && (l.date === todayIso || l.date.includes(todayIso))) : false
  );

  const quotaAlertList: { emp: Employee; type: string; remain: number }[] = [];

  activeEmployees.forEach((emp) => {
    const sTaken = sumLeaves(emp.leaves, "sick", selectedYear);
    const aTaken = sumLeaves(emp.leaves, "annual", selectedYear);
    const pTaken = sumLeaves(emp.leaves, "personal", selectedYear);

    totalSickTaken += sTaken;
    totalAnnualTaken += aTaken;
    totalPersonalTaken += pTaken;

    const aGranted = emp.quotas.annualTotal + emp.quotas.carriedOver;
    const aRemain = aGranted - aTaken;
    const sRemain = emp.quotas.sickTotal === null || emp.quotas.sickTotal === undefined
      ? Infinity
      : emp.quotas.sickTotal - sTaken;
    const pRemain = emp.quotas.personalTotal - pTaken;

    if (aRemain < 0 || sRemain < 0 || pRemain < 0) {
      quotaAlertList.push({ emp, type: "Over Quota", remain: Math.min(aRemain, sRemain, pRemain) });
    }
  });

  const totalAllTaken = totalSickTaken + totalAnnualTaken + totalPersonalTaken;


  // Filtered employees
  const filteredEmployees = activeEmployees.filter((emp) => {
    const matchesDept = selectedDept === "All" || emp.department === selectedDept;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.nickname.toLowerCase().includes(q) ||
      emp.empCode.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q);

    return matchesDept && matchesSearch;
  });

  // Sync Data

  // Import Handlers

  const handleAddLeaveModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const date = normalizeDateInput(modalLeaveForm.date, selectedYear);
    if (!date) {
      toast.error("Enter a valid date, for example 2026-08-25");
      return;
    }

    const entries = (["sick", "annual", "personal"] as LeaveType[])
      .map((type) => ({ type, days: parseFloat(modalLeaveForm[type]) || 0 }))
      .filter((entry) => entry.days > 0);

    if (entries.length === 0) {
      toast.error("Enter the number of days");
      return;
    }

    try {
      for (const entry of entries) {
        await addLeaveRecord(selectedEmployee.id, { date, type: entry.type, days: entry.days, note: modalLeaveForm.note });
        setModalLeaveForm((current) => ({ ...current, [entry.type]: "" }));
      }
      setModalLeaveForm({ date: "", sick: "", annual: "", personal: "", note: "" });
    } catch { /* Keep the form on failure. */ }
  };

  const [requestEditor, setRequestEditor] = useState<{
    empId: string; requestId?: string; value: LeaveRequestUpdate; creating?: boolean;
  } | null>(null);

  useEffect(() => {
    if (selectedEmployee) {
      const fresh = employees.find((employee) => employee.id === selectedEmployee.id);
      if (fresh) setSelectedEmployee(fresh);
    }
  }, [employees, selectedEmployee]);

  const updateLeaveRecord = async (empId: string, leaveId: string, patch: Partial<LeaveRecord>) => {
    const leave = employees.find((emp) => emp.id === empId)?.leaves.find((row) => row.id === leaveId);
    if (!leave?.requestId || !leave.requestDates?.length) {
      toast.error("Refresh the dashboard before editing this request."); return;
    }
    const next = { ...leave, ...patch };
    const value: LeaveRequestUpdate = {
      scope: "request", expectedDates: leave.requestDates,
      dates: leave.requestDates.map((date) => date === leave.date ? next.date : date),
      type: next.type, daysPerDate: next.days,
      halfDayPeriod: next.days === 0.5 ? next.halfDayPeriod ?? null : null,
      note: next.note, status: next.status,
    };
    if (leave.requestDates.length > 1 || (next.days === 0.5 && !value.halfDayPeriod)) {
      setRequestEditor({ empId, requestId: leave.requestId, value }); return;
    }
    try { await leaveMutations.update.mutateAsync({ id: leave.requestId, patch: value }); }
    catch { /* The unchanged server data remains visible. */ }
  };

  const addLeaveRecord = async (
    empId: string,
    draft: { date: string; type: LeaveType; days: number; note: string; halfDayPeriod?: "morning" | "afternoon" | null }
  ) => {
    if (draft.days === 0.5 && !draft.halfDayPeriod) {
      setRequestEditor({ empId, creating: true, value: {
        scope: "request", expectedDates: [draft.date], dates: [draft.date], type: draft.type,
        daysPerDate: draft.days, halfDayPeriod: null, note: draft.note, status: "Approved",
      } }); return;
    }
    await leaveMutations.create.mutateAsync({ empId, ...draft });
  };

  const updateQuotaNote = async (empId: string, note: string) => {
    const employee = employees.find((emp) => emp.id === empId);
    if (employee) await leaveMutations.quota.mutateAsync({ employee, patch: { note } });
  };

  const removeLeaveRecord = (empId: string, leaveId: string) => {
    const leave = employees.find((emp) => emp.id === empId)?.leaves.find((row) => row.id === leaveId);
    if (!leave?.requestId || !leave.requestDates?.length) {
      toast.error("Refresh the dashboard before removing this request."); return;
    }
    if (!confirm(`Remove this entire leave request (${leave.requestDates.length} date(s)): ${leave.requestDates.join(", ")}?`)) return;
    leaveMutations.remove.mutate({ id: leave.requestId, expectedDates: leave.requestDates });
  };

  const handleDeleteLeave = removeLeaveRecord;

  const openEditQuotaModal = (emp: Employee) => {
    setEditingEmp(emp);
    setEditEmpCode(emp.empCode || "");
    setEditEmpName(emp.name);
    setEditEmpNickname(emp.nickname);
    setEditEmpDept(emp.department);
    setEditEmpStartDate(emp.startDate);
    setQuotaAnnual(emp.quotas.annualTotal);
    setQuotaSick(emp.quotas.sickTotal);
    setQuotaPersonal(emp.quotas.personalTotal);
    setQuotaCarried(emp.quotas.carriedOver);
  };

  const handleUpdateQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;

    const profileChanged =
      editEmpCode !== (editingEmp.empCode ?? "") ||
      editEmpName !== editingEmp.name ||
      editEmpNickname !== editingEmp.nickname ||
      editEmpDept !== editingEmp.department;

    try {
      if (profileChanged) {
        await leaveMutations.profile.mutateAsync({
          employee: editingEmp,
          patch: {
            empCode: editEmpCode,
            name: editEmpName,
            nickname: editEmpNickname,
            department: editEmpDept,
          },
        });
      }

      await leaveMutations.quota.mutateAsync({
        employee: editingEmp,
        patch: {
          annualTotal: quotaAnnual,
          sickTotal: quotaSick,
          personalTotal: quotaPersonal,
          carriedOver: quotaCarried,
        },
      });

      setEditingEmp(null);
    } catch {
      /* mutation toasts the failure */
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 pb-16">
      
      {/* 1. Top Executive Navigation Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md border-b border-slate-800">
        <div className="h-1 w-full bg-gradient-to-r from-[#00B5E2] via-[#F5A623] to-[#68BD24]"></div>
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & Year Switcher */}
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded shadow-xs">
              <img src={tbsLogo} alt="TBS Logo" className="h-6 w-auto object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-white tracking-tight">TBS HR - Leave Request System</h1>
                <select aria-label="Leave year" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-slate-800 text-white border border-slate-700 rounded px-2 py-1 text-xs font-bold">
                  {Array.from({ length: 5 }, (_, index) => currentYear + 1 - index).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">TBS Marketing &bull; Staff leave and quotas</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <div className={`hidden lg:flex items-center gap-1.5 font-bold border px-2.5 py-1 rounded-full text-[11px] mr-2 ${
              dataSource === "live"
                ? "text-emerald-400 bg-emerald-950/80 border-emerald-800"
                : "text-amber-300 bg-amber-950/80 border-amber-800"
            }`}>
              <span className={`w-2 h-2 rounded-full ${dataSource === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
              {dataSource === "live" ? "Live records connected" : "Offline - local data"}
            </div>

            <button
              onClick={() => refetchEmployees()}
              disabled={isFetchingEmployees}
              className="h-9 px-3 bg-[#68BD24] hover:bg-[#5ca81f] text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isFetchingEmployees ? "animate-spin" : ""}`} />
              {isFetchingEmployees ? "Refreshing..." : "Refresh records"}
            </button>

            <button
              onClick={() => setIsQuickAddOpen(true)}
              className="h-9 px-3 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Leave
            </button>


          </div>
        </div>
      </header>

      {/* 2. Executive Metric Cards Strip */}
      <div className="max-w-[1600px] mx-auto px-6 mt-6">
        <DataSourceBanner
          source={dataSource}
          error={employeesError}
          isFetching={isFetchingEmployees}
          lastUpdated={employeesUpdatedAt}
          partial={employeesPartial}
          warning={employeesWarning}
          onRetry={() => refetchEmployees()}
        />

        {/* 3. Main Master Executive Datatable Container */}
        <aside className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Manage leave here</p>
          <p className="mt-1">Use this dashboard for approvals, employee details and leave allowances. Overview, Roster and Sheet share the same saved records. Download CSV or PDF copies when you need a report.</p>
          <p className="mt-1 text-xs text-slate-600">Approve requests here or through LINE. Refresh records to see the latest decisions. Existing Google Sheets connections remain in place during the transition.</p>
        </aside>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          
          {/* Department Filters & Search Toolbar */}
          <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-300 shrink-0">
              Department
              <select aria-label="Department filter" value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 text-white px-3 py-2 max-w-[220px]">
                {departments.map(dept => <option key={dept} value={dept}>{dept === "All" ? "All departments" : dept} ({dept === "All" ? activeEmployees.length : activeEmployees.filter(e => e.department === dept).length})</option>)}
              </select>
            </label>

            <div className="flex items-center gap-2 min-w-0 max-w-full">
              <div className="flex flex-wrap bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  onClick={() => setViewMode("overview")}
                  className={`px-2.5 py-1 text-xs font-extrabold rounded-md transition-colors flex items-center gap-1.5 ${
                    viewMode === "overview" ? "bg-[#00B5E2] text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Overview
                </button>
                <button
                  onClick={() => setViewMode("roster")}
                  className={`px-2.5 py-1 text-xs font-extrabold rounded-md transition-colors flex items-center gap-1.5 ${
                    viewMode === "roster" ? "bg-[#00B5E2] text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Roster
                </button>
                <button
                  onClick={() => setViewMode("sheet")}
                  className={`px-2.5 py-1 text-xs font-extrabold rounded-md transition-colors flex items-center gap-1.5 ${
                    viewMode === "sheet" ? "bg-[#00B5E2] text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Sheet
                </button>
                <select aria-label="More tools" value={["overview","roster","sheet"].includes(viewMode)?"":viewMode} onChange={e=>{if(e.target.value)setViewMode(e.target.value as typeof viewMode);}} className="rounded-md border border-slate-600 bg-slate-800 text-white px-2 py-1.5 text-xs font-bold max-w-[170px]">
                  <option value="" disabled>More tools</option>
                  <option value="pending">Pending requests</option><option value="calendar">Team calendar</option><option value="history">Change history</option><option value="rollover">Year rollover</option><option value="removed">Removed employees ({removedEmployees.length})</option>
                </select>
              </div>

              {viewMode === "sheet" && (
                <button
                  onClick={() => setCompactRows((v) => !v)}
                  className="h-8 px-2.5 text-xs font-bold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="Toggle row density"
                >
                  {compactRows ? "Compact" : "Comfortable"}
                </button>
              )}
            </div>

            {/* Search Input Box */}
            <div className="relative w-full md:w-64 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search name, nickname, code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search employees"
                className="pl-9 pr-9 h-9 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 rounded-lg focus-visible:ring-[#00B5E2]"
              />
              {searchQuery && (
                <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white"><X className="w-4 h-4" aria-hidden="true" /></button>
              )}
            </div>
          </div>

          {viewMode === "pending" ? <PendingRequests employees={filteredEmployees} ready={dataSource === "live" && !employeesError && !employeesPartial && !isFetchingEmployees} /> : viewMode === "rollover" ? <YearRollover key={selectedYear} year={selectedYear} /> : viewMode === "calendar" ? <TeamCalendar employees={filteredEmployees} year={selectedYear} /> : viewMode === "history" ? <ChangeHistory employees={employees} /> : viewMode === "overview" ? (
            <div className="p-4 bg-slate-100/70">
              <OverviewDashboard
                employees={filteredEmployees}
                year={selectedYear}
                departmentCount={Math.max(departments.length - 1, 0)}
                onLeaveToday={onLeaveToday}
                onSelectEmployee={setSelectedEmployee}
                exportReady={dataSource === "live" && !employeesError && !employeesPartial && !isFetchingEmployees}
                exportScope={`Department: ${selectedDept}${searchQuery.trim() ? `; search: ${searchQuery.trim()}` : ""}`}
              />
            </div>
          ) : viewMode === "roster" ? (
            <ManageRoster
              employees={activeEmployees}
              onOpenSheet={setSelectedEmployee}
              onQuotaChange={(employee, patch) => leaveMutations.quota.mutate({ employee, patch })}
              onSetStatus={(employee, status) => {
                if (status === "inactive") {
                  setEmployeeToRemove(employee);
                } else {
                  leaveMutations.employeeStatus.mutate({ employee, status });
                }
              }}
            />
          ) : viewMode === "removed" ? (
            <ManageRoster
              employees={removedEmployees}
              variant="removed"
              onOpenSheet={setSelectedEmployee}
              onQuotaChange={(employee, patch) => leaveMutations.quota.mutate({ employee, patch })}
              onSetStatus={(employee, status) => leaveMutations.employeeStatus.mutate({ employee, status })}
            />
          ) : (
            <div className="p-4 bg-slate-100/70">
              <SheetView
                employees={filteredEmployees}
                year={selectedYear}
                compact={compactRows}
                onUpdateLeave={updateLeaveRecord}
                onAddLeave={addLeaveRecord}
                onDeleteLeave={removeLeaveRecord}
                onEditProfile={openEditQuotaModal}
                onQuotaNoteChange={updateQuotaNote}
                onRemoveEmployee={setEmployeeToRemove}
              />
            </div>
          )}
        </div>
      </div>

      {/* 4. Google Sheet Employee Detail Modal */}
      {selectedEmployee && (
        <Dialog open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
          <DialogContent className="max-w-4xl bg-white rounded-xl p-6 border border-slate-200 overflow-y-auto max-h-[90vh]">
            <DialogHeader className="border-b border-slate-200 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <DialogTitle className="text-lg font-extrabold text-slate-900">
                  Name : {selectedEmployee.name} <span className="text-amber-600">({selectedEmployee.nickname})</span>
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                  <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded border border-slate-200">{selectedEmployee.department}</span>
                  <span className="font-mono text-slate-500 font-bold">{selectedEmployee.empCode}</span>
                  <span className="text-slate-500 font-bold">&bull; Start Date: {formatDate(selectedEmployee.startDate)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { openEditQuotaModal(selectedEmployee); }} variant="outline" className="h-9 font-bold text-xs">
                  <Edit className="w-3.5 h-3.5 mr-1" /> Edit Profile & Quotas
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Individual Employee Leave Table (Matches Google Sheet) */}
              <div className="border border-slate-300 rounded-lg overflow-hidden shadow-xs">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-extrabold">
                      <th className="py-2.5 px-3 text-left border-r border-slate-800 w-32">Date</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-800 bg-[#CC0000] text-white w-24">Sick Leave</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-800 bg-[#FFD700] text-slate-900 w-24">Annual Leave</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-800 bg-[#0099FF] text-white w-24">Personal Leave</th>
                      <th className="py-2.5 px-3 text-left border-r border-slate-800">Reason / Notes</th>
                      <th className="py-2.5 px-2 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedEmployee.leaves && selectedEmployee.leaves.filter(l => (l.status === "Approved" || !l.status) && l.date.includes(selectedYear)).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 font-medium italic">
                          No leave records for {selectedYear}
                        </td>
                      </tr>
                    ) : (
                      selectedEmployee.leaves && selectedEmployee.leaves
                        .filter(l => (l.status === "Approved" || !l.status) && l.date.includes(selectedYear))
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">{formatDate(l.date)}</td>
                            <td className="py-2 px-3 text-center font-extrabold text-rose-700 border-r border-slate-200">{l.type === "sick" ? l.days : ""}</td>
                            <td className="py-2 px-3 text-center font-extrabold text-amber-900 border-r border-slate-200">{l.type === "annual" ? l.days : ""}</td>
                            <td className="py-2 px-3 text-center font-extrabold text-sky-800 border-r border-slate-200">{l.type === "personal" ? l.days : ""}</td>
                            <td className="py-2 px-3 text-rose-600 font-semibold border-r border-slate-200">{l.note || "-"}</td>
                            <td className="py-2 px-2 text-center">
                              <button type="button" aria-label="Cancel leave request" onClick={() => handleDeleteLeave(selectedEmployee.id, l.id)} className="text-slate-400 hover:text-rose-600 font-bold"><X className="w-4 h-4" aria-hidden="true" /></button>
                            </td>
                          </tr>
                        ))
                    )}

                    {/* Inline Quick Add Leave Record Form */}
                    <tr className="bg-blue-50/50 border-t border-slate-300">
                      <td className="p-1 border-r border-slate-200">
                        <Input type="text" placeholder="Date (e.g. 2026-03-15)" value={modalLeaveForm.date} onChange={(e) => setModalLeaveForm({ ...modalLeaveForm, date: e.target.value })} className="h-8 text-xs font-semibold" />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <Input type="text" placeholder="Sick (0)" value={modalLeaveForm.sick} onChange={(e) => setModalLeaveForm({ ...modalLeaveForm, sick: e.target.value })} className="h-8 text-xs text-center font-bold text-rose-700" />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <Input type="text" placeholder="Annual (0)" value={modalLeaveForm.annual} onChange={(e) => setModalLeaveForm({ ...modalLeaveForm, annual: e.target.value })} className="h-8 text-xs text-center font-bold text-amber-900" />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <Input type="text" placeholder="Personal (0)" value={modalLeaveForm.personal} onChange={(e) => setModalLeaveForm({ ...modalLeaveForm, personal: e.target.value })} className="h-8 text-xs text-center font-bold text-sky-800" />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <Input type="text" placeholder="Reason / Notes..." value={modalLeaveForm.note} onChange={(e) => setModalLeaveForm({ ...modalLeaveForm, note: e.target.value })} className="h-8 text-xs text-rose-600 font-medium" />
                      </td>
                      <td className="p-1 text-center">
                        <Button type="button" onClick={handleAddLeaveModalSubmit} size="sm" className="h-8 bg-[#00B5E2] hover:bg-[#0099c4] text-xs font-bold px-2">
                          + Add
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                  
                  {/* Summary Footer */}
                  <tfoot>
                    <tr className="bg-slate-100 font-extrabold border-t border-slate-300">
                      <td className="py-2.5 px-3 border-r border-slate-300">All leave getting per year</td>
                      <td className="py-2.5 px-3 text-center text-rose-700 border-r border-slate-300">{selectedEmployee.quotas.sickTotal}</td>
                      <td className="py-2.5 px-3 text-center text-amber-900 border-r border-slate-300">{selectedEmployee.quotas.annualTotal + selectedEmployee.quotas.carriedOver}</td>
                      <td className="py-2.5 px-3 text-center text-sky-800 border-r border-slate-300">{selectedEmployee.quotas.personalTotal}</td>
                      <td colSpan={2} className="py-2.5 px-3 text-red-600 font-bold text-xs">
                        {selectedEmployee.quotas.carriedOver > 0 && `${selectedEmployee.quotas.carriedOver} extra days awarded`}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-extrabold border-t border-slate-200">
                      <td className="py-2.5 px-3 border-r border-slate-300">Total taken in {selectedYear}</td>
                      <td className="py-2.5 px-3 text-center text-rose-700 border-r border-slate-300">{sumLeaves(selectedEmployee.leaves, "sick", selectedYear)}</td>
                      <td className="py-2.5 px-3 text-center text-amber-900 border-r border-slate-300">{sumLeaves(selectedEmployee.leaves, "annual", selectedYear)}</td>
                      <td className="py-2.5 px-3 text-center text-sky-800 border-r border-slate-300">{sumLeaves(selectedEmployee.leaves, "personal", selectedYear)}</td>
                      <td colSpan={2}></td>
                    </tr>
                    <tr className="bg-slate-200 font-extrabold text-slate-900 border-t border-slate-300">
                      <td className="py-2.5 px-3 border-r border-slate-300">Total remain</td>
                      <td className="py-2.5 px-3 text-center border-r border-slate-300">{selectedEmployee.quotas.sickTotal - sumLeaves(selectedEmployee.leaves, "sick", selectedYear)}</td>
                      <td className="py-2.5 px-3 text-center border-r border-slate-300">{selectedEmployee.quotas.annualTotal + selectedEmployee.quotas.carriedOver - sumLeaves(selectedEmployee.leaves, "annual", selectedYear)}</td>
                      <td className="py-2.5 px-3 text-center border-r border-slate-300">{selectedEmployee.quotas.personalTotal - sumLeaves(selectedEmployee.leaves, "personal", selectedYear)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Quota / Profile Modal */}
      {editingEmp && (
        <Dialog open={!!editingEmp} onOpenChange={() => setEditingEmp(null)}>
          <DialogContent className="max-w-md bg-white rounded-xl p-6 border border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Adjust Leave Quotas & Profile</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">Edit details for {editingEmp.name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateQuota} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Employee Code</label>
                  <Input value={editEmpCode} onChange={(e) => setEditEmpCode(e.target.value)} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Department</label>
                  <select value={editEmpDept} onChange={(e) => setEditEmpDept(e.target.value)} className="w-full h-9 text-xs border rounded-md px-2 mt-1">
                    {departments.filter(d => d !== "All").map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Full Name</label>
                  <Input value={editEmpName} onChange={(e) => setEditEmpName(e.target.value)} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Nickname</label>
                  <Input value={editEmpNickname} onChange={(e) => setEditEmpNickname(e.target.value)} className="h-9 text-xs mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Annual Quota</label>
                  <Input type="number" value={quotaAnnual} onChange={(e) => setQuotaAnnual(Number(e.target.value))} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Sick Quota</label>
                  <Input type="number" value={quotaSick} onChange={(e) => setQuotaSick(Number(e.target.value))} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Carried Over</label>
                  <Input type="number" value={quotaCarried} onChange={(e) => setQuotaCarried(Number(e.target.value))} className="h-9 text-xs mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" onClick={() => setEditingEmp(null)} className="h-9 text-xs">Cancel</Button>
                <Button type="submit" className="h-9 text-xs bg-[#00B5E2] hover:bg-[#0099c4]">Save Changes</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Sheet Selection Modal */}

      {/* Column Mapping Preview Dialog */}

      {/* Import Modal */}



      <RemoveEmployeeDialog
        employee={employeeToRemove}
        busy={leaveMutations.employeeStatus.isPending}
        onCancel={() => setEmployeeToRemove(null)}
        onConfirm={(employee) => {
          leaveMutations.employeeStatus.mutate(
            { employee, status: "inactive" },
            { onSettled: () => setEmployeeToRemove(null) }
          );
        }}
      />

      {requestEditor && <LeaveRecordDialog
        initial={requestEditor.value}
        employeeName={employees.find((employee) => employee.id === requestEditor.empId)?.name ?? "Employee"}
        creating={requestEditor.creating}
        onClose={() => setRequestEditor(null)}
        onSave={async (value) => {
          if (requestEditor.creating) await leaveMutations.create.mutateAsync({
            empId: requestEditor.empId, date: value.dates[0], type: value.type,
            days: value.daysPerDate, halfDayPeriod: value.halfDayPeriod, note: value.note,
          });
          else await leaveMutations.update.mutateAsync({ id: requestEditor.requestId!, patch: value });
        }}
      />}

      <QuickAddLeaveModal
        open={isQuickAddOpen}
        onOpenChange={setIsQuickAddOpen}
        employees={employees}
        defaultYear={selectedYear}
        onSubmit={addLeaveRecord}
      />

    </div>
  );
}
