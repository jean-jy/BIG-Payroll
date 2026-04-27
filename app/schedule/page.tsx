"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  AlertCircle,
  Trash2,
  Flag,
} from "lucide-react";
import {
  fetchStaff,
  fetchBranches,
  fetchDoctorSchedules,
  upsertDoctorSchedule,
  deleteDoctorSchedule,
  fetchClinicClosures,
  upsertClinicClosure,
  deleteClinicClosure,
} from "@/lib/db";
import { Staff, Branch, DoctorSchedule, LeaveType, ClinicClosure, ClosureType } from "@/lib/types";
import Loading from "@/components/Loading";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BRANCH_COLORS: Record<string, string> = {
  a: "border-teal-500 text-teal-400",
  b: "border-indigo-500 text-indigo-400",
  c: "border-rose-500 text-rose-400",
};
const BRANCH_ACTIVE: Record<string, string> = {
  a: "bg-teal-600/20 border-teal-500/60 text-teal-300",
  b: "bg-indigo-600/20 border-indigo-500/60 text-indigo-300",
  c: "bg-rose-600/20 border-rose-500/60 text-rose-300",
};
const CHIP_COLORS: Record<string, string> = {
  a: "bg-teal-600/20 text-teal-300 border-teal-500/30",
  b: "bg-indigo-600/20 text-indigo-300 border-indigo-500/30",
  c: "bg-rose-600/20 text-rose-300 border-rose-500/30",
};

