"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, TreatmentRecord, AttendanceRecord, TreatmentType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchTreatmentRecords, fetchAttendanceRecords, fetchTreatmentTypes, fetchPayrollStatuses, finalisePayroll, finaliseAllPayroll, fetchPerformanceAllowances, upsertPerformanceAllowance, PerformanceAllowanceMap, updateMaterialCostOverride, updateLabCost, updateRecordOnHold, fetchPayrollAdjustments, insertPayrollAdjustment, updatePayrollAdjustment, deletePayrollAdjustment, AdjustmentMap } from "@/lib/db";
import { PayrollAdjustment } from "@/lib/types";
import { calcPayroll, rm } from "@/lib/calculations";
import { ChevronDown, ChevronRight, CheckCircle2, Lock, AlertCircle, ArrowUp, PauseCircle, PlayCircle, Plus, X, Pencil, Check } from "lucide-react";
import Loading from "@/components/Loading";

const MONTHS = [
  { label: "April 2026",    value: "2026-04" },
  { label: "March 2026",   value: "2026-03" },
  { label: "February 2026", value: "2026-02" },
  { label: "January 2026",  value: "2026-01" },
  { label: "December 2025", value: "2025-12" },
  { label: "November 2025", value: "2025-11" },
];

const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };
const ROLE_SHORT: Record<string, string> = {
  resident_dentist: "Resident Dr.", locum_dentist: "Locum Dr.",
  fulltime_da: "DSA (FT)", fulltime_dsa_monthly: "DSA (Monthly)", parttime_da: "DSA (PT)", supervisor: "Supervisor",
};

