"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { fetchStaff, fetchBranches, fetchAttendanceRecords, fetchDoctorSchedules } from "@/lib/db";
import { Staff, Branch, AttendanceRecord, DoctorSchedule, LeaveType } from "@/lib/types";
import Loading from "@/components/Loading";

const LEAVE_TYPES: LeaveType[] = ["annual", "medical", "off", "leave"];
const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: "AL", medical: "MC", off: "OFF", leave: "OL",
};
const LEAVE_FULL: Record<LeaveType, string> = {
  annual: "Annual Leave", medical: "Medical Leave", off: "Day Off", leave: "On Leave",
};
const LEAVE_COLORS: Record<LeaveType, string> = {
  annual: "text-amber-300",
  medical: "text-rose-300",
  off: "text-slate-300",
  leave: "text-purple-300",
};
const ROLE_SHORT: Record<string, string> = {
  resident_dentist: "Resident Dr",
  locum_dentist: "Locum Dr",
  fulltime_da: "FT DSA",
  fulltime_dsa_monthly: "FT DSA (M)",
  parttime_da: "PT DSA",
  supervisor: "Supervisor",
};
const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatMonthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-MY", { month: "long", year: "numeric" });
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return toMonthStr(new Date(y, m - 1 + delta, 1));
}
function workingDaysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  let count = 0;
  while (d.getMonth() === m - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

type StaffSummary = {
  staff: Staff;
  branch?: Branch;
  workDays: number;
  leaves: Record<LeaveType, number>;
  totalLeave: number;
};

export default function AttendanceSummaryPage() {
  const [month, setMonth] = useState(toMonthStr(new Date()));
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [drSchedules, setDrSchedules] = useState<DoctorSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterRole, setFilterRole] = useState("all");

  useEffect(() => {
    (async () => {
      const [s, b] = await Promise.all([fetchStaff(), fetchBranches()]);
      setAllStaff(s); setBranches(b);
    })();
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    Promise.all([fetchAttendanceRecords(month), fetchDoctorSchedules(month)])
      .then(([att, sched]) => { setAttendance(att); setDrSchedules(sched); })
      .finally(() => setLoading(false));
  }, [month]);

  const summaries = useMemo<StaffSummary[]>(() => {
    const activeStaff = allStaff.filter((s) => s.isActive);
    return activeStaff.map((s) => {
      const branch = branches.find((b) => b.id === s.branchId);
      const isDentist = s.role === "resident_dentist" || s.role === "locum_dentist";

      let workDays = 0;
      const leaves: Record<LeaveType, number> = { annual: 0, medical: 0, off: 0, leave: 0 };

      if (isDentist) {
        const mySchedules = drSchedules.filter((d) => d.staffId === s.id);
        workDays = mySchedules.filter((d) => !d.isLeave).length;
        for (const d of mySchedules.filter((d) => d.isLeave)) {
          if (d.leaveType) leaves[d.leaveType]++;
        }
      } else {
        const myAtt = attendance.filter((a) => a.staffId === s.id);
        workDays = myAtt.filter((a) => !a.isLeave).length;
        for (const a of myAtt.filter((a) => a.isLeave)) {
          if (a.leaveType) leaves[a.leaveType]++;
        }
      }

      const totalLeave = Object.values(leaves).reduce((s, n) => s + n, 0);
      return { staff: s, branch, workDays, leaves, totalLeave };
    });
  }, [allStaff, branches, attendance, drSchedules]);

  const filtered = useMemo(() => summaries.filter((s) => {
    if (filterBranch !== "all" && s.staff.branchId !== filterBranch) return false;
    if (filterRole !== "all" && s.staff.role !== filterRole) return false;
    return true;
  }), [summaries, filterBranch, filterRole]);

  const expectedDays = workingDaysInMonth(month);
  const totalWork = filtered.reduce((s, r) => s + r.workDays, 0);
  const totalLeave = filtered.reduce((s, r) => s + r.totalLeave, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 lg:pb-8">
      {/* Header */}
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/attendance" className="flex items-center gap-1.5 text-xs text-[#7B91BC] hover:text-teal-400 mb-2 transition-colors">
            <ArrowLeft size={12} /> Back to Attendance
          </Link>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Monthly Summary</h1>
          <p className="text-[#7B91BC] text-sm mt-1">Working days · Leave breakdown · All staff</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn btn-ghost p-2"><ChevronLeft size={16} /></button>
          <span className="font-display font-600 text-sm text-[#E8F0FF] min-w-[148px] text-center">{formatMonthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn btn-ghost p-2"><ChevronRight size={16} /></button>
          <button onClick={() => setMonth(toMonthStr(new Date()))} className="btn btn-ghost text-xs px-3">Today</button>
        </div>
      </div>

      {/* Stats */}
      <div className="fade-up delay-1 grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-[#7B91BC] text-xs uppercase tracking-wider mb-2">Expected Working Days</p>
          <p className="font-mono text-lg font-bold text-[#E8F0FF]">{expectedDays} days</p>
          <p className="text-[10px] text-[#7B91BC] mt-1">Mon–Fri excl. weekends</p>
        </div>
        <div className="stat-card">
          <p className="text-[#7B91BC] text-xs uppercase tracking-wider mb-2">Total Days Recorded</p>
          <p className="font-mono text-lg font-bold text-teal-400">{totalWork}</p>
          <p className="text-[10px] text-[#7B91BC] mt-1">Across {filtered.length} staff shown</p>
        </div>
        <div className="stat-card">
          <p className="text-[#7B91BC] text-xs uppercase tracking-wider mb-2">Total Leave Days</p>
          <p className="font-mono text-lg font-bold text-amber-400">{totalLeave}</p>
          <p className="text-[10px] text-[#7B91BC] mt-1">All leave types combined</p>
        </div>
      </div>

      {/* Filters */}
      <div className="fade-up delay-2 flex gap-3 flex-wrap">
        <select className="inp w-auto" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
          <option value="all">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="inp w-auto" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="all">All Roles</option>
          {Object.entries(ROLE_SHORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Summary table */}
      {loading ? <Loading /> : (
        <div className="fade-up delay-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Branch</th>
                  <th className="text-center">Working Days</th>
                  {LEAVE_TYPES.map((lt) => (
                    <th key={lt} className="text-center">
                      <span className={`font-mono font-700 ${LEAVE_COLORS[lt]}`}>{LEAVE_LABELS[lt]}</span>
                      <span className="block text-[9px] font-normal text-[#7B91BC] normal-case tracking-normal">{LEAVE_FULL[lt]}</span>
                    </th>
                  ))}
                  <th className="text-center">Total Leave</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ staff: s, branch, workDays, leaves, totalLeave }) => (
                  <tr key={s.id}>
                    <td>
                      <p className="text-sm font-medium text-[#E8F0FF]">{s.name}</p>
                      <p className="text-xs text-[#7B91BC]">{ROLE_SHORT[s.role] ?? s.role}</p>
                    </td>
                    <td>
                      {branch && (
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BRANCH_DOT[branch.colorKey] }} />
                          <span className="text-sm text-[#7B91BC]">{branch.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="font-mono font-700 text-teal-400 text-sm">{workDays}</span>
                      <span className="text-[10px] text-[#7B91BC] ml-1">/ {expectedDays}</span>
                    </td>
                    {LEAVE_TYPES.map((lt) => (
                      <td key={lt} className="text-center">
                        {leaves[lt] > 0
                          ? <span className={`font-mono font-700 text-sm ${LEAVE_COLORS[lt]}`}>{leaves[lt]}</span>
                          : <span className="text-[#1E2D4A]">—</span>}
                      </td>
                    ))}
                    <td className="text-center">
                      {totalLeave > 0
                        ? <span className="font-mono font-700 text-sm text-amber-400">{totalLeave}</span>
                        : <span className="text-[#7B91BC]">0</span>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-[#7B91BC]">No active staff found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-[#1E2D4A] flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#7B91BC]">
            <span className="font-700 text-[#E8F0FF]">Legend:</span>
            {LEAVE_TYPES.map((lt) => (
              <span key={lt}><span className={`font-mono font-700 ${LEAVE_COLORS[lt]}`}>{LEAVE_LABELS[lt]}</span> = {LEAVE_FULL[lt]}</span>
            ))}
            <span className="text-[#4A5A7A] ml-4">· Dentist days from Schedule · DSA days from Attendance records</span>
          </div>
        </div>
      )}
    </div>
  );
}
