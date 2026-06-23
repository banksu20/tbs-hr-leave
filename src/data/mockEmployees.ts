export interface LeaveRecord {
  id: string;
  date: string; // "YYYY-MM-DD"
  type: "sick" | "annual" | "personal";
  days: number;
  note: string;
  status: "Approved" | "Pending" | "Rejected";
}

export interface Employee {
  id: string;
  name: string;
  nickname: string;
  department: string;
  startDate: string;
  quotas: {
    annualTotal: number;
    sickTotal: number;
    personalTotal: number;
    carriedOver: number;
  };
  leaves: LeaveRecord[];
}

export const initialEmployees: Employee[] = [
  {
    id: "emp-1",
    name: "Orathai Sangwannum",
    nickname: "Orn",
    department: "Telesales",
    startDate: "2025-01-27",
    quotas: {
      annualTotal: 12,
      sickTotal: 30,
      personalTotal: 3,
      carriedOver: 0,
    },
    leaves: [
      { id: "l-1-1", date: "2026-01-19", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-1-2", date: "2026-03-02", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-1-3", date: "2026-03-23", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-1-4", date: "2026-04-16", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-1-5", date: "2026-04-17", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-1-6", date: "2026-04-23", type: "personal", days: 0.5, note: "am - baby", status: "Approved" },
    ],
  },
  {
    id: "emp-2",
    name: "Patsawee Prairumphueng",
    nickname: "Satang",
    department: "Web Developer",
    startDate: "2025-01-27",
    quotas: {
      annualTotal: 14,
      sickTotal: 30,
      personalTotal: 3,
      carriedOver: 2,
    },
    leaves: [
      { id: "l-2-1", date: "2026-01-12", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-2-2", date: "2026-01-13", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-2-3", date: "2026-01-07", type: "sick", days: 1, note: "stomachache", status: "Approved" },
      { id: "l-2-4", date: "2026-02-04", type: "personal", days: 0.5, note: "pm - fixing electric", status: "Approved" },
      { id: "l-2-5", date: "2026-02-06", type: "annual", days: 0.5, note: "pm", status: "Approved" },
      { id: "l-2-6", date: "2026-02-10", type: "sick", days: 1, note: "fever", status: "Approved" },
      { id: "l-2-7", date: "2026-03-19", type: "annual", days: 0.5, note: "pm", status: "Approved" },
      { id: "l-2-8", date: "2026-05-25", type: "annual", days: 1, note: "Japan", status: "Approved" },
      { id: "l-2-9", date: "2026-05-26", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-2-10", date: "2026-05-27", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-2-11", date: "2026-04-02", type: "sick", days: 0.5, note: "menstrual cramps", status: "Approved" },
      { id: "l-2-12", date: "2026-04-30", type: "personal", days: 0.5, note: "am - renewing ID", status: "Approved" },
      { id: "l-2-13", date: "2026-04-30", type: "annual", days: 0.5, note: "pm", status: "Approved" },
      { id: "l-2-14", date: "2026-05-12", type: "sick", days: 1, note: "coughing, nauseous", status: "Approved" },
      { id: "l-2-15", date: "2026-05-18", type: "sick", days: 1, note: "See doctor for leg", status: "Approved" },
      { id: "l-2-16", date: "2026-05-28", type: "annual", days: 0.5, note: "Approved", status: "Approved" },
      { id: "l-2-17", date: "2026-06-03", type: "annual", days: 1, note: "Approved", status: "Approved" },
      { id: "l-2-18", date: "2026-06-19", type: "personal", days: 1, note: "seeing dad in hospital", status: "Approved" },
    ],
  },
  {
    id: "emp-3",
    name: "Pim",
    nickname: "Billie",
    department: "UX/UI Designer",
    startDate: "2025-04-21",
    quotas: {
      annualTotal: 15,
      sickTotal: 30,
      personalTotal: 3,
      carriedOver: 2,
    },
    leaves: [
      { id: "l-3-1", date: "2026-01-14", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-3-2", date: "2026-01-20", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-3-3", date: "2026-01-29", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-3-4", date: "2026-02-03", type: "annual", days: 1, note: "sick but used holiday leave as already taken many sick", status: "Approved" },
      { id: "l-3-5", date: "2026-02-04", type: "personal", days: 1, note: "Grandma funeral", status: "Approved" },
      { id: "l-3-6", date: "2026-02-05", type: "personal", days: 1, note: "** **", status: "Approved" },
      { id: "l-3-7", date: "2026-02-06", type: "personal", days: 1, note: "** **", status: "Approved" },
      { id: "l-3-8", date: "2026-02-10", type: "annual", days: 0.5, note: "stomach ache but used holiday leave", status: "Approved" },
      { id: "l-3-9", date: "2026-02-27", type: "personal", days: 0.25, note: "taking care of sister's dog", status: "Approved" },
      { id: "l-3-10", date: "2026-03-02", type: "personal", days: 0.25, note: "A.M - Hospital appointment", status: "Approved" },
      { id: "l-3-11", date: "2026-03-06", type: "sick", days: 0.5, note: "am - sick", status: "Approved" },
      { id: "l-3-12", date: "2026-03-06", type: "annual", days: 0.5, note: "pm - holiday", status: "Approved" },
      { id: "l-3-13", date: "2026-03-11", type: "annual", days: 0.5, note: "am", status: "Approved" },
      { id: "l-3-14", date: "2026-03-17", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-3-15", date: "2026-03-20", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-3-16", date: "2026-03-23", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-3-17", date: "2026-03-26", type: "annual", days: 1, note: "", status: "Approved" },
      { id: "l-3-18", date: "2026-04-03", type: "personal", days: 0.25, note: "bike crash", status: "Approved" },
      { id: "l-3-19", date: "2026-04-08", type: "annual", days: 0.5, note: "am", status: "Approved" },
      { id: "l-3-20", date: "2026-04-16", type: "annual", days: 0.5, note: "pm", status: "Approved" },
      { id: "l-3-21", date: "2026-04-17", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-3-22", date: "2026-04-20", type: "sick", days: 1, note: "", status: "Approved" },
      { id: "l-3-23", date: "2026-04-22", type: "annual", days: 0.5, note: "am", status: "Approved" },
      { id: "l-3-24", date: "2026-05-20", type: "sick", days: 1, note: "am - food poisoning", status: "Approved" },
      { id: "l-3-25", date: "2026-06-02", type: "annual", days: 1, note: "", status: "Approved" },
    ],
  },
  {
    id: "emp-4",
    name: "Tanaporn Somkit",
    nickname: "Mochi",
    department: "Graphic",
    startDate: "2025-06-01",
    quotas: {
      annualTotal: 12,
      sickTotal: 30,
      personalTotal: 3,
      carriedOver: 0,
    },
    leaves: [
      { id: "l-4-1", date: "2026-02-15", type: "annual", days: 2, note: "Family trip", status: "Approved" },
      { id: "l-4-2", date: "2026-05-10", type: "sick", days: 1, note: "Headache", status: "Approved" },
      { id: "l-4-3", date: "2026-06-12", type: "personal", days: 1, note: "Bank business", status: "Pending" },
    ],
  },
  {
    id: "emp-5",
    name: "Kittipot Suksabai",
    nickname: "Job",
    department: "Content",
    startDate: "2025-08-15",
    quotas: {
      annualTotal: 12,
      sickTotal: 30,
      personalTotal: 3,
      carriedOver: 1,
    },
    leaves: [
      { id: "l-5-1", date: "2026-03-10", type: "sick", days: 1, note: "Flu", status: "Approved" },
      { id: "l-5-2", date: "2026-04-05", type: "annual", days: 1, note: "Personal business", status: "Approved" },
      { id: "l-5-3", date: "2026-06-18", type: "annual", days: 0.5, note: "Moving house", status: "Pending" },
    ],
  }
];
