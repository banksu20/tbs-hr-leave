import { useState, useEffect } from "react";
import { 
  Users, Calendar, Clock, Plus, Trash2, Edit, FileText,
  Search, AlertCircle, CheckCircle2, LayoutGrid, BarChart3,
  AlertTriangle, TrendingUp, Palmtree, Thermometer, CalendarDays,
  Building, RotateCw, ShieldCheck, FileSpreadsheet, Upload, Download, Sparkles, Check, ArrowRight, ChevronRight, Filter, UserPlus
} from "lucide-react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { initialEmployees, Employee, LeaveRecord } from "@/data/mockEmployees";
import tbsLogo from "@/image/TBS-Logo.png";

import { fetchPostgresLiveData } from "@/lib/postgresApi";

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";

export default function CeoDashboard() {
  // Selected Year & Department Filters
  const [selectedYear, setSelectedYear] = useState<"2026" | "2025">("2026");
  const [selectedDept, setSelectedDept] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals & Forms
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>("");

  // Sync & Import States
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewGrid, setPreviewGrid] = useState<string[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [currentImportFileName, setCurrentImportFileName] = useState<string>("");
  
  const [pendingWorkbook, setPendingWorkbook] = useState<any>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [isSheetSelectModalOpen, setIsSheetSelectModalOpen] = useState<boolean>(false);

  // Column indexes for import mapping
  const [mapIdIdx, setMapIdIdx] = useState<number>(0);
  const [mapFnIdx, setMapFnIdx] = useState<number>(1);
  const [mapLnIdx, setMapLnIdx] = useState<number>(2);
  const [mapNickIdx, setMapNickIdx] = useState<number>(3);
  const [mapDeptIdx, setMapDeptIdx] = useState<number>(4);

  // Form States for Add Leave in Modal
  const [modalLeaveForm, setModalLeaveForm] = useState({ date: "", sick: "", annual: "", personal: "", note: "" });

  // Form States for Add & Edit Profile
  const [newEmpCode, setNewEmpCode] = useState("");
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpNickname, setNewEmpNickname] = useState("");
  const [newEmpDept, setNewEmpDept] = useState("SEO");
  const [newEmpStartDate, setNewEmpStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [newEmpAnnual, setNewEmpAnnual] = useState(12);
  const [newEmpSick, setNewEmpSick] = useState(30);
  const [newEmpPersonal, setNewEmpPersonal] = useState(3);
  const [newEmpCarried, setNewEmpCarried] = useState(0);

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
  const departments = ["All", "SEO", "Web Developer", "UX/UI Designer", "Graphic", "Content", "PBN", "SEM", "Account", "Sale"];

  // Load from localStorage or default mock data
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem("tbs_employees_db");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Error parsing saved DB:", e);
      }
    }
    return initialEmployees;
  });

  useEffect(() => {
    localStorage.setItem("tbs_employees_db", JSON.stringify(employees));
  }, [employees]);

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
      .filter((l) => l.type === type && l.date && l.date.includes(year) && (l.status === "Approved" || !l.status))
      .reduce((sum, l) => sum + (l.days || 0), 0);
  }

  // Calculate Summary Metrics
  const totalEmployeesCount = employees.length;
  let totalSickTaken = 0;
  let totalAnnualTaken = 0;
  let totalPersonalTaken = 0;

  const todayIso = new Date().toISOString().split("T")[0];
  const onLeaveToday = employees.filter((emp) =>
    emp.leaves ? emp.leaves.some((l) => (l.status === "Approved" || !l.status) && (l.date === todayIso || l.date.includes(todayIso))) : false
  );

  const quotaAlertList: { emp: Employee; type: string; remain: number }[] = [];

  employees.forEach((emp) => {
    const sTaken = sumLeaves(emp.leaves, "sick", selectedYear);
    const aTaken = sumLeaves(emp.leaves, "annual", selectedYear);
    const pTaken = sumLeaves(emp.leaves, "personal", selectedYear);

    totalSickTaken += sTaken;
    totalAnnualTaken += aTaken;
    totalPersonalTaken += pTaken;

    const aGranted = emp.quotas.annualTotal + emp.quotas.carriedOver;
    const aRemain = aGranted - aTaken;
    const sRemain = emp.quotas.sickTotal - sTaken;
    const pRemain = emp.quotas.personalTotal - pTaken;

    if (aRemain < 0 || sRemain < 0 || pRemain < 0) {
      quotaAlertList.push({ emp, type: "Over Quota", remain: Math.min(aRemain, sRemain, pRemain) });
    }
  });

  const totalAllTaken = totalSickTaken + totalAnnualTaken + totalPersonalTaken;

  // Filtered employees
  const filteredEmployees = employees.filter((emp) => {
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
  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      const data = await fetchPostgresLiveData();
      if (data && Array.isArray(data) && data.length > 0) {
        const mappedEmployees: Employee[] = data.map((item: any, idx: number) => {
          const id = item.id || item.UserID || item.userId || `U_pg_${idx}`;
          const empCode = item.empCode || item.emp_code || `TBS-${String(idx + 1).padStart(3, "0")}`;
          const name = item.name || `${item.FirstName || ""} ${item.LastName || ""}`.trim() || item.Nickname || `Employee ${idx + 1}`;
          const nickname = item.nickname || item.Nickname || item.FirstName || name;
          const department = item.department || item.Department || "General";

          const quotas = {
            annualTotal: item.annualTotal ?? item.annual_total ?? 12,
            sickTotal: item.sickTotal ?? item.sick_total ?? 30,
            personalTotal: item.personalTotal ?? item.personal_total ?? 3,
            carriedOver: item.carriedOver ?? item.carried_over ?? 0,
          };

          const rawLeaves = Array.isArray(item.leaves) ? item.leaves : [];
          const leaves: LeaveRecord[] = rawLeaves.map((l: any, lIdx: number) => ({
            id: l.id || `l_pg_${idx}_${lIdx}`,
            date: l.date || l.leave_date || l.leaveDate || "2026-01-01",
            type: (l.type || l.leave_type || "annual") === "vacation" ? "annual" : (l.type || l.leave_type || "annual"),
            days: parseFloat(l.days || l.leaveDays || 1),
            note: l.note || l.reason || "",
            status: l.status || "Approved",
          }));

          return {
            id, empCode, name, nickname, department,
            startDate: item.startDate || item.start_date || "2025-01-01",
            quotas, leaves,
          };
        });

        setEmployees(mappedEmployees);
        localStorage.setItem("tbs_employees_db", JSON.stringify(mappedEmployees));
        toast.success("Synced latest live leave records!");
      }
    } catch (err) {
      toast.error("Failed to sync live data");
    } finally {
      setIsSyncing(false);
    }
  };

  // Import Handlers
  const parseGoogleSheetGridToEmployees = (grid: string[][], sourceName: string = new Date().getFullYear().toString()) => {
    const parsedEmployees: Employee[] = [];
    const seenNames = new Set<string>();

    for (let r = 0; r < grid.length; r++) {
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || "").trim();
        if (/^name\s*:/i.test(cell) || cell.toLowerCase() === "name") {
          let nameText = cell.replace(/name\s*:?/gi, "").trim();
          if (!nameText && row[c + 1]) nameText = String(row[c + 1] || "").trim();

          if (nameText && nameText.length > 1 && nameText.length < 50 && !seenNames.has(nameText.toLowerCase())) {
            seenNames.add(nameText.toLowerCase());

            const parts = nameText.split(/[()]/).map((p) => p.trim()).filter(Boolean);
            const fullName = parts[0] || nameText;
            const nickname = parts[1] || parts[0] || nameText;

            const existing = employees.find(
              (e) => e.name.toLowerCase().includes(fullName.toLowerCase()) || e.nickname.toLowerCase() === nickname.toLowerCase()
            );

            const empId = existing ? existing.id : `U_gs_${c}_${Date.now()}`;
            const empCode = existing ? existing.empCode : `TBS-${String(parsedEmployees.length + 1).padStart(3, "0")}`;
            const dept = existing ? existing.department : "General";

            let startDate = "2025-01-01";
            if (grid[r + 1]) {
              const dateCell = String(grid[r + 1][c] || "").trim();
              if (dateCell.toLowerCase().includes("start date")) {
                const sDateMatch = dateCell.replace(/start date\s*:?/gi, "").trim();
                if (sDateMatch) startDate = sDateMatch;
              }
            }

            let sickTotal = 30;
            let annualTotal = 12;
            let personalTotal = 3;

            for (let checkR = r + 1; checkR <= Math.min(grid.length - 1, r + 200); checkR++) {
              const checkRow = grid[checkR] || [];
              const label = String(checkRow[c] || "").trim().toLowerCase();
              if (label.includes("all leave getting per year") || label.includes("all leave")) {
                const s = parseFloat(String(checkRow[c + 1]));
                const a = parseFloat(String(checkRow[c + 2]));
                const p = parseFloat(String(checkRow[c + 3]));
                if (!isNaN(s)) sickTotal = s;
                if (!isNaN(a)) annualTotal = a;
                if (!isNaN(p)) personalTotal = p;
                break;
              }
            }

            const leaves: LeaveRecord[] = [];
            for (let lr = r + 1; lr < grid.length; lr++) {
              const lRow = grid[lr] || [];
              const dateStr = String(lRow[c] || "").trim();
              const sickVal = String(lRow[c + 1] || "").trim();
              const annualVal = String(lRow[c + 2] || "").trim();
              const personalVal = String(lRow[c + 3] || "").trim();
              const noteVal = String(lRow[c + 4] || "").trim();

              if (dateStr.toLowerCase().includes("name") || dateStr.toLowerCase().includes("total remain")) {
                if (lr > r + 3) break;
              }

              const dateStrLower = dateStr.toLowerCase();
              if (
                dateStr &&
                !dateStrLower.includes("start date") &&
                !dateStrLower.includes("date") &&
                !dateStrLower.includes("all leave") &&
                !dateStrLower.includes("total taken") &&
                !dateStrLower.includes("total remain") &&
                (sickVal || annualVal || personalVal || noteVal)
              ) {
                let type: "sick" | "annual" | "personal" = "annual";
                let days = 1;
                if (sickVal) { type = "sick"; days = parseFloat(sickVal) || 1; }
                else if (personalVal) { type = "personal"; days = parseFloat(personalVal) || 1; }
                else if (annualVal) { type = "annual"; days = parseFloat(annualVal) || 1; }

                leaves.push({
                  id: `l_gs_${c}_${lr}_${Date.now()}`,
                  date: dateStr,
                  type: type,
                  days: days,
                  note: noteVal,
                  status: "Approved",
                });
              }
            }

            parsedEmployees.push({
              id: empId, empCode, name: fullName, nickname, department: dept, startDate,
              quotas: { annualTotal, sickTotal, personalTotal, carriedOver: existing?.quotas.carriedOver || 0 },
              leaves,
            });
          }
        }
      }
    }

    if (parsedEmployees.length > 0) {
      setEmployees(parsedEmployees);
      localStorage.setItem("tbs_employees_db", JSON.stringify(parsedEmployees));
      setIsImportModalOpen(false);
      setIsSheetSelectModalOpen(false);
      setIsPreviewOpen(false);
      
      const yearMatch = sourceName.match(/\d{4}/);
      if (yearMatch && (yearMatch[0] === "2025" || yearMatch[0] === "2026")) {
        setSelectedYear(yearMatch[0] as "2025" | "2026");
      }
      toast.success(`Successfully imported ${parsedEmployees.length} employee leave profiles!`);
    } else {
      toast.error("Could not parse leave report from sheet.");
    }
  };

  const processSheet = (workbook: any, sheetName: string, fileName: string) => {
    try {
      const worksheet = workbook.Sheets[sheetName];
      const rawGrid: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
      
      const isComplexLeaveReport = rawGrid.some(row => 
        row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('total remain') || cell.toLowerCase().includes('all leave')))
      );

      if (isComplexLeaveReport) {
        parseGoogleSheetGridToEmployees(rawGrid, sheetName);
      } else {
        processRawGridForMapping(rawGrid, fileName);
      }
    } catch (err) {
      toast.error(`Failed to process sheet: ${sheetName}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const isExcel = fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls");
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: "array" });
          
          if (workbook.SheetNames.length > 1) {
            setPendingWorkbook(workbook);
            setSheetNames(workbook.SheetNames);
            setCurrentImportFileName(fileName);
            setIsSheetSelectModalOpen(true);
          } else {
            processSheet(workbook, workbook.SheetNames[0], fileName);
          }
        } catch (err) {
          toast.error("Failed to read Microsoft Excel file.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
          let delimiter = ",";
          if (lines[0]?.includes("\t")) delimiter = "\t";
          const grid = lines.map((line) => line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, '')));
          parseGoogleSheetGridToEmployees(grid, fileName);
        }
      };
      reader.readAsText(file);
    }
  };

  const processRawGridForMapping = (grid: string[][], fileName: string) => {
    if (!grid || grid.length === 0) return;
    const cleanGrid = grid.map((r) => r.map((cell) => String(cell || "").trim())).filter((r) => r.some((c) => c.length > 0));
    if (cleanGrid.length === 0) return;

    const headers = cleanGrid[0].map((h, i) => h || `Column ${i + 1}`);
    setPreviewGrid(cleanGrid);
    setPreviewHeaders(headers);
    setCurrentImportFileName(fileName);

    setIsImportModalOpen(false);
    setIsPreviewOpen(true);
  };

  const confirmColumnMappingImport = () => {
    if (previewGrid.length < 2) return;
    const dataRows = previewGrid.slice(1);
    const imported: Employee[] = [];

    dataRows.forEach((row, idx) => {
      const fn = mapFnIdx !== -1 && row[mapFnIdx] ? row[mapFnIdx] : "";
      const nick = mapNickIdx !== -1 && row[mapNickIdx] ? row[mapNickIdx] : "";
      const dept = mapDeptIdx !== -1 && row[mapDeptIdx] ? row[mapDeptIdx] : "General";

      if (fn || nick) {
        imported.push({
          id: `U_imp_${idx}_${Date.now()}`,
          empCode: `TBS-${String(imported.length + 1).padStart(3, "0")}`,
          name: fn || nick,
          nickname: nick || fn,
          department: dept,
          startDate: "2025-01-01",
          quotas: { annualTotal: 12, sickTotal: 30, personalTotal: 3, carriedOver: 0 },
          leaves: [],
        });
      }
    });

    if (imported.length > 0) {
      setEmployees(imported);
      localStorage.setItem("tbs_employees_db", JSON.stringify(imported));
      toast.success(`Imported ${imported.length} employee records!`);
      setIsPreviewOpen(false);
    }
  };

  const handleImportPastedText = () => {
    if (!importText.trim()) return;
    const lines = importText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    let delimiter = "\t";
    if (lines[0]?.includes(",")) delimiter = ",";
    const grid = lines.map((line) => line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, '')));
    parseGoogleSheetGridToEmployees(grid, "Pasted Sheet Text");
  };

  const handleClearAllData = () => {
    if (confirm("Clear all employee records?")) {
      setEmployees([]);
      localStorage.removeItem("tbs_employees_db");
      toast.success("All data cleared!");
    }
  };

  const handleAddEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpNickname.trim() || !newEmpCode.trim()) {
      toast.error("Please fill in Code, Name and Nickname");
      return;
    }

    const newEmp: Employee = {
      id: `U_${Date.now()}`,
      empCode: newEmpCode,
      name: newEmpName,
      nickname: newEmpNickname,
      department: newEmpDept,
      startDate: newEmpStartDate,
      quotas: {
        annualTotal: newEmpAnnual,
        sickTotal: newEmpSick,
        personalTotal: newEmpPersonal,
        carriedOver: newEmpCarried,
      },
      leaves: [],
    };

    setEmployees(prev => [newEmp, ...prev]);
    setIsAddEmpModalOpen(false);
    setNewEmpCode("");
    setNewEmpName("");
    setNewEmpNickname("");
    toast.success("Employee profile added successfully!");
  };

  const handleAddLeaveModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !modalLeaveForm.date.trim()) {
      toast.error("Please enter a date");
      return;
    }

    const sickVal = parseFloat(modalLeaveForm.sick) || 0;
    const annualVal = parseFloat(modalLeaveForm.annual) || 0;
    const personalVal = parseFloat(modalLeaveForm.personal) || 0;

    if (sickVal <= 0 && annualVal <= 0 && personalVal <= 0) {
      toast.error("Please enter leave days");
      return;
    }

    const newRecords: LeaveRecord[] = [];
    if (sickVal > 0) newRecords.push({ id: Date.now().toString() + "_s", date: modalLeaveForm.date, type: "sick", days: sickVal, note: modalLeaveForm.note, status: "Approved" });
    if (annualVal > 0) newRecords.push({ id: Date.now().toString() + "_a", date: modalLeaveForm.date, type: "annual", days: annualVal, note: modalLeaveForm.note, status: "Approved" });
    if (personalVal > 0) newRecords.push({ id: Date.now().toString() + "_p", date: modalLeaveForm.date, type: "personal", days: personalVal, note: modalLeaveForm.note, status: "Approved" });

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== selectedEmployee.id) return emp;
        const updatedLeaves = [...(emp.leaves || []), ...newRecords];
        setSelectedEmployee({ ...emp, leaves: updatedLeaves });
        return { ...emp, leaves: updatedLeaves };
      })
    );

    setModalLeaveForm({ date: "", sick: "", annual: "", personal: "", note: "" });
    toast.success("Leave record added!");
  };

  const handleDeleteLeave = (empId: string, leaveId: string) => {
    if (confirm("Delete this leave record?")) {
      setEmployees((prev) =>
        prev.map((emp) => {
          if (emp.id !== empId) return emp;
          const updatedLeaves = emp.leaves.filter((l) => l.id !== leaveId);
          if (selectedEmployee && selectedEmployee.id === empId) {
            setSelectedEmployee({ ...selectedEmployee, leaves: updatedLeaves });
          }
          return { ...emp, leaves: updatedLeaves };
        })
      );
      toast.success("Leave record deleted");
    }
  };

  const handleDeleteEmployee = (empId: string) => {
    if (confirm("Delete this employee profile?")) {
      setEmployees((prev) => prev.filter((e) => e.id !== empId));
      if (selectedEmployee?.id === empId) setSelectedEmployee(null);
      toast.success("Employee deleted");
    }
  };

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

  const handleUpdateQuota = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== editingEmp.id) return emp;
        const updated = {
          ...emp,
          empCode: editEmpCode,
          name: editEmpName,
          nickname: editEmpNickname,
          department: editEmpDept,
          startDate: editEmpStartDate,
          quotas: {
            annualTotal: quotaAnnual,
            sickTotal: quotaSick,
            personalTotal: quotaPersonal,
            carriedOver: quotaCarried,
          },
        };
        if (selectedEmployee?.id === emp.id) setSelectedEmployee(updated);
        return updated;
      })
    );

    setEditingEmp(null);
    toast.success("Profile & quotas updated");
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
                <h1 className="text-base font-extrabold text-white tracking-tight">CEO Leave Management Portal</h1>
                <div className="flex bg-slate-800 p-0.5 rounded border border-slate-700">
                  <button
                    onClick={() => setSelectedYear("2026")}
                    className={`px-2.5 py-0.5 text-xs font-bold rounded transition-colors ${
                      selectedYear === "2026" ? "bg-[#00B5E2] text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    2026
                  </button>
                  <button
                    onClick={() => setSelectedYear("2025")}
                    className={`px-2.5 py-0.5 text-xs font-bold rounded transition-colors ${
                      selectedYear === "2025" ? "bg-[#00B5E2] text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    2025
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">TBS Marketing &bull; Executive Data System</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 text-emerald-400 font-bold bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded-full text-[11px] mr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync Connected
            </div>

            <button
              onClick={handleSyncData}
              disabled={isSyncing}
              className="h-9 px-3 bg-[#68BD24] hover:bg-[#5ca81f] text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Live Data"}
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="h-9 px-3 bg-[#F5A623] hover:bg-[#e0951a] text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import Excel
            </button>

            <button
              onClick={() => setIsAddEmpModalOpen(true)}
              className="h-9 px-3 bg-[#00B5E2] hover:bg-[#0099c4] text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              + Add Employee
            </button>

            <button
              onClick={handleClearAllData}
              className="h-9 px-2.5 bg-rose-600/80 hover:bg-rose-600 text-white font-bold rounded-lg text-xs transition-colors border border-rose-700"
              title="Clear all data"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Executive Metric Cards Strip */}
      <div className="max-w-[1600px] mx-auto px-6 mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Staff</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalEmployeesCount} <span className="text-xs font-semibold text-slate-500">Employees</span></p>
              <p className="text-[11px] text-[#68BD24] font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Across {departments.length - 1} Departments
              </p>
            </div>
            <div className="p-3 bg-sky-50 text-[#00B5E2] rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">On Leave Today</p>
              <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{onLeaveToday.length} <span className="text-xs font-semibold text-slate-500">Staff</span></p>
              <p className="text-[11px] text-slate-500 font-medium mt-1 truncate max-w-[180px]">
                {onLeaveToday.length > 0 ? onLeaveToday.map(e => e.nickname).join(", ") : "No employees on leave today"}
              </p>
            </div>
            <div className="p-3 bg-amber-50 text-[#F5A623] rounded-xl">
              <Palmtree className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quota Warnings</p>
              <p className="text-2xl font-extrabold text-rose-600 mt-0.5">{quotaAlertList.length} <span className="text-xs font-semibold text-slate-500">Alerts</span></p>
              <p className="text-[11px] text-rose-500 font-medium mt-1">
                {quotaAlertList.length > 0 ? "Requires CEO quota review" : "All staff within quota limits"}
              </p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Days Taken ({selectedYear})</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalAllTaken} <span className="text-xs font-semibold text-slate-500">Days</span></p>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Sick: {totalSickTaken}d | Annual: {totalAnnualTaken}d | Pers: {totalPersonalTaken}d
              </p>
            </div>
            <div className="p-3 bg-emerald-50 text-[#68BD24] rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 3. Main Master Executive Datatable Container */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          
          {/* Department Filters & Search Toolbar */}
          <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Department Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto no-scrollbar py-0.5">
              {departments.map((dept) => {
                const count = dept === "All" ? employees.length : employees.filter(e => e.department === dept).length;
                const isActive = selectedDept === dept;

                return (
                  <button
                    key={dept}
                    onClick={() => setSelectedDept(dept)}
                    className={`px-3 py-1.5 text-xs font-extrabold rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[#00B5E2] text-white shadow-xs"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                    }`}
                  >
                    {dept}
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isActive ? "bg-white/25 text-white" : "bg-slate-700 text-slate-300"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input Box */}
            <div className="relative w-full md:w-64 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search name, nickname, code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 rounded-lg focus-visible:ring-[#00B5E2]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white">âœ•</button>
              )}
            </div>
          </div>

          {/* Table Directory */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-300">
                  <th className="py-3 px-3 text-left border-r border-slate-200 w-24">Code</th>
                  <th className="py-3 px-4 text-left border-r border-slate-200">Employee Name</th>
                  <th className="py-3 px-3 text-left border-r border-slate-200 w-28">Department</th>
                  <th className="py-3 px-3 text-left border-r border-slate-200 w-28">Start Date</th>
                  <th className="py-3 px-3 text-center border-r border-slate-200 bg-rose-50 text-rose-900 w-32">Sick Leave</th>
                  <th className="py-3 px-3 text-center border-r border-slate-200 bg-amber-50 text-amber-900 w-36">Annual Leave</th>
                  <th className="py-3 px-3 text-center border-r border-slate-200 bg-sky-50 text-sky-900 w-36">Personal Leave</th>
                  <th className="py-3 px-3 text-center border-r border-slate-200 w-32">Annual Remain</th>
                  <th className="py-3 px-3 text-center border-r border-slate-200 w-28">Status</th>
                  <th className="py-3 px-3 text-center w-36">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400 font-medium italic">
                      No matching employee records found.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const sickTaken = sumLeaves(emp.leaves, "sick", selectedYear);
                    const annualTaken = sumLeaves(emp.leaves, "annual", selectedYear);
                    const personalTaken = sumLeaves(emp.leaves, "personal", selectedYear);
                    const annualGranted = emp.quotas.annualTotal + emp.quotas.carriedOver;
                    const annualRemain = annualGranted - annualTaken;
                    const sickRemain = emp.quotas.sickTotal - sickTaken;
                    const personalRemain = emp.quotas.personalTotal - personalTaken;

                    const isOver = annualRemain < 0 || sickRemain < 0 || personalRemain < 0;

                    return (
                      <tr 
                        key={emp.id} 
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                        onClick={() => setSelectedEmployee(emp)}
                      >
                        <td className="py-3 px-3 font-mono font-extrabold text-slate-600 border-r border-slate-200">{emp.empCode}</td>
                        <td className="py-3 px-4 border-r border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-extrabold flex items-center justify-center text-xs shadow-xs shrink-0">
                              {emp.nickname.charAt(0)}
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 text-sm group-hover:text-[#00B5E2] transition-colors">{emp.name} <span className="text-amber-600">({emp.nickname})</span></div>
                              <div className="text-[10px] text-slate-400">{emp.leaves ? emp.leaves.filter(l => l.date.includes(selectedYear)).length : 0} leave records</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200">
                          <span className="px-2.5 py-1 bg-slate-100 font-bold text-slate-700 rounded text-[11px] border border-slate-200">{emp.department}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 border-r border-slate-200 font-semibold">{formatDate(emp.startDate)}</td>
                        <td className="py-3 px-3 text-center border-r border-slate-200 bg-rose-50/30">
                          <div className="font-extrabold text-rose-700 text-xs">{sickTaken} / {emp.quotas.sickTotal}d</div>
                        </td>
                        <td className="py-3 px-3 text-center border-r border-slate-200 bg-amber-50/30">
                          <div className="font-extrabold text-amber-900 text-xs">{annualTaken} / {annualGranted}d</div>
                        </td>
                        <td className="py-3 px-3 text-center border-r border-slate-200 bg-sky-50/30">
                          <div className="font-extrabold text-sky-900 text-xs">{personalTaken} / {emp.quotas.personalTotal}d</div>
                        </td>
                        <td className={`py-3 px-3 text-center font-extrabold border-r border-slate-200 ${annualRemain < 0 ? "text-rose-600 bg-rose-50" : "text-slate-900"}`}>
                          {annualRemain} days
                        </td>
                        <td className="py-3 px-3 text-center border-r border-slate-200">
                          {isOver ? (
                            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 font-extrabold rounded-full text-[10px] border border-rose-200">Over Quota</span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 font-extrabold rounded-full text-[10px] border border-emerald-200">Normal</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp); }}
                            className="px-3 py-1 bg-[#00B5E2] hover:bg-[#0099c4] text-white font-extrabold rounded transition-colors text-xs shadow-xs"
                          >
                            View Sheet &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
                              <button onClick={() => handleDeleteLeave(selectedEmployee.id, l.id)} className="text-slate-400 hover:text-rose-600 font-bold">âœ•</button>
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

      {/* Add Employee Modal */}
      {isAddEmpModalOpen && (
        <Dialog open={isAddEmpModalOpen} onOpenChange={setIsAddEmpModalOpen}>
          <DialogContent className="max-w-md bg-white rounded-xl p-6 border border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-extrabold text-slate-900">Add New Employee Profile</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">Create a new employee profile in the system</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddEmployeeSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Employee Code *</label>
                  <Input placeholder="TBS-040" value={newEmpCode} onChange={(e) => setNewEmpCode(e.target.value)} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Department *</label>
                  <select value={newEmpDept} onChange={(e) => setNewEmpDept(e.target.value)} className="w-full h-9 text-xs border rounded-md px-2 mt-1">
                    {departments.filter(d => d !== "All").map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Full Name *</label>
                  <Input placeholder="John Doe" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Nickname *</label>
                  <Input placeholder="John" value={newEmpNickname} onChange={(e) => setNewEmpNickname(e.target.value)} className="h-9 text-xs mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Annual Quota</label>
                  <Input type="number" value={newEmpAnnual} onChange={(e) => setNewEmpAnnual(Number(e.target.value))} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Sick Quota</label>
                  <Input type="number" value={newEmpSick} onChange={(e) => setNewEmpSick(Number(e.target.value))} className="h-9 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Personal Quota</label>
                  <Input type="number" value={newEmpPersonal} onChange={(e) => setNewEmpPersonal(Number(e.target.value))} className="h-9 text-xs mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" onClick={() => setIsAddEmpModalOpen(false)} className="h-9 text-xs">Cancel</Button>
                <Button type="submit" className="h-9 text-xs bg-[#00B5E2] hover:bg-[#0099c4] text-white font-bold">Save Employee</Button>
              </div>
            </form>
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
      {isSheetSelectModalOpen && (
        <Dialog open={isSheetSelectModalOpen} onOpenChange={setIsSheetSelectModalOpen}>
          <DialogContent className="max-w-md bg-white rounded-xl p-6 shadow-xl border border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Select Sheet Tab</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                The file <strong>{currentImportFileName}</strong> contains multiple sheets. Choose which tab to import:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-3 max-h-60 overflow-y-auto">
              {sheetNames.map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    if (pendingWorkbook) {
                      processSheet(pendingWorkbook, name, currentImportFileName);
                      setIsSheetSelectModalOpen(false);
                      setPendingWorkbook(null);
                    }
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-[#00B5E2] hover:bg-sky-50 transition-all font-bold text-xs text-slate-800 flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#00B5E2]" />
                    {name}
                  </span>
                  <span className="text-[10px] text-[#00B5E2] opacity-0 group-hover:opacity-100 font-bold">â†’ Import</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-3">
              <Button variant="ghost" onClick={() => setIsSheetSelectModalOpen(false)} className="h-9 text-xs">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Column Mapping Preview Dialog */}
      {isPreviewOpen && (
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-4xl bg-white rounded-xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Configure Column Mapping ({currentImportFileName})</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">Match your Excel/CSV columns to system fields before importing.</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Emp Code / ID</label>
                  <select value={mapIdIdx} onChange={(e) => setMapIdIdx(Number(e.target.value))} className="w-full h-8 text-xs border border-slate-300 rounded bg-white px-2 font-medium">
                    <option value={-1}>-- Auto Generate --</option>
                    {previewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">First Name</label>
                  <select value={mapFnIdx} onChange={(e) => setMapFnIdx(Number(e.target.value))} className="w-full h-8 text-xs border border-slate-300 rounded bg-white px-2 font-medium">
                    <option value={-1}>-- None --</option>
                    {previewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Last Name</label>
                  <select value={mapLnIdx} onChange={(e) => setMapLnIdx(Number(e.target.value))} className="w-full h-8 text-xs border border-slate-300 rounded bg-white px-2 font-medium">
                    <option value={-1}>-- None --</option>
                    {previewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Nickname</label>
                  <select value={mapNickIdx} onChange={(e) => setMapNickIdx(Number(e.target.value))} className="w-full h-8 text-xs border border-slate-300 rounded bg-white px-2 font-medium">
                    <option value={-1}>-- None --</option>
                    {previewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Department</label>
                  <select value={mapDeptIdx} onChange={(e) => setMapDeptIdx(Number(e.target.value))} className="w-full h-8 text-xs border border-slate-300 rounded bg-white px-2 font-medium">
                    <option value={-1}>-- Default (General) --</option>
                    {previewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">Raw Sheet Data Preview (First 5 Rows):</h4>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        {previewHeaders.map((h, i) => (
                          <th key={i} className="py-2 px-3 text-left font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {previewGrid.slice(0, 5).map((row, rIdx) => (
                        <tr key={rIdx} className={rIdx === 0 ? "bg-amber-50/50 font-bold" : ""}>
                          {previewHeaders.map((_, cIdx) => (
                            <td key={cIdx} className="py-1.5 px-3 text-slate-600 border-r border-slate-200 whitespace-nowrap max-w-[150px] truncate">
                              {row[cIdx] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-slate-400 font-medium">Total {previewGrid.length - 1} data rows detected</span>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="h-9 text-xs">Cancel</Button>
                  <Button onClick={confirmColumnMappingImport} className="h-9 text-xs bg-[#68BD24] hover:bg-[#5ca81f] text-slate-950 font-bold">Confirm & Import Data</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogContent className="max-w-lg bg-white rounded-xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Import Excel / Google Sheet</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">Upload .xlsx or paste text directly</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="text-xs border p-2 rounded w-full" />
              <div className="text-center text-xs text-slate-400 font-bold">OR PASTE TEXT</div>
              <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste sheet content here..." className="h-32 text-xs" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsImportModalOpen(false)} className="h-9 text-xs">Cancel</Button>
                <Button onClick={handleImportPastedText} className="h-9 text-xs bg-[#00B5E2]">Process Text</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
