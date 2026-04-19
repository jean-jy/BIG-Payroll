"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, TreatmentRecord, AttendanceRecord, TreatmentType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchTreatmentRecords, fetchAttendanceRecords, fetchTreatmentTypes, fetchPayrollStatuses, finalisePayroll, finaliseAllPayroll } from "@/lib/db";
import { calcPayroll, rm } from "@/lib/calculations";
import { ChevronDown, ChevronRight, CheckCircle2, Lock, AlertCircle, ArrowUp } from "lucide-react";
import Loading from "@/components/Loading";

const MONTH = "2026-04";
const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };
const ROLE_SHORT: Record<string, string> = {
  resident_dentist: "Resident Dr.", locum_dentist: "Locum Dr.",
  fulltime_da: "DA (FT)", parttime_da: "DA (PT)", supervisor: "Supervisor",
};

export default function PayrollPage() {
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [records, setRecords]       = useState<TreatmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tTypes, setTTypes]         = useState<TreatmentType[]>([]);
  const [statuses, setStatuses]     = useState<Record<string, "draft" | "finalised">>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [b, s, r, a, tt, st] = await Promise.all([
        fetchBranches(), fetchStaff(), fetchTreatmentRecords(MONTH),
        fetchAttendanceRecords(MONTH), fetchTreatmentTypes(), fetchPayrollStatuses(MONTH),
      ]);
      setBranches(b); setStaff(s); setRecords(r);
      setAttendance(a); setTTypes(tt); setStatuses(st);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const activeStaff = staff.filter((s) => s.isActive);
  const payrolls = activeStaff.map((s) => ({
    staff: s,
    payroll: calcPayroll(s, MONTH, records, attendance, tTypes),
  }));

  const totalGross = payrolls.reduce((s, p) => s + p.payroll.grossPay, 0);
  const totalNet   = payrolls.reduce((s, p) => s + p.payroll.netPay, 0);
  const totalEpfEe = payrolls.reduce((s, p) => s + p.payroll.epfEmployee, 0);
  const totalEpfEr = payrolls.reduce((s, p) => s + p.payroll.epfEmployer, 0);
  const totalSocso = payrolls.reduce((s, p) => s + p.payroll.socsoEmployee + p.payroll.socsoEmployer, 0);
  const totalEis   = payrolls.reduce((s, p) => s + p.payroll.eisEmployee + p.payroll.eisEmployer, 0);

  async function handleFinalise(staffId: string) {
    try {
      setSaving(true);
      await finalisePayroll(staffId, MONTH);
      setStatuses((prev) => ({ ...prev, [staffId]: "finalised" }));
    } catch { setError("Failed to finalise"); } finally { setSaving(false); }
  }

  async function handleFinaliseAll() {
    try {
      setSaving(true);
      const ids = activeStaff.map((s) => s.id);
      await finaliseAllPayroll(ids, MONTH);
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
          <p className="text-[#7B91BC] text-sm mt-1">April 2026 · {activeStaff.length} staff</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select className="inp w-auto text-sm"><option>April 2026</option></select>
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
                        {(s.role === "fulltime_da" || s.role === "supervisor") && (
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
                            <span className="text-sm text-[#7B91BC]">OT ({p.otHours.toFixed(1)} hrs × RM12)</span>
                            <span className="font-mono text-sm text-amber-400">+{rm(p.otPay)}</span>
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

                      {/* Commission breakdown */}
                      {p.commissionBreakdown.length > 0 && (
                        <div>
                          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#7B91BC] mb-4">Commission ({p.commissionBreakdown.length} items)</h3>
                          <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                            <div className="overflow-x-auto max-h-72 overflow-y-auto">
                              <table className="tbl text-xs">
                                <thead><tr><th>Date</th><th>Treatment</th><th className="text-right">Fee</th><th className="text-right">−Cost</th><th className="text-right">−Lab</th><th className="text-right">Net</th><th className="text-right">%</th><th className="text-right">Comm</th></tr></thead>
                                <tbody>
                                  {p.commissionBreakdown.map((line, i) => (
                                    <tr key={i}>
                                      <td className="font-mono text-[#7B91BC]">{line.date.slice(5)}</td>
                                      <td><div className="text-[#E8F0FF]">{line.treatmentName}</div><div className="text-[#7B91BC] text-[10px]">{line.patientName}</div></td>
                                      <td className="text-right font-mono">{line.fee}</td>
                                      <td className="text-right font-mono text-red-400">{line.materialCost > 0 ? `−${line.materialCost}` : "—"}</td>
                                      <td className="text-right font-mono text-red-400">{line.labCost > 0 ? `−${line.labCost.toFixed(0)}` : "—"}</td>
                                      <td className="text-right font-mono">{line.netBase.toFixed(0)}</td>
                                      <td className="text-right font-mono text-[#7B91BC]">{(line.rate * 100).toFixed(0)}%</td>
                                      <td className="text-right font-mono font-bold text-teal-400">{line.commission.toFixed(2)}</td>
                                    </tr>
                                  ))}
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
