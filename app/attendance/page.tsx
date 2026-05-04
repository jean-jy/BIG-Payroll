"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Branch, Staff, AttendanceRecord, LeaveType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchAttendanceRecords, upsertAttendance } from "@/lib/db";
import { calcOtHours, rm } from "@/lib/calculations";
import { Clock, Plus, Pencil, AlertTriangle, Upload, CheckCircle2, X, FileSpreadsheet, AlertCircle, LayoutList } from "lucide-react";
import Loading from "@/components/Loading";
import { supabase } from "@/lib/supabase";
import { MONTHS } from "@/lib/months";
const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };
const OT_ELIGIBLE = ["fulltime_da", "fulltime_dsa_monthly", "parttime_da"];

const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: "AL", medical: "MC", off: "OFF", leave: "OL",
};
const LEAVE_COLORS: Record<LeaveType, string> = {
  annual: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  medical: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  off: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  leave: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

type CsvRow = { date: string; clockIn: string; clockOut: string; otHours: number; outlet: string };

function parseRosterCsv(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());

  const idx = (keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex((h) => h.includes(k));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDate    = idx(["date"]);
  const iOutlet  = idx(["outlet"]);
  const iClockIn = idx(["clock-in", "clock_in", "clockin"]);
  const iClockOut= idx(["clock-out", "clock_out", "clockout"]);

  return lines.slice(1).flatMap((line) => {
    const cols: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim());

    const raw = (i: number) => (cols[i] ?? "").replace(/"/g, "").trim();

    const rawDate   = raw(iDate);
    const rawIn     = raw(iClockIn);
    const rawOut    = raw(iClockOut);
    const outlet    = raw(iOutlet);

    if (!rawDate || !rawIn || !rawOut || rawIn === "-" || rawOut === "-") return [];

    let date = rawDate;
    const dmyMatch = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) date = `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;

    const toHHMM = (t: string) => {
      const m = t.match(/(\d{1,2}):(\d{2})/);
      return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
    };
    const clockIn  = toHHMM(rawIn);
    const clockOut = toHHMM(rawOut);
    const otHours  = calcOtHours(clockOut);

    return [{ date, clockIn, clockOut, otHours, outlet }];
  }).filter((r) => r.date && r.clockIn && r.clockOut);
}

export default function AttendancePage() {
  const [month, setMonth]           = useState("2026-04");
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [records, setRecords]       = useState<AttendanceRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filterStaff, setFilterStaff] = useState("all");
  const [modal, setModal]           = useState<{ open: boolean; data: Partial<AttendanceRecord> }>({ open: false, data: {} });

  const [importStep, setImportStep]       = useState<"idle" | "preview" | "done">("idle");
  const [csvRows, setCsvRows]             = useState<CsvRow[]>([]);
  const [csvFilename, setCsvFilename]     = useState("");
  const [csvStaffId, setCsvStaffId]       = useState("");
  const [importing, setImporting]         = useState(false);
  const [dragging, setDragging]           = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importError, setImportError]     = useState<string | null>(null);

  useEffect(() => { load(month); }, [month]);

  async function load(m: string) {
    try {
      setLoading(true);
      const [b, s, a] = await Promise.all([fetchBranches(), fetchStaff(), fetchAttendanceRecords(m)]);
      setBranches(b); setStaff(s); setRecords(a);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const eligibleStaff = staff.filter((s) => s.isActive && OT_ELIGIBLE.includes(s.role));
  const filtered = records.filter((r) => {
    const s = staff.find((s) => s.id === r.staffId);
    return s && OT_ELIGIBLE.includes(s.role) && (filterStaff === "all" || r.staffId === filterStaff);
  });
  const workRecords = filtered.filter((r) => !r.isLeave);
  const totalOt = workRecords.reduce((s, r) => s + (r.otOverride ?? r.otHours), 0);

  function openAdd() {
    setModal({ open: true, data: { staffId: eligibleStaff[0]?.id, date: `${month}-01`, clockIn: "09:00", clockOut: "19:00", isLeave: false } });
  }
  function openEdit(r: AttendanceRecord) { setModal({ open: true, data: { ...r } }); }
  function closeModal() { setModal({ open: false, data: {} }); }
  const set = (k: keyof AttendanceRecord, v: unknown) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }));

  async function saveModal() {
    const d = modal.data;
    if (!d.staffId || !d.date) return;
    if (!d.isLeave && (!d.clockIn || !d.clockOut)) return;
    if (d.isLeave && !d.leaveType) return;
    try {
      setSaving(true);
      const otHours = d.isLeave ? 0 : calcOtHours(d.clockOut!);
      const saved = await upsertAttendance({ ...d, otHours });
      setRecords((prev) =>
        prev.some((r) => r.id === saved.id)
          ? prev.map((r) => r.id === saved.id ? saved : r)
          : [...prev, saved]
      );
      closeModal();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function processFile(file: File) {
    setCsvFilename(file.name);
    const text = await file.text();
    const rows = parseRosterCsv(text);
    setCsvRows(rows);
    if (!csvStaffId) setCsvStaffId(eligibleStaff[0]?.id ?? "");
    setImportStep("preview");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  async function confirmCsvImport() {
    if (!csvStaffId) { setImportError("Please select a staff member."); return; }
    if (!csvRows.length) { setImportError("No valid rows found in CSV."); return; }
    try {
      setImporting(true);
      setImportError(null);
      const rows = csvRows.map((r) => ({
        staff_id: csvStaffId,
        date: r.date,
        clock_in: r.clockIn,
        clock_out: r.clockOut,
        ot_hours: r.otHours,
        ot_override: null,
        override_reason: null,
      }));
      const { error: err } = await supabase.from("attendance_records").upsert(rows, { onConflict: "staff_id,date" });
      if (err) {
        console.error("CSV import error:", err);
        throw new Error(err.message ?? "Import failed");
      }
      setImportedCount(rows.length);
      await load(month);
      setImportStep("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setImportError(msg);
      console.error("confirmCsvImport:", e);
    } finally {
      setImporting(false);
    }
  }

  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? month;

  if (loading) return <Loading text="Loading attendance..." />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">HR</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Attendance & OT</h1>
          <p className="text-[#7B91BC] text-sm mt-1">{monthLabel} · Dental Surgery Assistants · RM12/hr OT</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/attendance/summary" className="btn btn-ghost gap-2"><LayoutList size={14} /> Monthly Summary</Link>
          <select className="inp w-auto" value={month} onChange={(e) => { setMonth(e.target.value); setImportStep("idle"); }}>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => { setImportStep("idle"); document.getElementById("att-csv-input")?.click(); }}>
            <Upload size={14} /> Import CSV
          </button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add Record</button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}<button className="ml-3 underline" onClick={() => setError(null)}>Dismiss</button></div>}

      {/* CSV Import Panel */}
      {importStep === "idle" && (
        <div
          className={`fade-up rounded-2xl border-2 border-dashed transition-colors p-8 flex flex-col items-center gap-3 cursor-pointer ${
            dragging ? "border-teal-400 bg-teal-500/5" : "border-[#1E2D4A] hover:border-[#2A3D66]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("att-csv-input")?.click()}
        >
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
            <Upload size={22} className="text-teal-400" />
          </div>
          <div className="text-center">
            <p className="text-[#E8F0FF] font-semibold text-sm">Drop RosterEntryListing CSV here or click to browse</p>
            <p className="text-[#7B91BC] text-xs mt-1">One file per staff · Columns: <span className="font-mono text-teal-400">Date, Outlet, Clock-In, Clock-Out</span></p>
          </div>
          <input id="att-csv-input" type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
        </div>
      )}

      {importStep === "preview" && (
        <div className="fade-up rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={16} className="text-teal-400" />
              <div>
                <p className="text-sm font-semibold text-[#E8F0FF]">{csvFilename}</p>
                <p className="text-xs text-[#7B91BC]">{csvRows.length} attendance records · {csvRows.filter(r => r.otHours > 0).length} with OT</p>
              </div>
            </div>
            <button className="text-[#7B91BC] hover:text-[#E8F0FF]" onClick={() => setImportStep("idle")}><X size={16} /></button>
          </div>
          <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center gap-4">
            <div className="flex items-start gap-2 text-xs text-amber-400 flex-1">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>This file has no staff name. Select which DA this roster belongs to:</span>
            </div>
            <select className="inp w-auto min-w-[220px]" value={csvStaffId} onChange={(e) => setCsvStaffId(e.target.value)}>
              <option value="">— Select Staff —</option>
              {eligibleStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="tbl text-sm">
              <thead>
                <tr><th>Date</th><th>Outlet</th><th>Clock In</th><th>Clock Out</th><th className="text-right">OT Hrs</th><th className="text-right">OT Pay</th></tr>
              </thead>
              <tbody>
                {csvRows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-[#E8F0FF]">{r.date}</td>
                    <td className="text-xs text-[#7B91BC]">{r.outlet}</td>
                    <td className="font-mono text-xs text-[#7B91BC]">{r.clockIn}</td>
                    <td className={`font-mono text-xs ${r.clockOut > "19:00" ? "text-amber-400" : "text-[#7B91BC]"}`}>{r.clockOut}</td>
                    <td className="text-right font-mono text-sm font-bold text-amber-400">{r.otHours > 0 ? r.otHours.toFixed(1) : "—"}</td>
                    <td className="text-right font-mono text-xs text-amber-400">{r.otHours > 0 ? rm(r.otHours * 12) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-[#1E2D4A] bg-[#0a1020] flex justify-between items-center text-xs text-[#7B91BC]">
            <span>Total OT: <span className="font-mono text-amber-400 font-bold">{csvRows.reduce((s, r) => s + r.otHours, 0).toFixed(1)} hrs</span> · {rm(csvRows.reduce((s, r) => s + r.otHours, 0) * 12)}</span>
          </div>
          {importError && (
            <div className="px-5 py-2 border-t border-[#1E2D4A] text-xs text-red-400 bg-red-500/5">
              {importError}
            </div>
          )}
          <div className="px-5 py-4 border-t border-[#1E2D4A] flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => { setImportStep("idle"); setImportError(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmCsvImport} disabled={importing || !csvStaffId}>
              <CheckCircle2 size={14} /> {importing ? "Importing..." : `Import ${csvRows.length} Records`}
            </button>
          </div>
        </div>
      )}

      {importStep === "done" && (
        <div className="fade-up flex items-center gap-4 px-5 py-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#E8F0FF]">Import successful</p>
            <p className="text-xs text-[#7B91BC]">{importedCount} records imported for {eligibleStaff.find(s => s.id === csvStaffId)?.name ?? "staff"}</p>
          </div>
          <button className="btn btn-ghost text-xs" onClick={() => { setImportStep("idle"); setCsvRows([]); }}>Import Another</button>
        </div>
      )}

      {/* Stats */}
      <div className="fade-up delay-1 grid grid-cols-3 gap-4">
        {[
          { label: "Total OT Hours", value: `${totalOt.toFixed(1)} hrs` },
          { label: "Total OT Pay",   value: rm(totalOt * 12) },
          { label: "Staff Tracked",  value: `${eligibleStaff.length}` },
        ].map((k) => (
          <div key={k.label} className="stat-card">
            <p className="text-[#7B91BC] text-xs uppercase tracking-wider mb-2">{k.label}</p>
            <p className="font-mono text-lg font-bold text-[#E8F0FF]">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="fade-up delay-2 flex items-start gap-3 px-4 py-3 rounded-xl border border-teal-500/20 bg-teal-500/5">
        <Clock size={14} className="text-teal-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-teal-300">Clinic hours: <strong>9:00am – 7:00pm</strong>, Mon–Sun. OT = hours past 7:00pm at RM12/hr. Only DAs eligible.</p>
      </div>

      <div className="fade-up delay-2 flex gap-3">
        <select className="inp w-auto" value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}>
          <option value="all">All Eligible Staff</option>
          {eligibleStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Records table */}
      <div className="fade-up delay-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Staff</th><th>Branch</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th className="text-right">OT Hours</th><th className="text-right">OT Pay</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              {[...filtered].sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
                const s = staff.find((s) => s.id === r.staffId);
                const b = branches.find((br) => br.id === s?.branchId);
                const ot = r.otOverride ?? r.otHours;
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="text-sm font-medium text-[#E8F0FF]">{s?.name ?? "—"}</p>
                      <p className="text-xs text-[#7B91BC]">{s?.role === "parttime_da" ? "PT DSA" : "FT DSA"}</p>
                    </td>
                    <td>
                      {b && <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />
                        <span className="text-sm text-[#7B91BC]">{b.name}</span>
                      </div>}
                    </td>
                    <td><span className="font-mono text-sm text-[#E8F0FF]">{r.date}</span></td>
                    <td>
                      {r.isLeave
                        ? <span className={`text-[10px] font-700 px-2 py-0.5 rounded border ${LEAVE_COLORS[r.leaveType ?? "leave"]}`}>
                            {LEAVE_LABELS[r.leaveType ?? "leave"]}
                          </span>
                        : <span className="font-mono text-sm text-[#7B91BC]">{r.clockIn}</span>}
                    </td>
                    <td>
                      {r.isLeave
                        ? <span className="text-[#7B91BC] text-xs">—</span>
                        : <span className={`font-mono text-sm ${r.clockOut > "19:00" ? "text-amber-400" : "text-[#7B91BC]"}`}>{r.clockOut}</span>}
                    </td>
                    <td className="text-right">
                      {!r.isLeave && ot > 0
                        ? <div className="flex items-center justify-end gap-1.5">
                            {r.otOverride !== undefined && <AlertTriangle size={11} className="text-amber-400" />}
                            <span className="font-mono font-bold text-amber-400">{ot.toFixed(1)}</span>
                          </div>
                        : <span className="text-[#7B91BC]">—</span>}
                    </td>
                    <td className="text-right">
                      {!r.isLeave && ot > 0
                        ? <span className="font-mono text-sm font-bold text-amber-400">{rm(ot * 12)}</span>
                        : <span className="text-[#7B91BC]">—</span>}
                    </td>
                    <td>
                      {r.isLeave
                        ? <span className="text-xs text-purple-400">Leave day</span>
                        : r.overrideReason
                          ? <span className="text-xs text-amber-400 italic">{r.overrideReason}</span>
                          : <span className="text-[#7B91BC] text-xs">Auto</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost py-1 px-3 text-xs" onClick={() => openEdit(r)}>
                        <Pencil size={11} /> Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-[#7B91BC]">No records yet. Import a CSV or click "Add Record".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual entry modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-[#0D1526] border border-[#1E2D4A] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h2 className="font-display font-bold text-[#E8F0FF]">{modal.data.id ? "Edit Record" : "Add Attendance"}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Staff</label>
              <select className="inp" value={modal.data.staffId ?? ""} onChange={(e) => set("staffId", e.target.value)}>
                {eligibleStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Date</label>
              <input className="inp" type="date" value={modal.data.date ?? ""} onChange={(e) => set("date", e.target.value)} />
            </div>

            {/* Leave day toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set("isLeave", !modal.data.isLeave)}
                className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${modal.data.isLeave ? "bg-purple-600" : "bg-[#1E2D4A]"}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${modal.data.isLeave ? "left-5" : "left-1"}`} />
              </button>
              <span className="text-sm text-[#E8F0FF]">Mark as Leave Day</span>
            </div>

            {modal.data.isLeave ? (
              <div>
                <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Leave Type</label>
                <select className="inp" value={modal.data.leaveType ?? ""} onChange={(e) => set("leaveType", e.target.value as LeaveType)}>
                  <option value="">— Select Type —</option>
                  <option value="annual">Annual Leave (AL)</option>
                  <option value="medical">Medical Leave (MC)</option>
                  <option value="off">Day Off (OFF)</option>
                  <option value="leave">On Leave (OL)</option>
                </select>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Clock In</label>
                    <input className="inp" type="time" value={modal.data.clockIn ?? ""} onChange={(e) => set("clockIn", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Clock Out</label>
                    <input className="inp" type="time" value={modal.data.clockOut ?? ""} onChange={(e) => set("clockOut", e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">OT Override (hrs) — blank = auto</label>
                  <input className="inp" type="number" step="0.5" placeholder="e.g. 1.5" value={modal.data.otOverride ?? ""} onChange={(e) => set("otOverride", e.target.value ? parseFloat(e.target.value) : undefined)} />
                </div>
                {modal.data.otOverride !== undefined && (
                  <div>
                    <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Override Reason</label>
                    <input className="inp" placeholder="Reason..." value={modal.data.overrideReason ?? ""} onChange={(e) => set("overrideReason", e.target.value)} />
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveModal} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
