"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, TreatmentRecord, AttendanceRecord, TreatmentType } from "@/lib/types";
import { fetchBranches, fetchStaff, fetchTreatmentRecords, fetchAttendanceRecords, fetchTreatmentTypes, fetchPayrollStatuses } from "@/lib/db";
import { calcPayroll, rm } from "@/lib/calculations";
import { TrendingUp, DollarSign, Clock, AlertCircle, FileWarning, CheckCircle2 } from "lucide-react";
import Loading from "@/components/Loading";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-MY", { month: "long", year: "numeric" });
}
function last12Months() {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

const BRANCH_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  a: { bg: "rgba(13,148,136,0.08)",  text: "#2DD4BF", dot: "#0D9488" },
  b: { bg: "rgba(99,102,241,0.08)",  text: "#818CF8", dot: "#6366F1" },
  c: { bg: "rgba(244,63,94,0.08)",   text: "#FB7185", dot: "#F43F5E" },
};

export default function DashboardPage() {
  const [branches, setBranches]         = useState<Branch[]>([]);
  const [staff, setStaff]               = useState<Staff[]>([]);
  const [records, setRecords]           = useState<TreatmentRecord[]>([]);
  const [attendance, setAttendance]     = useState<AttendanceRecord[]>([]);
  const [treatmentTypes, setTTypes]     = useState<TreatmentType[]>([]);
  const [statuses, setStatuses]         = useState<Record<string, "draft" | "finalised">>({});
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [month, setMonth]               = useState(currentMonth);

  useEffect(() => { load(month); }, [month]);

  async function load(m: string) {
    try {
      setLoading(true);
      const [b, s, r, a, tt, st] = await Promise.all([
        fetchBranches(), fetchStaff(), fetchTreatmentRecords(m),
        fetchAttendanceRecords(m), fetchTreatmentTypes(), fetchPayrollStatuses(m),
      ]);
      setBranches(b); setStaff(s); setRecords(r);
      setAttendance(a); setTTypes(tt); setStatuses(st);
    } catch (e: unknown) {
      console.error("Dashboard load error:", e);
      const msg = e instanceof Error ? e.message : (e as Record<string, unknown>)?.message as string ?? JSON.stringify(e);
      setError(msg || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading text="Loading dashboard..." />;
  if (error)   return <div className="p-8 text-red-400">Error: {error}</div>;

  const activeStaff = staff.filter((s) => s.isActive);
  const payrolls = activeStaff.map((s) => calcPayroll(s, month, records, attendance, treatmentTypes));

  const totalGross    = payrolls.reduce((s, p) => s + p.grossPay, 0);
  const totalComm     = payrolls.reduce((s, p) => s + p.totalCommission, 0);
  const totalOtHours  = payrolls.reduce((s, p) => s + p.otHours, 0);
  const totalOtPay    = payrolls.reduce((s, p) => s + p.otPay, 0);
  const totalEpfEr    = payrolls.reduce((s, p) => s + p.epfEmployer, 0);

  const branchStats = branches.map((b) => {
    const bStaff    = activeStaff.filter((s) => s.branchId === b.id);
    const bPayrolls = payrolls.filter((p) => bStaff.some((s) => s.id === p.staffId));
    const bRecords  = records.filter((r) => r.branchId === b.id);
    const collection   = bRecords.reduce((s, r) => s + r.fee, 0);
    const payrollCost  = bPayrolls.reduce((s, p) => s + p.grossPay, 0);
    const commPayout   = bPayrolls.reduce((s, p) => s + p.totalCommission, 0);
    return { ...b, headcount: bStaff.length, collection, payrollCost, commPayout };
  });

  const totalCollection = branchStats.reduce((s, b) => s + b.collection, 0);
  const pendingCount    = activeStaff.filter((s) => statuses[s.id] !== "finalised").length;

  const kpis = [
    { label: "Total Collection",  value: rm(totalCollection), sub: monthLabel(month),                     icon: TrendingUp,  color: "#0D9488" },
    { label: "Total Payroll Cost",value: rm(totalGross),      sub: `EPF Employer: ${rm(totalEpfEr)}`,     icon: DollarSign,  color: "#6366F1" },
    { label: "Commission Payout", value: rm(totalComm),       sub: "Dentists only",                       icon: DollarSign,  color: "#F59E0B" },
    { label: "OT Hours",          value: `${totalOtHours.toFixed(1)} hrs`, sub: `${rm(totalOtPay)} OT pay`, icon: Clock,     color: "#F43F5E" },
  ];

  const ROLE_SHORT: Record<string, string> = {
    resident_dentist: "Resident Dr.", locum_dentist: "Locum Dr.",
    fulltime_da: "DSA (FT)", fulltime_dsa_monthly: "DSA (Monthly)", parttime_da: "DSA (PT)", supervisor: "Supervisor",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="fade-up flex items-start justify-between gap-4">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Overview</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Dashboard</h1>
          <p className="text-[#7B91BC] text-sm mt-1">Payroll period: {monthLabel(month)}</p>
        </div>
        <select className="inp w-auto text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          {last12Months().map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </div>

      {/* Alert */}
      {pendingCount > 0 && (
        <div className="fade-up delay-1 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            <strong>{pendingCount} staff</strong> payroll for {monthLabel(month)} not finalised.{" "}
            <a href="/payroll" className="underline text-amber-400">Review & Finalise →</a>
          </p>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className={`stat-card fade-up delay-${i + 2}`}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[#7B91BC] text-xs font-semibold uppercase tracking-wider">{k.label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: k.color + "20" }}>
                <k.icon size={15} style={{ color: k.color }} />
              </div>
            </div>
            <p className="font-mono text-xl font-bold text-[#E8F0FF]">{k.value}</p>
            <p className="text-xs text-[#7B91BC] mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Branch Cards */}
      <div>
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-[#7B91BC] mb-4 fade-up">Branch Summary</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {branchStats.map((b, i) => {
            const c = BRANCH_COLORS[b.colorKey];
            return (
              <div key={b.id} className={`fade-up delay-${i + 2} rounded-2xl border border-[#1E2D4A] p-5 relative overflow-hidden`} style={{ background: `linear-gradient(135deg, ${c.bg}, #0D1526)` }}>
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: c.dot }} />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-display font-bold text-[#E8F0FF] text-base">{b.name}</p>
                    <p className="text-xs text-[#7B91BC] mt-0.5">{b.headcount} active staff</p>
                  </div>
                  <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: c.dot, boxShadow: `0 0 8px ${c.dot}` }} />
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Collection",    value: rm(b.collection),   color: c.text },
                    { label: "Payroll Cost",  value: rm(b.payrollCost),  color: undefined },
                    { label: "Commission",    value: rm(b.commPayout),   color: undefined },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-xs text-[#7B91BC]">{label}</span>
                      <span className="font-mono text-sm font-bold" style={{ color: color ?? "#E8F0FF" }}>{value}</span>
                    </div>
                  ))}
                  <div className="pt-2">
                    <div className="flex justify-between text-[10px] text-[#7B91BC] mb-1">
                      <span>Payroll / Collection</span>
                      <span className="font-mono">{b.collection > 0 ? ((b.payrollCost / b.collection) * 100).toFixed(1) + "%" : "—"}</span>
                    </div>
                    <div className="h-1.5 bg-[#1E2D4A] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: b.collection > 0 ? `${Math.min(100, (b.payrollCost / b.collection) * 100)}%` : "0%", background: c.dot }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff payroll status table */}
      <div className="fade-up rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Staff Payroll Status</h2>
          {pendingCount > 0
            ? <span className="badge badge-draft"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{pendingCount} Pending</span>
            : <span className="badge badge-final"><CheckCircle2 size={10} /> All Finalised</span>
          }
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Staff</th><th>Branch</th><th>Role</th><th className="text-right">Gross Pay</th><th className="text-right">Net Pay</th><th>Basis</th><th>Status</th></tr>
            </thead>
            <tbody>
              {activeStaff.map((s) => {
                const p = payrolls.find((p) => p.staffId === s.id)!;
                const b = branches.find((b) => b.id === s.branchId)!;
                const fin = statuses[s.id] === "finalised";
                return (
                  <tr key={s.id}>
                    <td><p className="text-sm font-medium text-[#E8F0FF]">{s.name}</p></td>
                    <td>
                      {b && <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_COLORS[b.colorKey]?.dot }} />
                        <span className="text-sm text-[#7B91BC]">{b.name}</span>
                      </div>}
                    </td>
                    <td><span className="text-sm text-[#7B91BC]">{ROLE_SHORT[s.role]}</span></td>
                    <td className="text-right"><span className="font-mono text-sm text-[#E8F0FF]">{rm(p.grossPay)}</span></td>
                    <td className="text-right"><span className="font-mono text-sm font-bold text-teal-400">{rm(p.netPay)}</span></td>
                    <td>
                      {p.payBasis === "commission" ? <span className="badge badge-comm">Commission</span>
                      : p.payBasis === "hourly"    ? <span className="badge" style={{ background: "rgba(251,191,36,0.1)", color: "#FBB724", border: "1px solid rgba(251,191,36,0.2)" }}>Hourly</span>
                      : p.payBasis === "mixed"     ? <span className="badge" style={{ background: "rgba(168,85,247,0.1)", color: "#C084FC", border: "1px solid rgba(168,85,247,0.2)" }}>Per Day</span>
                      : <span className="badge badge-basic">Basic</span>}
                    </td>
                    <td>
                      {fin
                        ? <span className="badge badge-final"><CheckCircle2 size={10} /> Finalised</span>
                        : <span className="badge badge-draft"><FileWarning size={10} /> Draft</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[#1E2D4A] flex items-center justify-between">
          <p className="text-xs text-[#7B91BC]">Total employer cost (incl. EPF): <span className="font-mono text-[#E8F0FF]">{rm(totalGross + totalEpfEr)}</span></p>
          <a href="/payroll" className="btn btn-primary text-xs py-2 px-4">Process Payroll →</a>
        </div>
      </div>
    </div>
  );
}
