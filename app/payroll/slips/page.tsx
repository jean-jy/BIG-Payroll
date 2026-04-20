"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, TreatmentRecord, AttendanceRecord, TreatmentType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchTreatmentRecords, fetchAttendanceRecords, fetchTreatmentTypes, fetchPerformanceAllowances, PerformanceAllowanceMap } from "@/lib/db";
import { calcPayroll, rm } from "@/lib/calculations";
import { FileText, Download, Search } from "lucide-react";
import Loading from "@/components/Loading";

const MONTHS = [
  { label: "April 2026", value: "2026-04" },
  { label: "March 2026", value: "2026-03" },
];
const COMPANY_NAME = "Klinik Pergigian Harmoni Sdn Bhd";
const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };
const ROLE_LABEL: Record<string, string> = {
  resident_dentist: "Resident Dentist",
  locum_dentist: "Locum Dentist",
  fulltime_da: "Dental Surgery Assistant (Full-time)",
  fulltime_dsa_monthly: "Full Time DSA (Monthly)",
  parttime_da: "Dental Surgery Assistant (Part-time)",
  supervisor: "Supervisor",
};

export default function SlipsPage() {
  const [month, setMonth]           = useState("2026-04");
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [records, setRecords]       = useState<TreatmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tTypes, setTTypes]         = useState<TreatmentType[]>([]);
  const [allowances, setAllowances] = useState<PerformanceAllowanceMap>({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<string | null>(null);

  useEffect(() => { load(month); }, [month]);

  async function load(m: string) {
    setLoading(true);
    setSelected(null);
    try {
      const [b, s, r, a, tt, al] = await Promise.all([
        fetchBranches(), fetchStaff(), fetchTreatmentRecords(m),
        fetchAttendanceRecords(m), fetchTreatmentTypes(), fetchPerformanceAllowances(m),
      ]);
      setBranches(b); setStaff(s); setRecords(r); setAttendance(a); setTTypes(tt); setAllowances(al);
    } finally {
      setLoading(false);
    }
  }

  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? month;
  const activeStaff = staff.filter((s) => s.isActive);
  const payrolls = activeStaff.map((s) => ({
    staff: s,
    payroll: calcPayroll(s, month, records, attendance, tTypes, allowances[s.id] ?? 0),
  }));

  const filtered = payrolls.filter(({ staff: s }) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedEntry = selected ? payrolls.find((p) => p.staff.id === selected) : null;

  if (loading) return <Loading text="Loading payslips..." />;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Payroll</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Payroll Slips</h1>
          <p className="text-[#7B91BC] text-sm mt-1">{monthLabel} · {payrolls.length} slips</p>
        </div>
        <div className="flex gap-3">
          <select className="inp w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn btn-ghost"><Download size={14} /> Export All PDF</button>
        </div>
      </div>

      <div className="fade-up delay-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Staff list */}
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7B91BC]" />
            <input className="inp pl-9 text-sm" placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden divide-y divide-[#1E2D4A]/50">
            {filtered.map(({ staff: s, payroll: p }) => {
              const b = branches.find((br) => br.id === s.branchId);
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selected === s.id ? "bg-teal-500/10" : "hover:bg-white/[0.02]"}`}
                  onClick={() => setSelected(s.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-[#1A2744] flex items-center justify-center text-xs font-bold text-teal-400 flex-shrink-0">
                    {s.name.split(" ").filter(w => !["Dr.", "bin", "binti", "s/o", "d/o"].includes(w))[0]?.[0] ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#E8F0FF] truncate">{s.name}</p>
                    {b && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />
                        <p className="text-xs text-[#7B91BC] truncate">{b.name}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-sm font-bold text-teal-400">{rm(p.netPay)}</p>
                    <p className="text-[10px] text-[#7B91BC]">net</p>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-[#7B91BC] text-sm">No staff found.</div>
            )}
          </div>
        </div>

        {/* Slip preview */}
        <div className="lg:col-span-2">
          {selectedEntry ? (
            <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1E2D4A] flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm text-[#7B91BC]">
                  <FileText size={14} />
                  Payslip Preview
                </div>
                <button className="btn btn-primary text-xs py-2 px-4">
                  <Download size={12} /> Export PDF
                </button>
              </div>

              <div className="p-6 space-y-5">
                {(() => {
                  const { staff: s, payroll: p } = selectedEntry;
                  const isDentist = s.role === "resident_dentist" || s.role === "locum_dentist";
                  const branch = branches.find(b => b.id === s.branchId);
                  const slipNo = `PAY-${month.replace("-","")}-${s.id.slice(0,6).toUpperCase()}`;

                  // ── Dentist payslip (two-column layout) ──────────────────
                  if (isDentist) {
                    // Compute per-dentist record groups from raw records
                    const myRecs = records.filter(r => r.staffId === s.id);
                    const ttMap = Object.fromEntries(tTypes.map(t => [t.id, t]));

                    const totalCollected = myRecs.reduce((s, r) => s + r.fee, 0);
                    const onHoldTotal = p.onHoldBreakdown.reduce((s, x) => s + x.totalFee, 0);
                    const totalEarnings = totalCollected - onHoldTotal;

                    // Fixed material costs — group by treatment type (non-on-hold, non-variable, treatment only)
                    const matCostMap: Record<string, number> = {};
                    const variableRecs: typeof myRecs = [];
                    const labRecs: typeof myRecs = [];
                    const productRecs: typeof myRecs = [];
                    const medicineRecs: typeof myRecs = [];

                    for (const r of myRecs) {
                      const tt = ttMap[r.treatmentTypeId];
                      if (!tt || tt.isOnHold) continue;
                      if (r.saleCategory === "product") { productRecs.push(r); continue; }
                      if (r.saleCategory === "medicine") { medicineRecs.push(r); continue; }
                      if (tt.isLabCase) { labRecs.push(r); continue; }
                      if (tt.variableMaterialCost) { variableRecs.push(r); continue; }
                      if (tt.materialCost > 0) matCostMap[tt.name] = (matCostMap[tt.name] ?? 0) + tt.materialCost;
                    }

                    const totalFixedMat = Object.values(matCostMap).reduce((a, b) => a + b, 0);
                    const totalVariableMat = variableRecs.reduce((s, r) => s + (r.materialCostOverride ?? 0), 0);
                    const totalLabFees = labRecs.reduce((s, r) => s + (r.labCost ?? 0), 0);
                    const totalProducts = productRecs.reduce((s, r) => s + r.fee, 0);
                    const totalMedicine = medicineRecs.reduce((s, r) => s + r.fee, 0);
                    const totalDeductions = totalFixedMat + totalVariableMat + totalLabFees;
                    const afterDeductions = totalEarnings - totalDeductions;
                    const commRate = (s.commissionRate ?? 0) * 100;
                    const productComm = totalProducts * 0.1;
                    const medicineComm = totalMedicine * 0.5;

                    return (<>
                      {/* Company header */}
                      <div className="text-center pb-4 border-b border-[#1E2D4A]">
                        <p className="font-display font-bold text-[#E8F0FF] text-lg">BIG DENTAL</p>
                        <p className="text-sm font-semibold text-[#E8F0FF]">Big Dental Group Sdn Bhd <span className="text-[#7B91BC] font-normal">(202501031998)</span></p>
                        <p className="text-xs text-[#7B91BC] mt-0.5">No. 28 (Ground Floor), Jalan Lang Kuning, Kepong Baru, 52100 Kuala Lumpur.</p>
                      </div>

                      {/* Employee info row */}
                      <div className="grid grid-cols-2 gap-2 text-sm pb-3 border-b border-[#1E2D4A]">
                        <div><span className="text-teal-400 font-semibold">Employee Name: </span><span className="text-[#E8F0FF]">{s.name}</span></div>
                        <div className="text-right"><span className="text-teal-400 font-semibold">Pay Period: </span><span className="text-[#E8F0FF]">{monthLabel}</span></div>
                        <div><span className="text-teal-400 font-semibold">NRIC: </span><span className="text-[#E8F0FF]">{s.icNumber ?? "—"}</span></div>
                        <div className="text-right"><span className="text-teal-400 font-semibold">Department: </span><span className="text-[#E8F0FF]">{ROLE_LABEL[s.role]}</span></div>
                        <div><span className="text-teal-400 font-semibold">Branch: </span><span className="text-[#E8F0FF]">{branch?.name ?? "—"}</span></div>
                        <div className="text-right"><span className="text-teal-400 font-semibold">EPF No.: </span><span className="text-[#E8F0FF]">{s.epfNumber ?? "—"}</span></div>
                      </div>

                      {/* Two-column main body */}
                      <div className="grid grid-cols-2 gap-6 text-sm">
                        {/* LEFT — Earnings */}
                        <div>
                          <div className="grid grid-cols-2 font-bold text-[10px] uppercase tracking-widest text-[#7B91BC] border-b border-[#1E2D4A] pb-1 mb-2">
                            <span>EARNINGS</span><span className="text-right">AMOUNT</span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-[#E8F0FF]">Total Payment Collected</span>
                              <span className="font-mono text-[#E8F0FF]">{rm(totalCollected)}</span>
                            </div>
                            {p.onHoldBreakdown.map((oh) => (
                              <div key={oh.treatmentName} className="flex justify-between pl-3">
                                <span className="text-amber-400">Payment on Hold ({oh.treatmentName})</span>
                                <span className="font-mono text-amber-400">{rm(oh.totalFee)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between pt-1 border-t border-[#1E2D4A] font-semibold">
                              <span className="text-[#E8F0FF]">Total Earnings</span>
                              <span className="font-mono text-[#E8F0FF]">{rm(totalEarnings)}</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-[#1E2D4A] font-bold">
                              <span className="text-teal-400">After Deductions</span>
                              <span className="font-mono text-teal-400">{rm(afterDeductions)}</span>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT — Deductions */}
                        <div>
                          <div className="grid grid-cols-2 font-bold text-[10px] uppercase tracking-widest text-[#7B91BC] border-b border-[#1E2D4A] pb-1 mb-2">
                            <span>DEDUCTIONS</span><span className="text-right">AMOUNT</span>
                          </div>
                          <div className="space-y-1.5">
                            {/* Fixed material costs per treatment type */}
                            {Object.entries(matCostMap).map(([name, cost]) => (
                              <div key={name} className="flex justify-between">
                                <span className="text-[#7B91BC]">{name}</span>
                                <span className="font-mono text-red-400">{rm(cost)}</span>
                              </div>
                            ))}
                            {/* Products & Medicine */}
                            {productRecs.length > 0 && (
                              <div className="flex justify-between">
                                <span className="text-[#7B91BC]">Product (10% commission)</span>
                                <span className="font-mono text-amber-400">{rm(totalProducts)}</span>
                              </div>
                            )}
                            {medicineRecs.length > 0 && (
                              <div className="flex justify-between">
                                <span className="text-[#7B91BC]">Medicine (50% cost deducted, {commRate.toFixed(0)}% comm)</span>
                                <span className="font-mono text-rose-400">{rm(totalMedicine)}</span>
                              </div>
                            )}
                            {/* Variable material costs (e.g. Angel Aligner) */}
                            {variableRecs.length > 0 && (() => {
                              const byType: Record<string, typeof variableRecs> = {};
                              for (const r of variableRecs) {
                                const name = ttMap[r.treatmentTypeId]?.name ?? "Variable";
                                byType[name] = [...(byType[name] ?? []), r];
                              }
                              return Object.entries(byType).map(([typeName, recs]) => (
                                <div key={typeName}>
                                  <p className="text-xs font-bold text-[#E8F0FF] mt-2 mb-1">{typeName}:</p>
                                  {recs.map((r, i) => (
                                    <div key={i} className="flex justify-between pl-2">
                                      <span className="text-[#7B91BC] text-xs uppercase">{r.patientName}</span>
                                      <span className="font-mono text-xs text-red-400">{rm(r.materialCostOverride ?? 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              ));
                            })()}
                            {/* Lab fees */}
                            {labRecs.length > 0 && (
                              <div>
                                <p className="text-xs font-bold text-[#E8F0FF] mt-2 mb-1">Lab Fees:</p>
                                {Object.entries(
                                  labRecs.reduce<Record<string, number>>((acc, r) => {
                                    acc[r.patientName] = (acc[r.patientName] ?? 0) + (r.labCost ?? 0);
                                    return acc;
                                  }, {})
                                ).map(([name, total], i) => (
                                  <div key={i} className="flex justify-between pl-2">
                                    <span className="text-[#7B91BC] text-xs uppercase">{name}</span>
                                    <span className="font-mono text-xs text-red-400">{rm(total)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex justify-between pt-1 border-t border-[#1E2D4A] font-bold">
                              <span className="text-[#E8F0FF]">Total Deductions</span>
                              <span className="font-mono text-red-400">{rm(totalDeductions)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Commission summary */}
                      <div className="border-t border-[#1E2D4A] pt-4 space-y-1.5 text-sm">
                        <div className="flex justify-between font-bold">
                          <span className="text-[#E8F0FF]">{commRate.toFixed(0)}% Commission</span>
                          <span className="font-mono text-teal-400">{rm(afterDeductions * (s.commissionRate ?? 0))}</span>
                        </div>
                        {productComm > 0 && (
                          <div className="flex justify-between">
                            <span className="text-[#7B91BC]">10% Product Commission</span>
                            <span className="font-mono text-amber-400">{rm(productComm)}</span>
                          </div>
                        )}
                        {medicineComm > 0 && (
                          <div className="flex justify-between">
                            <span className="text-[#7B91BC]">50% Medicine Commission</span>
                            <span className="font-mono text-rose-400">{rm(medicineComm)}</span>
                          </div>
                        )}
                        {p.performanceAllowance > 0 && (
                          <div className="flex justify-between">
                            <span className="text-[#7B91BC]">Performance Allowance</span>
                            <span className="font-mono text-violet-400">{rm(p.performanceAllowance)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-base pt-2 border-t border-[#1E2D4A]">
                          <span className="text-[#E8F0FF]">Net Salary</span>
                          <span className="font-mono text-teal-400">{rm(p.netPay)}</span>
                        </div>
                      </div>

                      {/* Statutory deductions note */}
                      <div className="rounded-xl border border-[#1E2D4A] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B91BC] mb-2">Statutory Deductions (from net salary)</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          <div className="flex justify-between"><span className="text-[#7B91BC]">EPF (11%)</span><span className="font-mono text-red-400">−{rm(p.epfEmployee)}</span></div>
                          <div className="flex justify-between"><span className="text-[#7B91BC]">EPF Employer ({p.grossPay <= 5000 ? "13" : "12"}%)</span><span className="font-mono text-indigo-400">{rm(p.epfEmployer)}</span></div>
                          <div className="flex justify-between"><span className="text-[#7B91BC]">SOCSO (0.5%)</span><span className="font-mono text-red-400">−{rm(p.socsoEmployee)}</span></div>
                          <div className="flex justify-between"><span className="text-[#7B91BC]">SOCSO Employer (1.75%)</span><span className="font-mono text-indigo-400">{rm(p.socsoEmployer)}</span></div>
                          <div className="flex justify-between"><span className="text-[#7B91BC]">EIS (0.2%)</span><span className="font-mono text-red-400">−{rm(p.eisEmployee)}</span></div>
                          <div className="flex justify-between"><span className="text-[#7B91BC]">EIS Employer (0.2%)</span><span className="font-mono text-indigo-400">{rm(p.eisEmployer)}</span></div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#1E2D4A] text-[10px] text-[#7B91BC] flex justify-between">
                        <span>Generated: {new Date().toLocaleDateString("en-MY")} · Slip No. {slipNo}</span>
                        <span>This is a computer-generated payslip. No signature required.</span>
                      </div>
                    </>);
                  }

                  // ── DA / Supervisor payslip (single-column, unchanged) ───
                  return (<>
                    <div className="flex justify-between items-start pb-4 border-b border-[#1E2D4A]">
                      <div>
                        <p className="font-display font-bold text-[#E8F0FF] text-base">Big Dental Group Sdn Bhd</p>
                        <p className="text-xs text-[#7B91BC] mt-0.5">Payslip for {monthLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs text-[#7B91BC]">Slip No.</p>
                        <p className="font-mono text-sm text-[#E8F0FF]">{slipNo}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ["Staff Name", s.name], ["Position", ROLE_LABEL[s.role]],
                        ["Branch", branch?.name ?? ""], ["IC Number", s.icNumber ?? "—"],
                        ["EPF No.", s.epfNumber ?? "—"], ["SOCSO No.", s.socsoNumber ?? "—"],
                        ["Bank Account", s.bankAccount ?? "—"], ["Pay Period", `01 ${monthLabel} – 31 ${monthLabel}`],
                      ].map(([label, val]) => (
                        <div key={label} className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[#7B91BC] uppercase tracking-wider font-semibold">{label}</span>
                          <span className="text-[#E8F0FF] text-sm">{val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                      <table className="tbl text-sm">
                        <thead><tr><th>Earnings</th><th className="text-right">Amount</th></tr></thead>
                        <tbody>
                          <tr><td className="text-[#7B91BC]">{s.role === "parttime_da" ? "Hourly Pay" : "Basic Salary"}</td><td className="text-right font-mono text-[#E8F0FF]">{rm(p.basicOrDailyOrHourly)}</td></tr>
                          {p.otPay > 0 && <tr><td className="text-[#7B91BC]">OT ({p.otHours.toFixed(1)} hrs × RM12)</td><td className="text-right font-mono text-amber-400">+{rm(p.otPay)}</td></tr>}
                          {p.earlyLeavePenalty > 0 && <tr><td className="text-[#7B91BC]">Early Leave ({p.earlyLeaveHours.toFixed(1)} hrs)</td><td className="text-right font-mono text-red-400">−{rm(p.earlyLeavePenalty)}</td></tr>}
                          {p.performanceAllowance > 0 && <tr><td className="text-[#7B91BC]">Performance Allowance</td><td className="text-right font-mono text-violet-400">+{rm(p.performanceAllowance)}</td></tr>}
                          <tr className="border-t border-[#1E2D4A]"><td className="font-bold text-[#E8F0FF]">Gross Pay</td><td className="text-right font-mono font-bold text-[#E8F0FF]">{rm(p.grossPay)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                      <table className="tbl text-sm">
                        <thead><tr><th>Deductions</th><th className="text-right">Amount</th></tr></thead>
                        <tbody>
                          <tr><td className="text-[#7B91BC]">EPF (11%)</td><td className="text-right font-mono text-red-400">−{rm(p.epfEmployee)}</td></tr>
                          <tr><td className="text-[#7B91BC]">SOCSO (0.5%)</td><td className="text-right font-mono text-red-400">−{rm(p.socsoEmployee)}</td></tr>
                          <tr><td className="text-[#7B91BC]">EIS (0.2%)</td><td className="text-right font-mono text-red-400">−{rm(p.eisEmployee)}</td></tr>
                          <tr className="border-t border-[#1E2D4A]"><td className="font-bold text-[#E8F0FF]">Net Pay</td><td className="text-right font-mono font-bold text-teal-400">{rm(p.netPay)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-1 text-xs">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Employer Contributions</p>
                      <div className="flex justify-between"><span className="text-[#7B91BC]">EPF ({p.grossPay <= 5000 ? "13" : "12"}%)</span><span className="font-mono text-indigo-400">{rm(p.epfEmployer)}</span></div>
                      <div className="flex justify-between"><span className="text-[#7B91BC]">SOCSO (1.75%)</span><span className="font-mono text-indigo-400">{rm(p.socsoEmployer)}</span></div>
                      <div className="flex justify-between"><span className="text-[#7B91BC]">EIS (0.2%)</span><span className="font-mono text-indigo-400">{rm(p.eisEmployer)}</span></div>
                    </div>
                    <div className="pt-2 border-t border-[#1E2D4A] text-[10px] text-[#7B91BC] flex justify-between">
                      <span>Generated: {new Date().toLocaleDateString("en-MY")}</span>
                      <span>This is a computer-generated payslip. No signature required.</span>
                    </div>
                  </>);
                })()}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] h-64 flex flex-col items-center justify-center gap-3">
              <FileText size={32} className="text-[#7B91BC] opacity-30" />
              <p className="text-[#7B91BC] text-sm">Select a staff member to preview their payslip</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