const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: "AL", medical: "MC", off: "OFF", leave: "OL",
};
const LEAVE_FULL: Record<LeaveType, string> = {
  annual: "Annual Leave", medical: "Medical Leave", off: "Day Off", leave: "On Leave",
};
const LEAVE_ACTIVE_COLORS: Record<LeaveType, string> = {
  annual: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  medical: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  off: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  leave: "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

const BRANCH_LEAVE_STYLES: { match: string[]; color: string; dot: string }[] = [
  { match: ["setiawalk"],         color: "bg-violet-500/20 text-violet-300 border-violet-500/30",    dot: "bg-violet-400" },
  { match: ["jadehills", "jade"], color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  { match: ["kepong"],            color: "bg-blue-500/20 text-blue-300 border-blue-500/30",           dot: "bg-blue-400" },
];
function getBranchLeaveStyles(branchName: string) {
  const n = branchName.toLowerCase();
  return BRANCH_LEAVE_STYLES.find((s) => s.match.some((m) => n.includes(m))) ?? BRANCH_LEAVE_STYLES[0];
}

const CLOSURE_STYLES: Record<ClosureType, { bg: string; banner: string; dot: string; label: string }> = {
  public_holiday: { bg: "bg-orange-500/8",  banner: "bg-orange-500/20 text-orange-300 border-orange-500/30", dot: "bg-orange-400", label: "Public Holiday" },
  clinic_closed:  { bg: "bg-red-500/8",     banner: "bg-red-500/20 text-red-300 border-red-500/30",          dot: "bg-red-400",    label: "Clinic Closed" },
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

export default function SchedulePage() {
  const [month, setMonth] = useState(toMonthStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [closures, setClosures] = useState<ClinicClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedBranch, setSelectedBranch] = useState("");
  const [dutyModal, setDutyModal] = useState<string | null>(null);
  const [dutyStaffId, setDutyStaffId] = useState("");

  const [leaveModal, setLeaveModal] = useState<string | null>(null);
  const [leaveStaffId, setLeaveStaffId] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [leaveBranchId, setLeaveBranchId] = useState("");

  // Closure modal
  const [closureModal, setClosureModal] = useState<string | null>(null); // date string
  const [closureForm, setClosureForm] = useState({ name: "", type: "public_holiday" as ClosureType });
  const [closureDeleteConfirm, setClosureDeleteConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [modalError, setModalError] = useState("");

  const dentists = useMemo(
    () => staff.filter((s) => s.isActive && (s.role === "resident_dentist" || s.role === "locum_dentist")),
    [staff],
  );

  useEffect(() => {
    (async () => {
      try {
        const [s, b] = await Promise.all([fetchStaff(), fetchBranches()]);
        setStaff(s);
        setBranches(b);
        setSelectedBranch(b[0]?.id ?? "");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError("");
    Promise.all([fetchDoctorSchedules(month), fetchClinicClosures(month)])
      .then(([sc, cl]) => { setSchedules(sc); setClosures(cl); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
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

  const activeBranch = branches.find((b) => b.id === selectedBranch);
  const colorKey = activeBranch?.colorKey ?? "a";

  function dutyForDate(dateStr: string) {
    return Object.values(scheduleMap[dateStr] ?? {}).filter((s) => !s.isLeave && s.branchId === selectedBranch);
  }
  function leaveForDate(dateStr: string) {
    return Object.values(scheduleMap[dateStr] ?? {}).filter((s) => s.isLeave);
  }
  function scheduledIds(dateStr: string): Set<string> {
    return new Set(Object.keys(scheduleMap[dateStr] ?? {}));
  }

  function openDuty(dateStr: string) {
    const avail = dentists.filter((d) => !scheduledIds(dateStr).has(d.id));
    setDutyStaffId(avail[0]?.id ?? "");
    setDutyModal(dateStr);
  }

  async function handleAddDuty() {
    if (!dutyModal || !dutyStaffId) return;
    setSaving(true);
    setError("");
    try {
      const saved = await upsertDoctorSchedule({ staffId: dutyStaffId, date: dutyModal, branchId: selectedBranch, isLeave: false });
      setSchedules((prev) => [...prev.filter((s) => !(s.staffId === dutyStaffId && s.date === dutyModal)), saved]);
      setDutyModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function openLeave(dateStr: string) {
    const avail = dentists.filter((d) => !scheduledIds(dateStr).has(d.id));
    const first = avail[0];
    setLeaveStaffId(first?.id ?? "");
    setLeaveType("annual");
    setLeaveBranchId(first?.branchId ?? branches[0]?.id ?? "");
    setModalError("");
    setLeaveModal(dateStr);
  }

  async function handleAddLeave() {
    if (!leaveModal || !leaveStaffId) return;
    setSaving(true);
    setModalError("");
    try {
      const saved = await upsertDoctorSchedule({
        staffId: leaveStaffId,
        date: leaveModal,
        branchId: leaveBranchId || branches[0]?.id || "",
        isLeave: true,
        leaveType,
      });
      setSchedules((prev) => [...prev.filter((s) => !(s.staffId === leaveStaffId && s.date === leaveModal)), saved]);
      setLeaveModal(null);
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function openClosure(dateStr: string) {
    const existing = closureMap[dateStr];
    setClosureForm({ name: existing?.name ?? "", type: existing?.type ?? "public_holiday" });
    setClosureDeleteConfirm(false);
    setModalError("");
    setClosureModal(dateStr);
  }

  async function handleSaveClosure() {
    if (!closureModal || !closureForm.name.trim()) return;
    setSaving(true);
    setModalError("");
    try {
      const existing = closureMap[closureModal];
      const saved = await upsertClinicClosure({ id: existing?.id, date: closureModal, type: closureForm.type, name: closureForm.name.trim() });
      setClosures((prev) => [...prev.filter((c) => c.date !== closureModal), saved]);
      setClosureModal(null);
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClosure() {
    if (!closureModal) return;
    const existing = closureMap[closureModal];
    if (!existing) return;
    try {
      await deleteClinicClosure(existing.id);
      setClosures((prev) => prev.filter((c) => c.id !== existing.id));
      setClosureModal(null);
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteDoctorSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setRemoveConfirm(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  function renderCalendarGrid(
    getCellItems: (dateStr: string) => DoctorSchedule[],
    onAdd: (dateStr: string) => void,
    addLabel: string,
    chipColor: (sch: DoctorSchedule) => string,
    chipLabel: (sch: DoctorSchedule) => string,
    addHoverColor: string,
  ) {
    return (
      <div className="grid grid-cols-7">
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayIndex = i - firstDow;
          const day = dayIndex >= 0 && dayIndex < days.length ? days[dayIndex] : null;
          const dateStr = day ? day.toISOString().slice(0, 10) : null;
          const isToday = dateStr === TODAY;
          const isWeekend = day ? day.getDay() === 0 || day.getDay() === 6 : false;
          const closure = dateStr ? closureMap[dateStr] : null;
          const closureStyle = closure ? CLOSURE_STYLES[closure.type] : null;
          const items = dateStr ? getCellItems(dateStr) : [];

          return (
            <div
              key={i}
              className={`min-h-[100px] border-r border-b border-[#1E2D4A] p-2 flex flex-col gap-1 ${
                closure ? closureStyle!.bg :
                !day ? "bg-[#04080F]/40" :
                isWeekend ? "bg-[#0D1526]/25" : ""
              }`}
            >
              {day && (
                <>
                  <div className="flex items-center justify-between mb-0.5">
                    {/* Clicking the date number opens the closure modal */}
                    <button
                      onClick={() => openClosure(dateStr!)}
                      className={`text-xs font-mono w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 transition-all ${
                        isToday ? "bg-teal-600 text-white font-700" :
                        closure ? `${closureStyle!.dot} text-white font-700` :
                        "text-[#7B91BC] hover:bg-[#1A2744]"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                    {closure && (
                      <span className={`text-[8px] font-700 uppercase tracking-wide px-1 py-0.5 rounded border truncate max-w-[70%] ${closureStyle!.banner}`}>
                        {closure.name}
                      </span>
                    )}
                  </div>
                  {items.map((sch) => (
                    <div key={sch.id} className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-600 ${chipColor(sch)}`}>
                      <span className="truncate">{chipLabel(sch)}</span>
                      <button onClick={() => setRemoveConfirm(sch.id)} className="opacity-40 hover:opacity-100 flex-shrink-0 transition-opacity">
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => onAdd(dateStr!)}
                    className={`mt-auto flex items-center justify-center gap-1 w-full py-0.5 rounded-lg text-[9px] text-[#7B91BC] border border-dashed border-[#1E2D4A] transition-all ${addHoverColor}`}
                  >
                    <Plus size={9} /> {addLabel}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function DayHeaders() {
    return (
      <div className="grid grid-cols-7 border-b border-[#1E2D4A]">
        {DAYS.map((d) => (
          <div key={d} className="py-3 text-center text-[10px] font-display font-700 uppercase tracking-widest text-[#7B91BC]">{d}</div>
        ))}
      </div>
    );
  }

  if (loading) return <Loading />;

  return (
    <div className="fade-up space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-700 text-2xl text-[#E8F0FF]">Dentist Schedule</h1>
          <p className="text-sm text-[#7B91BC] mt-1">Monthly duty roster by branch · Click any date to mark Public Holiday or Clinic Closed</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn btn-ghost p-2"><ChevronLeft size={16} /></button>
          <span className="font-display font-600 text-sm text-[#E8F0FF] min-w-[148px] text-center">{formatMonthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn btn-ghost p-2"><ChevronRight size={16} /></button>
          <button onClick={() => setMonth(toMonthStr(new Date()))} className="btn btn-ghost text-xs px-3">Today</button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Closure legend */}
      <div className="flex gap-3 flex-wrap -mt-4">
        {(Object.keys(CLOSURE_STYLES) as ClosureType[]).map((ct) => (
          <span key={ct} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-600 ${CLOSURE_STYLES[ct].banner}`}>
            <span className={`w-2 h-2 rounded-full ${CLOSURE_STYLES[ct].dot}`} />
            {CLOSURE_STYLES[ct].label}
          </span>
        ))}
        <span className="text-xs text-[#7B91BC] self-center">— click any date number to mark</span>
      </div>

      {/* Duty Roster Calendar */}
      <div>
        <div className="flex gap-2 mb-4 flex-wrap">
          {branches.map((b) => {
            const ck = b.colorKey ?? "a";
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBranch(b.id)}
                className={`px-5 py-2 rounded-xl text-sm font-600 border transition-all ${
                  b.id === selectedBranch ? BRANCH_ACTIVE[ck] : "bg-[#131E35] text-[#7B91BC] border-[#1E2D4A] hover:border-[#2D4470] hover:text-[#E8F0FF]"
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-3 border-b border-[#1E2D4A] flex items-center gap-3">
            <span className={`text-xs font-display font-700 uppercase tracking-widest ${BRANCH_COLORS[colorKey]}`}>{activeBranch?.name}</span>
            <span className="text-xs text-[#7B91BC]">{activeBranch?.location}</span>
          </div>
          <DayHeaders />
          {renderCalendarGrid(
            dutyForDate, openDuty, "Add Dr",
            () => CHIP_COLORS[colorKey],
            (sch) => dentists.find((d) => d.id === sch.staffId)?.name ?? "Dr",
            "hover:border-teal-500/40 hover:text-teal-400",
          )}
        </div>
      </div>

      {/* Dr On Leave Calendar */}
      <div>
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-3 border-b border-[#1E2D4A] flex items-center gap-4 flex-wrap">
            <span className="text-xs font-display font-700 uppercase tracking-widest text-amber-400">Dr On Leave</span>
            <div className="flex items-center gap-2">
              {BRANCH_LEAVE_STYLES.map(({ match, color, dot }) => (
                <span key={match[0]} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-600 ${color}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                  {match[0].charAt(0).toUpperCase() + match[0].slice(1)}
                </span>
              ))}
            </div>
          </div>
          <DayHeaders />
          {renderCalendarGrid(
            leaveForDate, openLeave, "Add",
            (sch) => getBranchLeaveStyles(branches.find((b) => b.id === sch.branchId)?.name ?? "").color,
            (sch) => {
              const name = dentists.find((d) => d.id === sch.staffId)?.name ?? "Dr";
              const tag = sch.leaveType ? LEAVE_LABELS[sch.leaveType] : "";
              return tag ? `${name} · ${tag}` : name;
            },
            "hover:border-amber-500/40 hover:text-amber-400",
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 px-1">
          {(Object.keys(LEAVE_LABELS) as LeaveType[]).map((lt) => (
            <div key={lt} className="flex items-center gap-1 text-xs text-[#7B91BC]">
              <span className="font-mono font-700 text-[10px]">{LEAVE_LABELS[lt]}</span>
              <span>= {LEAVE_FULL[lt]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Remove schedule confirm */}
      {removeConfirm && (() => {
        const sch = schedules.find((s) => s.id === removeConfirm);
        const dr = dentists.find((d) => d.id === sch?.staffId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setRemoveConfirm(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative glass rounded-2xl w-full max-w-sm p-6 fade-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={16} className="text-rose-400" />
                </div>
                <div>
                  <p className="font-600 text-[#E8F0FF] text-sm">Remove {dr?.name}?</p>
                  <p className="text-xs text-[#7B91BC]">{sch?.date}{sch?.isLeave ? ` · ${sch.leaveType ? LEAVE_FULL[sch.leaveType] : "Leave"}` : ""}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRemoveConfirm(null)} className="btn btn-ghost flex-1">Cancel</button>
                <button onClick={() => handleRemove(removeConfirm)} className="btn btn-danger flex-1">Remove</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Closure modal */}
      {closureModal && (() => {
        const date = new Date(closureModal);
        const existing = closureMap[closureModal];
        const subtitle = `${date.toLocaleString("en-MY", { weekday: "long" })}, ${date.getDate()} ${formatMonthLabel(month)}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setClosureModal(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative glass rounded-2xl w-full max-w-sm p-6 fade-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-display font-700 text-base text-[#E8F0FF]">
                    {existing ? "Edit Closure" : "Mark Day"}
                  </h2>
                  <p className="text-xs text-[#7B91BC] mt-0.5">{subtitle}</p>
                </div>
                <button onClick={() => setClosureModal(null)} className="text-[#7B91BC] hover:text-[#E8F0FF]"><X size={16} /></button>
              </div>

              <label className="text-xs font-700 uppercase tracking-widest text-[#7B91BC] block mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(Object.keys(CLOSURE_STYLES) as ClosureType[]).map((ct) => (
                  <button
                    key={ct}
                    onClick={() => setClosureForm((f) => ({ ...f, type: ct }))}
                    className={`py-2 rounded-xl text-xs font-600 border transition-all flex items-center justify-center gap-1.5 ${
                      closureForm.type === ct ? CLOSURE_STYLES[ct].banner : "bg-[#131E35] text-[#7B91BC] border-[#1E2D4A] hover:border-[#2D4470]"
                    }`}
                  >
                    <Flag size={11} />
                    {CLOSURE_STYLES[ct].label}
                  </button>
                ))}
              </div>

              <label className="text-xs font-700 uppercase tracking-widest text-[#7B91BC] block mb-2">Name</label>
              <input
                type="text"
                placeholder={closureForm.type === "public_holiday" ? "e.g. Hari Raya Aidilfitri" : "e.g. Staff Training Day"}
                value={closureForm.name}
                onChange={(e) => setClosureForm((f) => ({ ...f, name: e.target.value }))}
                className="inp mb-5"
                autoFocus
              />

              {modalError && (
                <div className="flex items-start gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 mb-4">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex gap-2">
                {existing && !closureDeleteConfirm && (
                  <button onClick={() => setClosureDeleteConfirm(true)} className="btn btn-ghost text-rose-400 border-rose-500/20 hover:bg-rose-500/10 p-2">
                    <Trash2 size={14} />
                  </button>
                )}
                {existing && closureDeleteConfirm && (
                  <>
                    <button onClick={handleDeleteClosure} className="btn btn-danger flex-1">Confirm Remove</button>
                    <button onClick={() => setClosureDeleteConfirm(false)} className="btn btn-ghost px-3">Cancel</button>
                  </>
                )}
                {!closureDeleteConfirm && (
                  <>
                    <button onClick={() => setClosureModal(null)} className="btn btn-ghost flex-1">Cancel</button>
                    <button onClick={handleSaveClosure} disabled={saving || !closureForm.name.trim()} className="btn btn-primary flex-1">
                      {saving ? "Saving…" : existing ? "Update" : "Mark Day"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Duty Doctor modal */}
      {dutyModal && (() => {
        const avail = dentists.filter((d) => !scheduledIds(dutyModal).has(d.id));
        const date = new Date(dutyModal);
        const subtitle = `${date.toLocaleString("en-MY", { weekday: "long" })}, ${date.getDate()} ${formatMonthLabel(month)} · ${activeBranch?.name}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDutyModal(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative glass rounded-2xl w-full max-w-sm p-6 fade-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-display font-700 text-base text-[#E8F0FF]">Assign Duty Doctor</h2>
                  <p className="text-xs text-[#7B91BC] mt-0.5">{subtitle}</p>
                </div>
                <button onClick={() => setDutyModal(null)} className="text-[#7B91BC] hover:text-[#E8F0FF]"><X size={16} /></button>
              </div>
              {avail.length === 0 ? (
                <p className="text-sm text-[#7B91BC] text-center py-4">All dentists are already scheduled this day.</p>
              ) : (
                <>
                  <label className="text-xs font-700 uppercase tracking-widest text-[#7B91BC] block mb-2">Select Doctor</label>
                  <select value={dutyStaffId} onChange={(e) => setDutyStaffId(e.target.value)} className="inp mb-5">
                    {avail.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setDutyModal(null)} className="btn btn-ghost flex-1">Cancel</button>
                    <button onClick={handleAddDuty} disabled={saving} className="btn btn-primary flex-1">{saving ? "Saving…" : "Assign"}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add Leave modal */}
      {leaveModal && (() => {
        const avail = dentists.filter((d) => !scheduledIds(leaveModal).has(d.id));
        const date = new Date(leaveModal);
        const subtitle = `${date.toLocaleString("en-MY", { weekday: "long" })}, ${date.getDate()} ${formatMonthLabel(month)}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLeaveModal(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative glass rounded-2xl w-full max-w-sm p-6 fade-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-display font-700 text-base text-[#E8F0FF]">Mark Doctor On Leave</h2>
                  <p className="text-xs text-[#7B91BC] mt-0.5">{subtitle}</p>
                </div>
                <button onClick={() => setLeaveModal(null)} className="text-[#7B91BC] hover:text-[#E8F0FF]"><X size={16} /></button>
              </div>
              {avail.length === 0 ? (
                <p className="text-sm text-[#7B91BC] text-center py-4">All dentists are already scheduled this day.</p>
              ) : (
                <>
                  <label className="text-xs font-700 uppercase tracking-widest text-[#7B91BC] block mb-2">Doctor</label>
                  <select
                    value={leaveStaffId}
                    onChange={(e) => {
                      const dr = dentists.find((d) => d.id === e.target.value);
                      setLeaveStaffId(e.target.value);
                      setLeaveBranchId(dr?.branchId ?? branches[0]?.id ?? "");
                    }}
                    className="inp mb-4"
                  >
                    {avail.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>

                  <label className="text-xs font-700 uppercase tracking-widest text-[#7B91BC] block mb-2">Branch Colour Tag</label>
                  <div className="flex gap-2 mb-4">
                    {branches.map((b) => {
                      const styles = getBranchLeaveStyles(b.name);
                      const isSelected = leaveBranchId === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => setLeaveBranchId(b.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-600 border transition-all ${
                            isSelected ? styles.color : "bg-[#131E35] text-[#7B91BC] border-[#1E2D4A] hover:border-[#2D4470]"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? styles.dot : "bg-[#7B91BC]"}`} />
                          {b.name.replace(/big dental /i, "")}
                        </button>
                      );
                    })}
                  </div>

                  <label className="text-xs font-700 uppercase tracking-widest text-[#7B91BC] block mb-2">Leave Type</label>
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {(Object.keys(LEAVE_FULL) as LeaveType[]).map((lt) => (
                      <button
                        key={lt}
                        onClick={() => setLeaveType(lt)}
                        className={`py-2 rounded-xl text-xs font-600 border transition-all ${
                          leaveType === lt ? LEAVE_ACTIVE_COLORS[lt] : "bg-[#131E35] text-[#7B91BC] border-[#1E2D4A] hover:border-[#2D4470]"
                        }`}
                      >
                        {LEAVE_FULL[lt]}
                      </button>
                    ))}
                  </div>

                  {modalError && (
                    <div className="flex items-start gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 mb-4">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{modalError}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setLeaveModal(null)} className="btn btn-ghost flex-1">Cancel</button>
                    <button onClick={handleAddLeave} disabled={saving} className="btn btn-primary flex-1">{saving ? "Saving…" : "Confirm"}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