export default function PayrollPage() {
  const [month, setMonth]           = useState("2026-04");
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [records, setRecords]       = useState<TreatmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tTypes, setTTypes]         = useState<TreatmentType[]>([]);
  const [statuses, setStatuses]     = useState<Record<string, "draft" | "finalised">>({});
  const [allowances, setAllowances] = useState<PerformanceAllowanceMap>({});
  const [adjustments, setAdjustments] = useState<AdjustmentMap>({});
  const [adjForms, setAdjForms] = useState<Record<string, { desc: string; amount: string; type: "add" | "deduct" }>>({});
  const [editingAdj, setEditingAdj] = useState<string | null>(null);
  const [editAdjForm, setEditAdjForm] = useState<{ desc: string; amount: string; type: "add" | "deduct" }>({ desc: "", amount: "", type: "add" });
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<string | null>(null);


  useEffect(() => { load(); }, [month]);

  async function load() {
    try {
      setLoading(true);
      const [b, s, r, a, tt, st, al, adj] = await Promise.all([
        fetchBranches(), fetchStaff(), fetchTreatmentRecords(month),
        fetchAttendanceRecords(month), fetchTreatmentTypes(), fetchPayrollStatuses(month),
        fetchPerformanceAllowances(month), fetchPayrollAdjustments(month),
      ]);
      setBranches(b); setStaff(s); setRecords(r);
      setAttendance(a); setTTypes(tt); setStatuses(st); setAllowances(al); setAdjustments(adj);
      setMatOverrides(Object.fromEntries(r.filter(x => x.materialCostOverride !== undefined).map(x => [x.id, x.materialCostOverride!])));
      setLabOverrides(Object.fromEntries(r.filter(x => x.labCost !== undefined && x.labCost > 0).map(x => [x.id, x.labCost!])));
      setHoldOverrides(Object.fromEntries(r.filter(x => x.isOnHold).map(x => [x.id, true])));

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const activeStaff = staff.filter((s) => s.isActive);
  const [matOverrides, setMatOverrides] = useState<Record<string, number>>({});
  const [labOverrides, setLabOverrides] = useState<Record<string, number>>({});
  const [holdOverrides, setHoldOverrides] = useState<Record<string, boolean>>({});

  const recordsWithOverrides = records.map((r) => ({
    ...r,
    ...(matOverrides[r.id] !== undefined ? { materialCostOverride: matOverrides[r.id] } : {}),
    ...(labOverrides[r.id] !== undefined ? { labCost: labOverrides[r.id] } : {}),
    ...(holdOverrides[r.id] !== undefined ? { isOnHold: holdOverrides[r.id] } : {}),
  }));

  const payrolls = activeStaff.map((s) => ({
    staff: s,
    payroll: calcPayroll(s, month, recordsWithOverrides, attendance, tTypes, allowances[s.id] ?? 0, adjustments[s.id] ?? []),
  }));

  async function handleMatCostChange(recordId: string, value: number) {
    setMatOverrides((prev) => ({ ...prev, [recordId]: value }));
    await updateMaterialCostOverride(recordId, value);
  }

  async function handleLabCostChange(recordId: string, value: number) {
    setLabOverrides((prev) => ({ ...prev, [recordId]: value }));
    await updateLabCost(recordId, value);
  }

  async function handleToggleHold(recordId: string, current: boolean) {
    const next = !current;
    setHoldOverrides((prev) => ({ ...prev, [recordId]: next }));
    await updateRecordOnHold(recordId, next, month);
  }

  async function handleAllowanceChange(staffId: string, value: number) {

    setAllowances((prev) => ({ ...prev, [staffId]: value }));
    await upsertPerformanceAllowance(staffId, month, value);
  }

  async function handleAddAdjustment(staffId: string) {
    const form = adjForms[staffId];
    const amount = parseFloat(form?.amount ?? "");
    if (!form?.desc.trim() || !amount || amount <= 0) return;
    try {
      setSaving(true);
      const adj = await insertPayrollAdjustment({ staffId, month, description: form.desc.trim(), amount, type: form.type ?? "add" });
      setAdjustments((prev) => ({ ...prev, [staffId]: [...(prev[staffId] ?? []), adj] }));
      setAdjForms((prev) => ({ ...prev, [staffId]: { desc: "", amount: "", type: "add" } }));
    } catch { setError("Failed to save adjustment"); } finally { setSaving(false); }
  }

  async function handleDeleteAdjustment(staffId: string, adjId: string) {
    try {
      await deletePayrollAdjustment(adjId);
      setAdjustments((prev) => ({ ...prev, [staffId]: (prev[staffId] ?? []).filter((a) => a.id !== adjId) }));
    } catch { setError("Failed to delete adjustment"); }
  }

  async function handleSaveAdjustment(staffId: string, adjId: string) {
    const amount = parseFloat(editAdjForm.amount);
    if (!editAdjForm.desc.trim() || !amount || amount <= 0) return;
    try {
      setSaving(true);
      await updatePayrollAdjustment(adjId, { description: editAdjForm.desc.trim(), amount, type: editAdjForm.type });
      setAdjustments((prev) => ({
        ...prev,
        [staffId]: (prev[staffId] ?? []).map((a) =>
          a.id === adjId ? { ...a, description: editAdjForm.desc.trim(), amount, type: editAdjForm.type } : a
        ),
      }));
      setEditingAdj(null);
    } catch { setError("Failed to update adjustment"); } finally { setSaving(false); }
  }

  const totalGross = payrolls.reduce((s, p) => s + p.payroll.grossPay, 0);
  const totalNet   = payrolls.reduce((s, p) => s + p.payroll.netPay, 0);
  const totalEpfEe = payrolls.reduce((s, p) => s + p.payroll.epfEmployee, 0);
  const totalEpfEr = payrolls.reduce((s, p) => s + p.payroll.epfEmployer, 0);
  const totalSocso = payrolls.reduce((s, p) => s + p.payroll.socsoEmployee + p.payroll.socsoEmployer, 0);
  const totalEis   = payrolls.reduce((s, p) => s + p.payroll.eisEmployee + p.payroll.eisEmployer, 0);

  async function handleFinalise(staffId: string) {
    try {
      setSaving(true);
      await finalisePayroll(staffId, month);
      setStatuses((prev) => ({ ...prev, [staffId]: "finalised" }));
    } catch { setError("Failed to finalise"); } finally { setSaving(false); }
  }

  async function handleFinaliseAll() {
    try {
      setSaving(true);
      const ids = activeStaff.map((s) => s.id);
      await finaliseAllPayroll(ids, month);
      setStatuses(Object.fromEntries(ids.map((id) => [id, "finalised"])));
    } catch { setError("Failed to finalise all"); } finally { setSaving(false); }
  }

  const allFinalised = activeStaff.length > 0 && activeStaff.every((s) => statuses[s.id] === "finalised");

  if (loading) return <Loading text="Calculating payroll..." />;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Payroll</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Payroll Processing</h1>
          <p className="text-[#7B91BC] text-sm mt-1">{MONTHS.find((m) => m.value === month)?.label} · {activeStaff.length} staff</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select className="inp w-auto text-sm" value={month} onChange={(e) => { setMonth(e.target.value); setExpanded(null); }}>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {allFinalised ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              <CheckCircle2 size={14} /> All Finalised
            </div>
          ) : (
            <button className="btn btn-primary" onClick={handleFinaliseAll} disabled={saving}>
              <Lock size={14} /> {saving ? "Saving..." : "Finalise All"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}</div>}

      {/* Summary */}
      <div className="fade-up delay-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Gross",    value: rm(totalGross),             color: "#2DD4BF" },
          { label: "Total Net Pay",  value: rm(totalNet),               color: "#818CF8" },
          { label: "EPF (EE+ER)",    value: rm(totalEpfEe + totalEpfEr), color: "#F59E0B" },
          { label: "SOCSO + EIS",    value: rm(totalSocso + totalEis),   color: "#FB7185" },
        ].map((k) => (
          <div key={k.label} className="stat-card">
            <p className="text-[#7B91BC] text-xs font-semibold uppercase tracking-wider mb-2">{k.label}</p>
            <p className="font-mono text-lg font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {records.length === 0 && (
        <div className="fade-up delay-2 flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            No POS records imported yet — dentists will be paid at basic salary.
            <a href="/import" className="underline ml-1">Import POS data →</a>
          </p>
        </div>
      )}

      {/* Per-staff breakdown */}
      <div className="fade-up delay-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A]">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Staff Breakdown</h2>
        </div>
        <div className="divide-y divide-[#1E2D4A]/50">
          {payrolls.map(({ staff: s, payroll: p }) => {
            const b = branches.find((br) => br.id === s.branchId);
            const open = expanded === s.id;
            const fin = statuses[s.id] === "finalised";
            const commWins = p.payBasis === "commission";
            return (
              <div key={s.id}>
                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpanded(open ? null : s.id)}>
                  <div className="flex-shrink-0">
                    {open ? <ChevronDown size={14} className="text-[#7B91BC]" /> : <ChevronRight size={14} className="text-[#7B91BC]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#E8F0FF] truncate">{s.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {b && <div className="w-1.5 h-1.5 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />}
                      <span className="text-xs text-[#7B91BC]">{b?.name} · {ROLE_SHORT[s.role]}</span>
                    </div>
                  </div>
                  <div className="hidden lg:flex items-center gap-4">
                    <div className="w-28 text-right">
                      <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Basic/Rate</p>
                      <p className="font-mono text-xs text-[#7B91BC]">{rm(p.basicOrDailyOrHourly)}</p>
                    </div>
                    {(s.role === "resident_dentist" || s.role === "locum_dentist") && (
                      <div className="w-28 text-right">
                        <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Commission</p>
                        <p className="font-mono text-xs text-[#7B91BC]">{rm(p.totalCommission)}</p>
                      </div>
                    )}
                    <div className="w-24 text-right">
                      <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Used</p>
                      {commWins
                        ? <span className="badge badge-comm text-[10px]">Commission</span>
                        : p.payBasis === "hourly"
                          ? <span className="badge text-[10px]" style={{ background: "rgba(251,191,36,0.1)", color: "#FBB724", border: "1px solid rgba(251,191,36,0.2)" }}>Hourly</span>
                          : <span className="badge badge-basic text-[10px]">Basic</span>}
                    </div>
                    {p.otPay > 0 && (
                      <div className="w-24 text-right">
                        <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">OT</p>
                        <p className="font-mono text-xs text-amber-400">+{rm(p.otPay)}</p>
                      </div>
                    )}
                    {p.earlyLeavePenalty > 0 && (
                      <div className="w-24 text-right">
                        <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Early Leave</p>
                        <p className="font-mono text-xs text-red-400">−{rm(p.earlyLeavePenalty)}</p>
                      </div>
                    )}
                    {p.performanceAllowance > 0 && (
                      <div className="w-28 text-right">
                        <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Perf. Allow.</p>
                        <p className="font-mono text-xs text-violet-400">+{rm(p.performanceAllowance)}</p>
                      </div>
                    )}
                    <div className="w-28 text-right">
                      <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Gross</p>
                      <p className="font-mono text-sm font-bold text-[#E8F0FF]">{rm(p.grossPay)}</p>
                    </div>
                    <div className="w-28 text-right">
                      <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-0.5">Net Pay</p>
                      <p className="font-mono text-sm font-bold text-teal-400">{rm(p.netPay)}</p>
                    </div>
                  </div>
                  <div className="lg:hidden text-right">
                    <p className="font-mono text-sm font-bold text-teal-400">{rm(p.netPay)}</p>
                    <p className="text-xs text-[#7B91BC]">net</p>
                  </div>
                  <div className="flex-shrink-0">
                    {fin
                      ? <span className="badge badge-final"><CheckCircle2 size={10} /> Finalised</span>
                      : <button className="btn btn-ghost py-1 px-3 text-xs" disabled={saving}
                          onClick={(e) => { e.stopPropagation(); handleFinalise(s.id); }}>
                          <Lock size={11} /> Finalise
                        </button>}
                  </div>
                </div>

                {open && (
                  <div className="px-5 pb-5 bg-[#070D1A]/50 border-t border-[#1E2D4A]/40">
                    <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Pay calc */}
                      <div className="space-y-3">
                        <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#7B91BC]">Pay Calculation</h3>
                        {(s.role === "resident_dentist" || s.role === "locum_dentist") && (<>
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#7B91BC]">{s.role === "locum_dentist" ? "Total Daily Rate" : "Monthly Basic"}</span>
                              {!commWins && <ArrowUp size={12} className="text-teal-400" />}
                            </div>
                            <span className={`font-mono text-sm ${!commWins ? "text-teal-400 font-bold" : "text-[#7B91BC]"}`}>{rm(p.basicOrDailyOrHourly)}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#7B91BC]">Total Commission</span>
                              {commWins && <ArrowUp size={12} className="text-teal-400" />}
                            </div>
                            <span className={`font-mono text-sm ${commWins ? "text-teal-400 font-bold" : "text-[#7B91BC]"}`}>{rm(p.totalCommission)}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <span className="text-sm font-semibold text-[#E8F0FF]">Pay Used (higher)</span>
                            <span className="font-mono text-sm font-bold text-[#E8F0FF]">{rm(p.finalPay)}</span>
                          </div>
                        </>)}
                        {(s.role === "fulltime_da" || s.role === "fulltime_dsa_monthly" || s.role === "supervisor") && (
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <span className="text-sm text-[#7B91BC]">Basic Salary</span>
                            <span className="font-mono text-sm text-[#E8F0FF]">{rm(p.basicOrDailyOrHourly)}</span>
                          </div>
                        )}
                        {s.role === "parttime_da" && (
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <span className="text-sm text-[#7B91BC]">Hourly Pay</span>
                            <span className="font-mono text-sm text-[#E8F0FF]">{rm(p.basicOrDailyOrHourly)}</span>
                          </div>
                        )}
                        {p.otPay > 0 && (
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <span className="text-sm text-[#7B91BC]">
                              {(s.fixedOtPay ?? 0) > 0 ? "OT (fixed)" : `OT (${p.otHours.toFixed(1)} hrs × RM12)`}
                            </span>
                            <span className="font-mono text-sm text-amber-400">+{rm(p.otPay)}</span>
                          </div>
                        )}
                        {p.earlyLeavePenalty > 0 && (
                          <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                            <span className="text-sm text-[#7B91BC]">Early Leave ({p.earlyLeaveHours.toFixed(1)} hrs)</span>
                            <span className="font-mono text-sm text-red-400">−{rm(p.earlyLeavePenalty)}</span>
                          </div>
                        )}
                        {(s.performanceAllowanceCap ?? 0) > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-[#1E2D4A]/40">
                            <div>
                              <span className="text-sm text-[#7B91BC]">Performance Allowance</span>
                              <span className="text-[10px] text-[#7B91BC] ml-2">(cap: {rm(s.performanceAllowanceCap ?? 0)})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#7B91BC]">RM</span>
                              <input
                                type="number"
                                min={0}
                                max={s.performanceAllowanceCap ?? 0}
                                value={allowances[s.id] ?? 0}
                                onChange={(e) => {
                                  const v = Math.min(parseFloat(e.target.value) || 0, s.performanceAllowanceCap ?? 0);
                                  handleAllowanceChange(s.id, v);
                                }}
                                className="w-24 bg-[#1A2744] border border-[#2A3F6A] rounded-lg px-2 py-1 text-sm font-mono text-teal-400 text-right focus:outline-none focus:border-teal-500"
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between py-2 border-b border-[#1E2D4A]/40">
                          <span className="text-sm font-bold text-[#E8F0FF]">Gross Pay</span>
                          <span className="font-mono text-sm font-bold text-[#E8F0FF]">{rm(p.grossPay)}</span>
                        </div>
                        <div className="rounded-xl border border-[#1E2D4A] p-3 space-y-2">
                          {[
                            ["EPF (11%)", rm(p.epfEmployee)],
                            ["SOCSO (0.5%)", rm(p.socsoEmployee)],
                            ["EIS (0.2%)", rm(p.eisEmployee)],
                          ].map(([l, v]) => (
                            <div key={l} className="flex justify-between text-sm">
                              <span className="text-[#7B91BC]">{l}</span>
                              <span className="font-mono text-red-400">−{v}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm pt-2 border-t border-[#1E2D4A]">
                            <span className="font-semibold text-[#E8F0FF]">Net Pay</span>
                            <span className="font-mono font-bold text-teal-400">{rm(p.netPay)}</span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Employer Contributions</p>
                          {[
                            [`EPF (${p.grossPay <= 5000 ? "13%" : "12%"})`, rm(p.epfEmployer)],
                            ["SOCSO (1.75%)", rm(p.socsoEmployer)],
                            ["EIS (0.2%)", rm(p.eisEmployer)],
                          ].map(([l, v]) => (
                            <div key={l} className="flex justify-between text-xs">
                              <span className="text-[#7B91BC]">{l}</span>
                              <span className="font-mono text-indigo-400">{v}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-xs pt-1.5 border-t border-indigo-500/20 font-semibold">
                            <span className="text-indigo-300">Total Employer Cost</span>
                            <span className="font-mono text-indigo-300">{rm(p.grossPay + p.epfEmployer + p.socsoEmployer + p.eisEmployer)}</span>
                          </div>
                        </div>
                      </div>

                      {/* On-hold records */}
                      {p.onHoldBreakdown.length > 0 && (
                        <div className="lg:col-span-2">
                          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-amber-500 mb-3">Payment on Hold ({p.onHoldBreakdown.reduce((s, r) => s + r.totalFee, 0).toFixed(2)} total)</h3>
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                            <table className="tbl text-xs">
                              <thead><tr><th>Treatment</th><th className="text-right">Total Fee</th><th>Action</th></tr></thead>
                              <tbody>
                                {p.onHoldBreakdown.map((item, i) => {
                                  const heldRecs = recordsWithOverrides.filter(r => r.staffId === s.id && (r.isOnHold || tTypes.find(t => t.id === r.treatmentTypeId)?.isOnHold) && (tTypes.find(t => t.id === r.treatmentTypeId)?.name ?? "") === item.treatmentName);
                                  return (
                                    <tr key={i}>
                                      <td className="text-amber-300">{item.treatmentName}</td>
                                      <td className="text-right font-mono text-amber-400">{rm(item.totalFee)}</td>
                                      <td>
                                        {heldRecs.map(rec => (
                                          <button key={rec.id} onClick={() => handleToggleHold(rec.id, true)}
                                            className="text-[10px] text-amber-400 hover:text-teal-400 underline mr-2">
                                            Release {rec.patientName}
                                          </button>
                                        ))}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Commission breakdown */}
                      {p.commissionBreakdown.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#7B91BC]">Commission ({p.commissionBreakdown.length} items)</h3>
                            {p.commissionBreakdown.some(l => l.saleCategory !== "treatment") && (
                              <div className="flex gap-4">
                                {Object.entries(p.commissionBreakdown.reduce((acc, l) => {
                                  if (l.saleCategory === "treatment") return acc;
                                  if (!acc[l.treatmentName]) acc[l.treatmentName] = { count: 0, total: 0, cat: l.saleCategory };
                                  acc[l.treatmentName].count++;
                                  acc[l.treatmentName].total += l.fee;
                                  return acc;
                                }, {} as Record<string, { count: number; total: number; cat: string } >)).map(([name, stat]) => (
                                  <div key={name} className="flex flex-col items-end">
                                    <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider">{name}</p>
                                    <p className="font-mono text-xs font-bold text-[#E8F0FF]">
                                      {stat.count} × <span className={stat.cat === "medicine" ? "text-emerald-400" : "text-amber-400"}>{rm(stat.total)}</span>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">

                            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                              <table className="tbl text-xs">
                                <thead><tr><th>Date</th><th>Treatment</th><th className="text-right">Fee</th><th className="text-right">−Cost</th><th className="text-right">−Lab</th><th className="text-right">Net</th><th className="text-right">%</th><th className="text-right">Comm</th><th>Hold</th></tr></thead>
                                <tbody>
                                  {p.commissionBreakdown.map((line, i) => {
                                    const rec = recordsWithOverrides.find(r => r.date === line.date && r.patientName === line.patientName && r.staffId === s.id);
                                    const tt = rec ? tTypes.find(t => t.id === rec.treatmentTypeId) : undefined;
                                    const isVariable = tt?.variableMaterialCost ?? false;
                                    const isHeld = rec ? (holdOverrides[rec.id] ?? rec.isOnHold ?? false) : false;
                                    const labVal = rec ? (labOverrides[rec.id] ?? rec.labCost ?? 0) : line.labCost;
                                    return (
                                    <tr key={i}>
                                      <td className="font-mono text-[#7B91BC]">{line.date.slice(5)}</td>
                                      <td>
                                        <div className="text-[#E8F0FF]">{line.treatmentName}</div>
                                        <div className="text-[#7B91BC] text-[10px]">{line.patientName}</div>
                                      </td>
                                      <td className="text-right font-mono">{line.fee}</td>
                                      <td className="text-right font-mono text-red-400">
                                        {isVariable && rec ? (
                                          <input
                                            type="number" min={0}
                                            value={matOverrides[rec.id] ?? rec.materialCostOverride ?? 0}
                                            onChange={(e) => handleMatCostChange(rec.id, parseFloat(e.target.value) || 0)}
                                            className="w-20 bg-[#1A2744] border border-violet-500/40 rounded px-1.5 py-0.5 text-xs font-mono text-violet-300 text-right focus:outline-none focus:border-violet-400"
                                          />
                                        ) : line.materialCost > 0 ? `−${line.materialCost}` : "—"}
                                      </td>
                                      <td className="text-right font-mono text-amber-400">
                                        {rec?.saleCategory === "treatment" ? (
                                          <input
                                            type="number" min={0}
                                            value={labVal}
                                            onChange={(e) => handleLabCostChange(rec.id, parseFloat(e.target.value) || 0)}
                                            className="w-20 bg-[#1A2744] border border-amber-500/40 rounded px-1.5 py-0.5 text-xs font-mono text-amber-300 text-right focus:outline-none focus:border-amber-400"
                                          />
                                        ) : "—"}
                                      </td>
                                      <td className="text-right font-mono">{line.netBase.toFixed(0)}</td>
                                      <td className="text-right font-mono text-[#7B91BC]">{(line.rate * 100).toFixed(0)}%</td>
                                      <td className="text-right font-mono font-bold text-teal-400">{line.commission.toFixed(2)}</td>
                                      <td>
                                        {rec && (
                                          <button
                                            title={isHeld ? "Release hold" : "Put on hold"}
                                            onClick={() => handleToggleHold(rec.id, isHeld)}
                                            className={`p-1 rounded transition-colors ${isHeld ? "text-amber-400 hover:text-amber-300" : "text-[#7B91BC] hover:text-amber-400"}`}
                                          >
                                            {isHeld ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-[#1E2D4A]">
                                    <td colSpan={7} className="text-right font-bold text-[#7B91BC] py-2 px-3">Total</td>
                                    <td className="text-right font-mono font-bold text-teal-400 py-2 px-3">{rm(p.totalCommission)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Manual Adjustments */}
                      <div className="lg:col-span-2">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#7B91BC]">
                            Manual Adjustments
                            {(adjustments[s.id] ?? []).length > 0 && (
                              <span className="ml-2 text-teal-400">({(adjustments[s.id] ?? []).length})</span>
                            )}
                          </h3>
                          {p.adjustmentNet !== 0 && (
                            <span className={`font-mono text-sm font-bold ${p.adjustmentNet > 0 ? "text-teal-400" : "text-red-400"}`}>
                              Net: {p.adjustmentNet > 0 ? "+" : ""}{rm(p.adjustmentNet)}
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                          {(adjustments[s.id] ?? []).length > 0 && (
                            <table className="tbl text-xs">
                              <thead><tr><th>Description</th><th>Type</th><th className="text-right">Amount</th><th></th></tr></thead>
                              <tbody>
                                {(adjustments[s.id] ?? []).map((adj) =>
                                  editingAdj === adj.id ? (
                                    <tr key={adj.id} className="bg-teal-500/5">
                                      <td>
                                        <input
                                          autoFocus
                                          type="text"
                                          value={editAdjForm.desc}
                                          onChange={(e) => setEditAdjForm((f) => ({ ...f, desc: e.target.value }))}
                                          className="w-full bg-[#1A2744] border border-teal-500/40 rounded px-2 py-0.5 text-xs text-[#E8F0FF] focus:outline-none"
                                        />
                                      </td>
                                      <td>
                                        <select
                                          value={editAdjForm.type}
                                          onChange={(e) => setEditAdjForm((f) => ({ ...f, type: e.target.value as "add" | "deduct" }))}
                                          className="bg-[#1A2744] border border-teal-500/40 rounded px-1.5 py-0.5 text-xs text-[#E8F0FF] focus:outline-none"
                                        >
                                          <option value="add">+ Add</option>
                                          <option value="deduct">− Deduct</option>
                                        </select>
                                      </td>
                                      <td className="text-right">
                                        <input
                                          type="number"
                                          min={0}
                                          value={editAdjForm.amount}
                                          onChange={(e) => setEditAdjForm((f) => ({ ...f, amount: e.target.value }))}
                                          className="w-24 bg-[#1A2744] border border-teal-500/40 rounded px-2 py-0.5 text-xs font-mono text-right text-[#E8F0FF] focus:outline-none"
                                        />
                                      </td>
                                      <td>
                                        <div className="flex gap-1">
                                          <button onClick={() => handleSaveAdjustment(s.id, adj.id)} disabled={saving} className="p-1 text-teal-400 hover:text-teal-300 transition-colors">
                                            <Check size={13} />
                                          </button>
                                          <button onClick={() => setEditingAdj(null)} className="p-1 text-[#7B91BC] hover:text-[#E8F0FF] transition-colors">
                                            <X size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : (
                                    <tr key={adj.id}>
                                      <td className="text-[#E8F0FF]">{adj.description}</td>
                                      <td>
                                        {adj.type === "add"
                                          ? <span className="badge" style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.2)" }}>+ Add</span>
                                          : <span className="badge" style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", border: "1px solid rgba(239,68,68,0.2)" }}>− Deduct</span>}
                                      </td>
                                      <td className={`text-right font-mono font-bold ${adj.type === "add" ? "text-teal-400" : "text-red-400"}`}>
                                        {adj.type === "add" ? "+" : "−"}{rm(adj.amount)}
                                      </td>
                                      <td>
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => { setEditingAdj(adj.id); setEditAdjForm({ desc: adj.description, amount: String(adj.amount), type: adj.type }); }}
                                            className="p-1 text-[#7B91BC] hover:text-teal-400 transition-colors"
                                          >
                                            <Pencil size={13} />
                                          </button>
                                          <button onClick={() => handleDeleteAdjustment(s.id, adj.id)} className="p-1 text-[#7B91BC] hover:text-red-400 transition-colors">
                                            <X size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          )}
                          <div className="flex gap-2 p-3 border-t border-[#1E2D4A] flex-wrap">
                            <input
                              type="text"
                              placeholder="Description (e.g. Cash sale, Uniform deduction)"
                              value={adjForms[s.id]?.desc ?? ""}
                              onChange={(e) => setAdjForms((prev) => ({ ...prev, [s.id]: { desc: e.target.value, amount: prev[s.id]?.amount ?? "", type: prev[s.id]?.type ?? "add" } }))}
                              className="flex-1 min-w-40 bg-[#1A2744] border border-[#2A3F6A] rounded-lg px-3 py-1.5 text-xs text-[#E8F0FF] focus:outline-none focus:border-teal-500"
                            />
                            <input
                              type="number"
                              placeholder="Amount (RM)"
                              min={0}
                              value={adjForms[s.id]?.amount ?? ""}
                              onChange={(e) => setAdjForms((prev) => ({ ...prev, [s.id]: { desc: prev[s.id]?.desc ?? "", amount: e.target.value, type: prev[s.id]?.type ?? "add" } }))}
                              className="w-32 bg-[#1A2744] border border-[#2A3F6A] rounded-lg px-3 py-1.5 text-xs font-mono text-[#E8F0FF] focus:outline-none focus:border-teal-500"
                            />
                            <select
                              value={adjForms[s.id]?.type ?? "add"}
                              onChange={(e) => setAdjForms((prev) => ({ ...prev, [s.id]: { desc: prev[s.id]?.desc ?? "", amount: prev[s.id]?.amount ?? "", type: e.target.value as "add" | "deduct" } }))}
                              className="bg-[#1A2744] border border-[#2A3F6A] rounded-lg px-2 py-1.5 text-xs text-[#E8F0FF] focus:outline-none focus:border-teal-500"
                            >
                              <option value="add">+ Add to Pay</option>
                              <option value="deduct">− Deduct from Pay</option>
                            </select>
                            <button onClick={() => handleAddAdjustment(s.id)} disabled={saving} className="btn btn-primary text-xs py-1.5 px-3">
                              <Plus size={12} /> Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-[#1E2D4A] bg-[#070D1A]/30 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Gross",    value: rm(totalGross),   color: "text-[#E8F0FF]" },
            { label: "Total Net Pay",  value: rm(totalNet),     color: "text-teal-400" },
            { label: "EPF Employer",   value: rm(totalEpfEr),   color: "text-indigo-400" },
            { label: "Total Cost",     value: rm(totalGross + totalEpfEr + payrolls.reduce((s, p) => s + p.payroll.socsoEmployer + p.payroll.eisEmployer, 0)), color: "text-[#E8F0FF]" },
          ].map((k) => (
            <div key={k.label}>
              <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider mb-1">{k.label}</p>
              <p className={`font-mono font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
