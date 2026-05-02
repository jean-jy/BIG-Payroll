"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { fetchStaff, fetchBranches, fetchDoctorSchedules, fetchClinicClosures } from "@/lib/db";
import { Staff, Branch, DoctorSchedule, ClinicClosure, ClosureType, LeaveType } from "@/lib/types";
import Loading from "@/components/Loading";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: "AL", medical: "MC", off: "OFF", leave: "OL",
};

const CLOSURE_STYLES: Record<ClosureType, { bg: string; text: string; label: string }> = {
  public_holiday: { bg: "bg-orange-500/15", text: "text-orange-300", label: "PH" },
  clinic_closed:  { bg: "bg-red-500/15",    text: "text-red-300",    label: "CLOSED" },
};

const BRANCH_LEAVE_STYLES: { match: string[]; color: string }[] = [
  { match: ["setiawalk"],         color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { match: ["jadehills", "jade"], color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { match: ["kepong"],            color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
];
function getBranchLeaveColor(branchName: string) {
  const n = branchName.toLowerCase();
  return BRANCH_LEAVE_STYLES.find((s) => s.match.some((m) => n.includes(m)))?.color ?? BRANCH_LEAVE_STYLES[0].color;
}

const BRANCH_HEADER: Record<string, string> = {
  a: "text-teal-400 border-teal-500/40",
  b: "text-indigo-400 border-indigo-500/40",
  c: "text-rose-400 border-rose-500/40",
};

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatMonthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-MY", { month: "long", year: "numeric" });
}
function getDaysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const days: Date[] = [];
  const d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return toMonthStr(new Date(y, m - 1 + delta, 1));
}

const TODAY = new Date().toISOString().slice(0, 10);

export default function SchedulePrintPage() {
  return <Suspense><SchedulePrintInner /></Suspense>;
}

function SchedulePrintInner() {
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => searchParams.get("month") ?? toMonthStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [closures, setClosures] = useState<ClinicClosure[]>([]);
  const [loading, setLoading] = useState(true);

  // Section visibility toggles
  const [showBranches, setShowBranches] = useState<Record<string, boolean>>({});
  const [showLeave, setShowLeave] = useState(true);

  const dentists = useMemo(
    () => staff.filter((s) => s.isActive && (s.role === "resident_dentist" || s.role === "locum_dentist")),
    [staff],
  );

  useEffect(() => {
    (async () => {
      const [s, b] = await Promise.all([fetchStaff(), fetchBranches()]);
      setStaff(s);
      setBranches(b);
      // Default all branches to visible
      const defaults: Record<string, boolean> = {};
      b.forEach((br) => { defaults[br.id] = true; });
      setShowBranches(defaults);
    })();
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    Promise.all([fetchDoctorSchedules(month), fetchClinicClosures(month)])
      .then(([sc, cl]) => { setSchedules(sc); setClosures(cl); })
      .finally(() => setLoading(false));
  }, [month]);

  const { days, firstDow, totalCells } = useMemo(() => {
    const d = getDaysInMonth(month);
    const fdow = d[0].getDay();
    return { days: d, firstDow: fdow, totalCells: Math.ceil((fdow + d.length) / 7) * 7 };
  }, [month]);

  const scheduleMap = useMemo(() => {
    const map: Record<string, Record<string, DoctorSchedule>> = {};
    for (const s of schedules) {
      if (!map[s.date]) map[s.date] = {};
      map[s.date][s.staffId] = s;
    }
    return map;
  }, [schedules]);

  const closureMap = useMemo(() => {
    const map: Record<string, ClinicClosure> = {};
    for (const c of closures) map[c.date] = c;
    return map;
  }, [closures]);

  function renderBranchCalendar(branch: Branch) {
    const ck = branch.colorKey ?? "a";
    return (
      <div key={branch.id} className="mb-6 print:mb-4">
        <div className={`flex items-center gap-3 px-3 py-2 border-b-2 mb-1 ${BRANCH_HEADER[ck]}`}>
          <span className="font-display font-700 text-sm uppercase tracking-widest">{branch.name}</span>
          <span className="text-xs text-[#7B91BC]">{branch.location}</span>
        </div>
        <div className="grid grid-cols-7 border-l border-t border-[#1E2D4A]">
          {DAYS.map((d) => (
            <div key={d} className="py-1.5 text-center text-[9px] font-display font-700 uppercase tracking-widest text-[#7B91BC] border-r border-b border-[#1E2D4A] bg-[#070D1A]">
              {d}
            </div>
          ))}
          {Array.from({ length: totalCells }).map((_, i) => {
            const dayIndex = i - firstDow;
            const day = dayIndex >= 0 && dayIndex < days.length ? days[dayIndex] : null;
            const dateStr = day ? day.toISOString().slice(0, 10) : null;
            const isToday = dateStr === TODAY;
            const closure = dateStr ? closureMap[dateStr] : null;
            const closureStyle = closure ? CLOSURE_STYLES[closure.type] : null;
            const isWeekend = day ? day.getDay() === 0 || day.getDay() === 6 : false;
            const dutyDrs = dateStr
              ? Object.values(scheduleMap[dateStr] ?? {}).filter((s) => !s.isLeave && s.branchId === branch.id)
              : [];

            return (
              <div
                key={i}
                className={`min-h-[72px] border-r border-b border-[#1E2D4A] p-1.5 flex flex-col gap-0.5 ${
                  closure ? closureStyle!.bg :
                  !day ? "bg-[#04080F]/40" :
                  isWeekend ? "bg-[#0D1526]/30" : ""
                }`}
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                        isToday ? "bg-teal-600 text-white font-700" :
                        closure ? `${closureStyle!.text} font-700` :
                        "text-[#7B91BC]"
                      }`}>
                        {day.getDate()}
                      </span>
                      {closure && (
                        <span className={`text-[8px] font-700 uppercase ${closureStyle!.text} truncate max-w-[65%]`}>
                          {closure.name}
                        </span>
                      )}
                    </div>
                    {dutyDrs.map((sch) => {
                      const dr = dentists.find((d) => d.id === sch.staffId);
                      return (
                        <div key={sch.id} className={`text-[9px] font-600 px-1 py-0.5 rounded truncate ${
                          ck === "a" ? "bg-teal-600/20 text-teal-300" :
                          ck === "b" ? "bg-indigo-600/20 text-indigo-300" :
                          "bg-rose-600/20 text-rose-300"
                        }`}>
                          {dr?.name ?? "—"}
                        </div>
                      );
                    })}
                    {dutyDrs.length === 0 && !closure && (
                      <span className="text-[8px] text-[#1E2D4A] mt-auto">—</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderLeaveCalendar() {
    return (
      <div className="mb-6 print:mb-4">
        <div className="flex items-center gap-3 px-3 py-2 border-b-2 border-amber-500/40 mb-1">
          <span className="font-display font-700 text-sm uppercase tracking-widest text-amber-400">Dr On Leave</span>
        </div>
        <div className="grid grid-cols-7 border-l border-t border-[#1E2D4A]">
          {DAYS.map((d) => (
            <div key={d} className="py-1.5 text-center text-[9px] font-display font-700 uppercase tracking-widest text-[#7B91BC] border-r border-b border-[#1E2D4A] bg-[#070D1A]">
              {d}
            </div>
          ))}
          {Array.from({ length: totalCells }).map((_, i) => {
            const dayIndex = i - firstDow;
            const day = dayIndex >= 0 && dayIndex < days.length ? days[dayIndex] : null;
            const dateStr = day ? day.toISOString().slice(0, 10) : null;
            const isToday = dateStr === TODAY;
            const isWeekend = day ? day.getDay() === 0 || day.getDay() === 6 : false;
            const closure = dateStr ? closureMap[dateStr] : null;
            const closureStyle = closure ? CLOSURE_STYLES[closure.type] : null;
            const leaveDrs = dateStr
              ? Object.values(scheduleMap[dateStr] ?? {}).filter((s) => s.isLeave)
              : [];

            return (
              <div
                key={i}
                className={`min-h-[72px] border-r border-b border-[#1E2D4A] p-1.5 flex flex-col gap-0.5 ${
                  closure ? closureStyle!.bg :
                  !day ? "bg-[#04080F]/40" :
                  isWeekend ? "bg-[#0D1526]/30" : ""
                }`}
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                        isToday ? "bg-teal-600 text-white font-700" :
                        closure ? `${closureStyle!.text} font-700` :
                        "text-[#7B91BC]"
                      }`}>
                        {day.getDate()}
                      </span>
                      {closure && (
                        <span className={`text-[8px] font-700 uppercase ${closureStyle!.text} truncate max-w-[65%]`}>
                          {closure.name}
                        </span>
                      )}
                    </div>
                    {leaveDrs.map((sch) => {
                      const dr = dentists.find((d) => d.id === sch.staffId);
                      const branch = branches.find((b) => b.id === sch.branchId);
                      const tag = sch.leaveType ? LEAVE_LABELS[sch.leaveType] : "";
                      return (
                        <div key={sch.id} className={`text-[9px] font-600 px-1 py-0.5 rounded border truncate ${getBranchLeaveColor(branch?.name ?? "")}`}>
                          {dr?.name ?? "—"}{tag ? ` · ${tag}` : ""}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (loading) return <Loading />;

  return (
    <>
      {/* Hide sidebar, nav, and toolbar when printing */}
      <style>{`
        @media print {
          aside, nav { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .print-hide { display: none !important; }
          body { background: white !important; color: black !important; }
          @page { margin: 12mm; size: A4 portrait; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Toolbar — hidden on print */}
        <div className="print-hide flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn btn-ghost p-2"><ChevronLeft size={16} /></button>
              <span className="font-display font-600 text-sm text-[#E8F0FF] min-w-[148px] text-center">{formatMonthLabel(month)}</span>
              <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn btn-ghost p-2"><ChevronRight size={16} /></button>
              <button onClick={() => setMonth(toMonthStr(new Date()))} className="btn btn-ghost text-xs px-3">Today</button>
            </div>
            <button onClick={() => window.print()} className="btn btn-primary gap-2">
              <Printer size={15} /> Print / Save as PDF
            </button>
          </div>

          {/* Section toggles */}
          <div className="flex items-center gap-2 flex-wrap bg-[#0D1526] border border-[#1E2D4A] rounded-xl px-4 py-3">
            <span className="text-xs text-[#7B91BC] font-600 uppercase tracking-wider mr-1">Include:</span>
            {branches.map((br) => {
              const ck = br.colorKey ?? "a";
              const activeColor = ck === "a" ? "bg-teal-600/20 border-teal-500/50 text-teal-300" : ck === "b" ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300" : "bg-rose-600/20 border-rose-500/50 text-rose-300";
              const on = showBranches[br.id] ?? true;
              return (
                <button
                  key={br.id}
                  onClick={() => setShowBranches((p) => ({ ...p, [br.id]: !p[br.id] }))}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-600 transition-colors ${on ? activeColor : "border-[#1E2D4A] text-[#4A5A7A] bg-transparent"}`}
                >
                  {br.name}
                </button>
              );
            })}
            <button
              onClick={() => setShowLeave((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-600 transition-colors ${showLeave ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "border-[#1E2D4A] text-[#4A5A7A] bg-transparent"}`}
            >
              Dr On Leave
            </button>
          </div>
        </div>

        {/* Print header — always visible */}
        <div className="mb-6 pb-3 border-b border-[#1E2D4A]">
          <h1 className="font-display font-700 text-xl text-[#E8F0FF]">BIG Dental — Dentist Schedule</h1>
          <p className="text-sm text-[#7B91BC] mt-0.5">{formatMonthLabel(month)}</p>
        </div>

        {/* Branch calendars — shown based on toggle */}
        {branches.filter((b) => showBranches[b.id] ?? true).map((b) => renderBranchCalendar(b))}

        {/* Leave calendar — shown based on toggle */}
        {showLeave && renderLeaveCalendar()}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-[#7B91BC] border-t border-[#1E2D4A] pt-3">
          <span className="font-700 text-[#E8F0FF]">Leave:</span>
          {(Object.keys(LEAVE_LABELS) as LeaveType[]).map((lt) => (
            <span key={lt}><span className="font-mono font-700">{LEAVE_LABELS[lt]}</span> = {lt === "annual" ? "Annual Leave" : lt === "medical" ? "Medical Leave" : lt === "off" ? "Day Off" : "On Leave"}</span>
          ))}
          <span className="font-700 text-orange-400 ml-4">PH</span><span>= Public Holiday</span>
          <span className="font-700 text-red-400">CLOSED</span><span>= Clinic Closed</span>
        </div>
      </div>
    </>
  );
}
