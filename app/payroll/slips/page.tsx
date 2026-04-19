"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, TreatmentRecord, AttendanceRecord, TreatmentType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchTreatmentRecords, fetchAttendanceRecords, fetchTreatmentTypes } from "@/lib/db";
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
  fulltime_da: "Dental Assistant (Full-time)",
  parttime_da: "Dental Assistant (Part-time)",
  supervisor: "Supervisor",
};

export default function SlipsPage() {
  const [month, setMonth]           = useState("2026-04");
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [records, setRecords]       = useState<TreatmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tTypes, setTTypes]         = useState<TreatmentType[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<string | null>(null);

  useEffect(() => { load(month); }, [month]);

  async function load(m: string) {
    setLoading(true);
    setSelected(null);
    try {
      const [b, s, r, a, tt] = await Promise.all([
        fetchBranches(), fetchStaff(), fetchTreatmentRecords(m),
        fetchAttendanceRecords(m), fetchTreatmentTypes(),
      ]);
      setBranches(b); setStaff(s); setRecords(r); setAttendance(a); setTTypes(tt);
    } finally {
      setLoading(false);
    }
  }

  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? month;
  const activeStaff = staff.filter((s) => s.isActive);
  const payrolls = activeStaff.map((s) => ({
    staff: s,
    payroll: calcPayroll(s, month, records, attendance, tTypes),
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
                {/* Header */}
                <div className="flex justify-between items-start pb-4 border-b border-[#1E2D4A]">
                  <div>
                    <p className="font-display font-bold text-[#E8F0FF] text-base">{COMPANY_NAME}</p>
                    <p className="text-xs text-[#7B91BC] mt-0.5">Payslip for {monthLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-[#7B91BC]">Slip No.</p>
                    <p className="font-mono text-sm text-[#E8F0FF]">PAY-{month.replace("-", "")}-{selectedEntry.staff.id.slice(0, 6).toUpperCase()}</p>
                  </div>
                </div>

                {/* Staff info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Staff Name",   selectedEntry.staff.name],
                    ["Position",     ROLE_LABEL[selectedEntry.staff.role]],
                    ["Branch",       branches.find(b => b.id === selectedEntry.staff.branchId)?.name ?? ""],
                    ["IC Number",    selectedEntry.staff.icNumber ?? "—"],
                    ["EPF No.",      selectedEntry.staff.epfNumber ?? "—"],
                    ["SOCSO No.",    selectedEntry.staff.socsoNumber ?? "—"],
                    ["Bank Account", selectedEntry.staff.bankAccount ?? "—"],
                    ["Pay Period",   `01 ${monthLabel} – 30 ${monthLabel}`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-[#7B91BC] uppercase tracking-wider font-semibold">{label}</span>
                      <span className="text-[#E8F0FF] text-sm">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Earnings */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B91BC] mb-2">Earnings</p>
                  <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                    <table className="tbl text-sm">
                      <thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
                      <tbody>
                        {selectedEntry.payroll.payBasis !== "commission" && (
                          <tr>
                            <td className="text-[#7B91BC]">
                              {selectedEntry.staff.role === "locum_dentist" ? "Daily Rate Pay" :
                               selectedEntry.staff.role === "parttime_da"  ? "Hourly Pay" : "Basic Salary"}
                            </td>
                            <td className="text-right font-mono text-[#E8F0FF]">{rm(selectedEntry.payroll.basicOrDailyOrHourly)}</td>
                          </tr>
                        )}
                        {selectedEntry.payroll.payBasis === "commission" && (
                          <tr>
                            <td className="text-[#7B91BC]">Commission (replaces basic — higher)</td>
                            <td className="text-right font-mono text-[#E8F0FF]">{rm(selectedEntry.payroll.totalCommission)}</td>
                          </tr>
                        )}
                        {selectedEntry.payroll.otPay > 0 && (
                          <tr>
                            <td className="text-[#7B91BC]">OT ({selectedEntry.payroll.otHours.toFixed(1)} hrs × RM12)</td>
                            <td className="text-right font-mono text-amber-400">+{rm(selectedEntry.payroll.otPay)}</td>
                          </tr>
                        )}
                        {selectedEntry.payroll.earlyLeavePenalty > 0 && (
                          <tr>
                            <td className="text-[#7B91BC]">Early Leave Deduction ({selectedEntry.payroll.earlyLeaveHours.toFixed(1)} hrs)</td>
                            <td className="text-right font-mono text-red-400">−{rm(selectedEntry.payroll.earlyLeavePenalty)}</td>
                          </tr>
                        )}
                        <tr className="border-t border-[#1E2D4A]">
                          <td className="font-bold text-[#E8F0FF]">Gross Pay</td>
                          <td className="text-right font-mono font-bold text-[#E8F0FF]">{rm(selectedEntry.payroll.grossPay)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Deductions */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B91BC] mb-2">Deductions (Employee)</p>
                  <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                    <table className="tbl text-sm">
                      <thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
                      <tbody>
                        <tr><td className="text-[#7B91BC]">EPF (Employee 11%)</td><td className="text-right font-mono text-red-400">−{rm(selectedEntry.payroll.epfEmployee)}</td></tr>
                        <tr><td className="text-[#7B91BC]">SOCSO (Employee 0.5%)</td><td className="text-right font-mono text-red-400">−{rm(selectedEntry.payroll.socsoEmployee)}</td></tr>
                        <tr><td className="text-[#7B91BC]">EIS (Employee 0.2%)</td><td className="text-right font-mono text-red-400">−{rm(selectedEntry.payroll.eisEmployee)}</td></tr>
                        <tr className="border-t border-[#1E2D4A]">
                          <td className="font-bold text-[#E8F0FF]">Total Deductions</td>
                          <td className="text-right font-mono font-bold text-red-400">−{rm(selectedEntry.payroll.totalDeductions)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Employer contributions note */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B91BC] mb-2">Employer Contributions (not deducted from pay)</p>
                  <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                    <table className="tbl text-sm">
                      <thead><tr><th>Description</th><th className="text-right">Amount</th></tr></thead>
                      <tbody>
                        <tr><td className="text-[#7B91BC]">EPF (Employer 13%/12%)</td><td className="text-right font-mono text-indigo-400">{rm(selectedEntry.payroll.epfEmployer)}</td></tr>
                        <tr><td className="text-[#7B91BC]">SOCSO (Employer 1.75%)</td><td className="text-right font-mono text-indigo-400">{rm(selectedEntry.payroll.socsoEmployer)}</td></tr>
                        <tr><td className="text-[#7B91BC]">EIS (Employer 0.2%)</td><td className="text-right font-mono text-indigo-400">{rm(selectedEntry.payroll.eisEmployer)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Net pay */}
                <div className="rounded-xl p-4 flex justify-between items-center" style={{ background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)" }}>
                  <div>
                    <p className="text-xs text-teal-400 uppercase tracking-wider font-bold mb-1">Net Pay</p>
                    <p className="text-xs text-[#7B91BC]">Amount to be credited to bank account</p>
                  </div>
                  <p className="font-mono text-2xl font-bold text-teal-400">{rm(selectedEntry.payroll.netPay)}</p>
                </div>

                {/* Commission detail */}
                {selectedEntry.payroll.commissionBreakdown.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B91BC] mb-2">
                      Commission Detail ({selectedEntry.payroll.commissionBreakdown.length} records)
                    </p>
                    <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                      <div className="overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="tbl text-xs">
                          <thead>
                            <tr>
                              <th>Date</th><th>Patient</th><th>Treatment</th>
                              <th className="text-right">Fee</th><th className="text-right">Cost</th>
                              <th className="text-right">Net</th><th className="text-right">%</th><th className="text-right">Comm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedEntry.payroll.commissionBreakdown.map((line, i) => (
                              <tr key={i}>
                                <td className="font-mono text-[#7B91BC]">{line.date.slice(5)}</td>
                                <td className="text-[#7B91BC] text-[10px]">{line.patientName}</td>
                                <td>{line.treatmentName}</td>
                                <td className="text-right font-mono">{line.fee}</td>
                                <td className="text-right font-mono text-red-400">{(line.materialCost + line.labCost) || "—"}</td>
                                <td className="text-right font-mono">{line.netBase.toFixed(0)}</td>
                                <td className="text-right font-mono">{(line.rate * 100).toFixed(0)}%</td>
                                <td className="text-right font-mono font-bold text-teal-400">{line.commission.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="pt-2 border-t border-[#1E2D4A] text-[10px] text-[#7B91BC] flex justify-between">
                  <span>Generated: {new Date().toLocaleDateString("en-MY")}</span>
                  <span>This is a computer-generated payslip. No signature required.</span>
                </div>
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
