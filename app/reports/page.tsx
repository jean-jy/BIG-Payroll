"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, TreatmentRecord, AttendanceRecord, TreatmentType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchTreatmentRecords, fetchAttendanceRecords, fetchTreatmentTypes } from "@/lib/db";
import { calcPayroll, calcCommissionLine, rm } from "@/lib/calculations";
import { MONTHS } from "@/lib/months";
import { Download, TrendingUp, DollarSign, Clock, Home } from "lucide-react";
import Loading from "@/components/Loading";
const BRANCH_COLOR: Record<string, { text: string; bar: string; bg: string }> = {
  a: { text: "#2DD4BF", bar: "#0D9488", bg: "rgba(13,148,136,0.12)" },
  b: { text: "#818CF8", bar: "#6366F1", bg: "rgba(99,102,241,0.12)" },
  c: { text: "#FB7185", bar: "#F43F5E", bg: "rgba(244,63,94,0.12)" },
};

export default function ReportsPage() {
  const [month, setMonth]           = useState("2026-04");
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [records, setRecords]       = useState<TreatmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tTypes, setTTypes]         = useState<TreatmentType[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => { load(month); }, [month]);

  async function load(m: string) {
    setLoading(true);
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

  const activeStaff = staff.filter((s) => s.isActive);
  const payrolls = activeStaff.map((s) => calcPayroll(s, month, records, attendance, tTypes));

  const branchStats = branches.map((b) => {
    const bStaff    = activeStaff.filter((s) => s.branchId === b.id);
    const bPayrolls = payrolls.filter((p) => bStaff.some((s) => s.id === p.staffId));
    const bRecords  = records.filter((r) => r.branchId === b.id);
    const collection  = bRecords.reduce((s, r) => s + r.fee, 0);
    const payrollCost = bPayrolls.reduce((s, p) => s + p.grossPay, 0);
    const commPayout  = bPayrolls.reduce((s, p) => s + p.totalCommission, 0);
    const otPay       = bPayrolls.reduce((s, p) => s + p.otPay, 0);
    const epfEr       = bPayrolls.reduce((s, p) => s + p.epfEmployer + p.socsoEmployer + p.eisEmployer, 0);
    return { ...b, collection, payrollCost, commPayout, otPay, epfEr, txCount: bRecords.length, headcount: bStaff.length };
  });

  const totals = branchStats.reduce(
    (a, b) => ({ collection: a.collection + b.collection, payrollCost: a.payrollCost + b.payrollCost, commPayout: a.commPayout + b.commPayout, otPay: a.otPay + b.otPay, epfEr: a.epfEr + b.epfEr }),
    { collection: 0, payrollCost: 0, commPayout: 0, otPay: 0, epfEr: 0 }
  );

  const maxCollection = Math.max(...branchStats.map((b) => b.collection), 1);

  const txSummary: Record<string, { name: string; count: number; revenue: number }> = {};
  records.forEach((r) => {
    const tt = tTypes.find((t) => t.id === r.treatmentTypeId);
    if (!tt) return;
    if (!txSummary[r.treatmentTypeId]) txSummary[r.treatmentTypeId] = { name: tt.name, count: 0, revenue: 0 };
    txSummary[r.treatmentTypeId].count++;
    txSummary[r.treatmentTypeId].revenue += r.fee;
  });
  const topTx = Object.values(txSummary).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  const doctors = activeStaff.filter((s) => s.role === "resident_dentist" || s.role === "locum_dentist");
  const ttMap = Object.fromEntries(tTypes.map((t) => [t.id, t]));
  // Per-branch rows: keyed by where the records are, not the doctor's home branch
  const doctorBranchRows = branches.flatMap((b) => {
    const bRecords = records.filter((r) => r.branchId === b.id);
    return doctors
      .filter((doc) => bRecords.some((r) => r.staffId === doc.id))
      .map((doc) => {
        const docBranchRecords = bRecords.filter((r) => r.staffId === doc.id);
        const collection = docBranchRecords.reduce((s, r) => s + r.fee, 0);
        const commission = docBranchRecords.reduce((s, r) => {
          const tt = ttMap[r.treatmentTypeId];
          if (!tt || r.isOnHold || tt.isOnHold) return s;
          return s + calcCommissionLine(r, tt, doc.commissionRate ?? 0).commission;
        }, 0);
        const payroll = payrolls.find((p) => p.staffId === doc.id);
        return {
          branchId: b.id,
          id: doc.id,
          name: doc.name,
          role: doc.role,
          isHomeBranch: doc.branchId === b.id,
          collection,
          commission,
          grossPay: payroll?.grossPay ?? 0,
          payBasis: payroll?.payBasis ?? ("basic" as const),
        };
      })
      .sort((a, x) => x.collection - a.collection);
  });

  if (loading) return <Loading text="Loading reports..." />;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Analytics</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Branch Reports</h1>
        </div>
        <div className="flex gap-3">
          <select className="inp w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn btn-ghost"><Download size={14} /> Export</button>
        </div>
      </div>

      <div className="fade-up delay-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Collection",  value: rm(totals.collection),  icon: TrendingUp, color: "#0D9488" },
          { label: "Total Payroll",     value: rm(totals.payrollCost), icon: DollarSign, color: "#6366F1" },
          { label: "Commission Out",    value: rm(totals.commPayout),  icon: DollarSign, color: "#F59E0B" },
          { label: "Total OT Pay",      value: rm(totals.otPay),       icon: Clock,      color: "#FB7185" },
        ].map((k) => (
          <div key={k.label} className="stat-card">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[#7B91BC] text-xs font-semibold uppercase tracking-wider">{k.label}</p>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: k.color + "20" }}>
                <k.icon size={13} style={{ color: k.color }} />
              </div>
            </div>
            <p className="font-mono text-lg font-bold text-[#E8F0FF]">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="fade-up delay-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collection bars */}
        <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5 space-y-4">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Collection by Branch</h2>
          {branchStats.map((b) => {
            const c = BRANCH_COLOR[b.colorKey];
            return (
              <div key={b.id}>
                <div className="flex justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: c.bar }} />
                    <span className="text-sm font-medium text-[#E8F0FF]">{b.name}</span>
                  </div>
                  <span className="font-mono text-sm font-bold" style={{ color: c.text }}>{rm(b.collection)}</span>
                </div>
                <div className="h-2.5 bg-[#1E2D4A] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(b.collection / maxCollection) * 100}%`, background: c.bar }} />
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-[#7B91BC]">
                  <span>{b.txCount} treatments</span><span>{b.headcount} staff</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Payroll ratio */}
        <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5 space-y-4">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Payroll / Collection Ratio</h2>
          {branchStats.map((b) => {
            const c = BRANCH_COLOR[b.colorKey];
            const ratio = b.collection > 0 ? (b.payrollCost / b.collection) * 100 : 0;
            const isHigh = ratio > 60;
            return (
              <div key={b.id}>
                <div className="flex justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: c.bar }} />
                    <span className="text-sm font-medium text-[#E8F0FF]">{b.name}</span>
                  </div>
                  <span className={`font-mono text-sm font-bold ${isHigh ? "text-amber-400" : "text-emerald-400"}`}>{ratio.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 bg-[#1E2D4A] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio)}%`, background: isHigh ? "#F59E0B" : "#10B981" }} />
                </div>
                <p className="text-[10px] text-[#7B91BC] mt-1">Payroll {rm(b.payrollCost)} vs Collection {rm(b.collection)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {topTx.length > 0 && (
        <div className="fade-up delay-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2D4A]">
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Top Treatments by Revenue</h2>
          </div>
          <table className="tbl">
            <thead><tr><th>Treatment</th><th className="text-right">Count</th><th className="text-right">Total Revenue</th><th className="text-right">Avg Fee</th></tr></thead>
            <tbody>
              {topTx.map((t) => (
                <tr key={t.name}>
                  <td className="text-sm text-[#E8F0FF]">{t.name}</td>
                  <td className="text-right font-mono text-sm text-[#7B91BC]">{t.count}</td>
                  <td className="text-right font-mono text-sm font-bold text-teal-400">{rm(t.revenue)}</td>
                  <td className="text-right font-mono text-sm text-[#7B91BC]">{rm(t.revenue / t.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fade-up delay-4 space-y-4">
        <div className="px-1">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Doctor Breakdown by Branch</h2>
        </div>
        {branches.map((b) => {
          const c = BRANCH_COLOR[b.colorKey];
          const branchDoctors = doctorBranchRows.filter((d) => d.branchId === b.id);
          if (branchDoctors.length === 0) return null;
          const branchCollection = branchStats.find((bs) => bs.id === b.id)?.collection ?? 0;
          return (
            <div key={b.id} className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1E2D4A]" style={{ background: c.bg }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.bar }} />
                  <span className="font-display font-bold text-sm text-[#E8F0FF]">{b.name}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th className="text-right">Collection</th>
                      <th className="text-right">% of Branch</th>
                      <th className="text-right">Commission</th>
                      <th className="text-right">Payroll (total)</th>
                      <th className="text-right">Pay Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchDoctors.map((d) => {
                      const pct = branchCollection > 0 ? (d.collection / branchCollection) * 100 : 0;
                      return (
                        <tr key={d.id}>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <div>
                                <p className="text-sm font-medium text-[#E8F0FF]">{d.name}</p>
                                <p className="text-[10px] text-[#7B91BC]">{d.role === "resident_dentist" ? "Resident" : "Locum"}</p>
                              </div>
                              {d.isHomeBranch && <Home size={11} className="text-[#4A6FA5] shrink-0" />}
                            </div>
                          </td>
                          <td className="text-right font-mono text-sm font-bold" style={{ color: c.text }}>{rm(d.collection)}</td>
                          <td className="text-right font-mono text-sm text-[#7B91BC]">{pct.toFixed(1)}%</td>
                          <td className="text-right font-mono text-sm text-amber-400">{rm(d.commission)}</td>
                          <td className="text-right font-mono text-sm text-[#E8F0FF]">
                            {d.isHomeBranch ? rm(d.grossPay) : <span className="text-[#4A6FA5]">—</span>}
                          </td>
                          <td className="text-right">
                            {d.isHomeBranch && (
                              <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${d.payBasis === "commission" ? "bg-amber-500/20 text-amber-400" : "bg-indigo-500/20 text-indigo-400"}`}>
                                {d.payBasis}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fade-up delay-5 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A]">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Branch Summary Table</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Branch</th><th className="text-right">Collection</th><th className="text-right">Payroll</th><th className="text-right">Commission</th><th className="text-right">OT</th><th className="text-right">EPF+SOCSO+EIS (ER)</th><th className="text-right">Total Cost</th></tr></thead>
            <tbody>
              {branchStats.map((b) => {
                const c = BRANCH_COLOR[b.colorKey];
                return (
                  <tr key={b.id}>
                    <td><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: c.bar }} /><span className="text-sm font-semibold text-[#E8F0FF]">{b.name}</span></div></td>
                    <td className="text-right font-mono text-sm font-bold" style={{ color: c.text }}>{rm(b.collection)}</td>
                    <td className="text-right font-mono text-sm text-[#E8F0FF]">{rm(b.payrollCost)}</td>
                    <td className="text-right font-mono text-sm text-[#7B91BC]">{rm(b.commPayout)}</td>
                    <td className="text-right font-mono text-sm text-amber-400">{rm(b.otPay)}</td>
                    <td className="text-right font-mono text-sm text-indigo-400">{rm(b.epfEr)}</td>
                    <td className="text-right font-mono text-sm font-bold text-[#E8F0FF]">{rm(b.payrollCost + b.epfEr)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[#2A3D66]">
                <td className="font-bold text-[#E8F0FF]">TOTAL</td>
                <td className="text-right font-mono font-bold text-teal-400">{rm(totals.collection)}</td>
                <td className="text-right font-mono font-bold text-[#E8F0FF]">{rm(totals.payrollCost)}</td>
                <td className="text-right font-mono font-bold text-[#7B91BC]">{rm(totals.commPayout)}</td>
                <td className="text-right font-mono font-bold text-amber-400">{rm(totals.otPay)}</td>
                <td className="text-right font-mono font-bold text-indigo-400">{rm(totals.epfEr)}</td>
                <td className="text-right font-mono font-bold text-[#E8F0FF]">{rm(totals.payrollCost + totals.epfEr)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
