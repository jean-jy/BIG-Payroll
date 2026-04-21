"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Branch, Staff, TreatmentRecord, TreatmentType } from "@/lib/types";
import {
  fetchBranches, fetchStaff, fetchTreatmentRecords, fetchTreatmentTypes,
  updateLabCost, updateRecordOnHold,
} from "@/lib/db";
import { rm } from "@/lib/calculations";
import {
  ChevronDown, ChevronRight, PauseCircle, PlayCircle,
  AlertCircle, ArrowRight, CheckCircle2, FlaskConical,
} from "lucide-react";
import Loading from "@/components/Loading";

const MONTHS = [
  { label: "April 2026",    value: "2026-04" },
  { label: "March 2026",    value: "2026-03" },
  { label: "February 2026", value: "2026-02" },
  { label: "January 2026",  value: "2026-01" },
  { label: "December 2025", value: "2025-12" },
  { label: "November 2025", value: "2025-11" },
];

const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };

const CAT_BADGE: Record<string, string> = {
  treatment: "bg-[#1A2744] text-[#7B91BC] border-[#2A3F6A]",
  product:   "bg-amber-500/10 text-amber-300 border-amber-500/30",
  medicine:  "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

export default function ReviewPage() {
  const router = useRouter();
  const [month, setMonth]         = useState("2026-04");
  const [branches, setBranches]   = useState<Branch[]>([]);
  const [staff, setStaff]         = useState<Staff[]>([]);
  const [records, setRecords]     = useState<TreatmentRecord[]>([]);
  const [tTypes, setTTypes]       = useState<TreatmentType[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [labEdits, setLabEdits]   = useState<Record<string, number>>({});
  const [holdEdits, setHoldEdits] = useState<Record<string, boolean>>({});
  const [saving, setSaving]       = useState<Record<string, boolean>>({});
  const [branchFilter, setBranchFilter] = useState("all");

  useEffect(() => { load(); }, [month]);

  async function load() {
    setLoading(true);
    try {
      const [b, s, r, tt] = await Promise.all([
        fetchBranches(), fetchStaff(), fetchTreatmentRecords(month), fetchTreatmentTypes(),
      ]);
      setBranches(b); setStaff(s); setTTypes(tt);
      setRecords(r);
      setLabEdits(Object.fromEntries(r.filter(x => x.labCost && x.labCost > 0).map(x => [x.id, x.labCost!])));
      setHoldEdits(Object.fromEntries(r.filter(x => x.isOnHold).map(x => [x.id, true])));
      // expand all by default
      const dentistIds = new Set(s.filter(x => x.role === "resident_dentist" || x.role === "locum_dentist").map(x => x.id));
      setExpanded(dentistIds);
    } finally {
      setLoading(false);
    }
  }

  const ttMap = useMemo(() => Object.fromEntries(tTypes.map(t => [t.id, t])), [tTypes]);

  const filteredRecords = branchFilter === "all"
    ? records
    : records.filter(r => r.branchId === branchFilter);

  // Group records by staff
  const byStaff = useMemo(() => {
    const map: Record<string, TreatmentRecord[]> = {};
    for (const r of filteredRecords) {
      if (!map[r.staffId]) map[r.staffId] = [];
      map[r.staffId].push(r);
    }
    return map;
  }, [filteredRecords]);

  const dentists = staff.filter(s =>
    (s.role === "resident_dentist" || s.role === "locum_dentist") &&
    s.isActive &&
    byStaff[s.id]?.length > 0
  );

  const heldCount = Object.values(holdEdits).filter(Boolean).length;
  const totalRecords = filteredRecords.length;
  const totalCollection = filteredRecords.reduce((s, r) => s + r.fee, 0);
  const totalHeldFee = filteredRecords
    .filter(r => holdEdits[r.id] ?? r.isOnHold)
    .reduce((s, r) => s + r.fee, 0);

  async function handleLabChange(id: string, val: number) {
    setLabEdits(prev => ({ ...prev, [id]: val }));
    setSaving(prev => ({ ...prev, [id]: true }));
    await updateLabCost(id, val);
    setSaving(prev => ({ ...prev, [id]: false }));
  }

  async function handleHoldToggle(id: string) {
    const next = !(holdEdits[id] ?? records.find(r => r.id === id)?.isOnHold ?? false);
    setHoldEdits(prev => ({ ...prev, [id]: next }));
    setSaving(prev => ({ ...prev, [id]: true }));
    await updateRecordOnHold(id, next, month);
    setSaving(prev => ({ ...prev, [id]: false }));
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return <Loading text="Loading records..." />;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 lg:pb-8">
      {/* Header */}
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Step 2 of 3</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Review & Annotate</h1>
          <p className="text-[#7B91BC] text-sm mt-1">Check imported records, enter lab fees, and mark cases on hold before payroll.</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <select className="inp w-auto text-sm" value={month} onChange={e => { setMonth(e.target.value); }}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => router.push(`/payroll?month=${month}`)}
          >
            Proceed to Payroll <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="fade-up delay-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Records",    value: totalRecords.toString(),  color: "#2DD4BF" },
          { label: "Total Collection", value: rm(totalCollection),      color: "#818CF8" },
          { label: "On Hold",          value: `${heldCount} cases`,     color: "#F59E0B" },
          { label: "Held Amount",      value: rm(totalHeldFee),         color: "#FB7185" },
        ].map(k => (
          <div key={k.label} className="stat-card">
            <p className="text-[#7B91BC] text-xs font-semibold uppercase tracking-wider mb-2">{k.label}</p>
            <p className="font-mono text-lg font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Branch filter */}
      <div className="fade-up delay-2 flex gap-2 flex-wrap">
        <button
          onClick={() => setBranchFilter("all")}
          className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${branchFilter === "all" ? "border-teal-500/40 bg-teal-500/10 text-teal-400" : "border-[#1E2D4A] bg-[#0D1526] text-[#7B91BC] hover:text-[#E8F0FF]"}`}
        >
          All Branches
        </button>
        {branches.map(b => (
          <button
            key={b.id}
            onClick={() => setBranchFilter(b.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${branchFilter === b.id ? "border-teal-500/40 bg-teal-500/10 text-teal-400" : "border-[#1E2D4A] bg-[#0D1526] text-[#7B91BC] hover:text-[#E8F0FF]"}`}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />
            {b.name}
          </button>
        ))}
      </div>

      {totalRecords === 0 && (
        <div className="fade-up flex items-start gap-3 px-4 py-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-300 font-semibold">No records imported yet</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Go to <a href="/import" className="underline">POS Import</a> first to upload your CSV data.
            </p>
          </div>
        </div>
      )}

      {/* Per-dentist sections */}
      {dentists.length > 0 && (
        <div className="fade-up delay-3 space-y-4">
          {dentists.map(s => {
            const recs = byStaff[s.id] ?? [];
            const branch = branches.find(b => b.id === s.branchId);
            const open = expanded.has(s.id);
            const staffHeld = recs.filter(r => holdEdits[r.id] ?? r.isOnHold).length;
            const currentRecs = recs.filter(r => !r.releaseMonth || r.date >= `${month}-01`);
            const deferredRecs = recs.filter(r => r.releaseMonth && r.date < `${month}-01`);
            const staffTotal = recs.reduce((sum, r) => sum + r.fee, 0);
            const staffCurrentTotal = currentRecs.reduce((sum, r) => sum + r.fee, 0);
            const staffDeferredTotal = deferredRecs.reduce((sum, r) => sum + r.fee, 0);
            const staffHeldAmt = recs.filter(r => holdEdits[r.id] ?? r.isOnHold).reduce((sum, r) => sum + r.fee, 0);
            const staffEligible = staffTotal - staffHeldAmt;
            const hasLab = recs.some(r => (labEdits[r.id] ?? r.labCost ?? 0) > 0);

            return (
              <div key={s.id} className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
                {/* Staff header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => toggleExpand(s.id)}
                >
                  <div className="flex-shrink-0 text-[#7B91BC]">
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#E8F0FF]">{s.name}</p>
                      {staffHeld > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          {staffHeld} on hold
                        </span>
                      )}
                      {hasLab && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center gap-1">
                          <FlaskConical size={9} /> Lab
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {branch && <div className="w-1.5 h-1.5 rounded-full" style={{ background: BRANCH_DOT[branch.colorKey] }} />}
                      <span className="text-xs text-[#7B91BC]">{branch?.name} · {recs.length} records</span>
                    </div>
                  </div>
                  <div className="hidden lg:flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-[#7B91BC] uppercase tracking-wider">This Month</p>
                      <p className="font-mono text-sm font-bold text-[#E8F0FF]">{rm(staffCurrentTotal)}</p>
                      {staffDeferredTotal > 0 && (
                        <p className="text-[10px] text-violet-400 mt-0.5">+{rm(staffDeferredTotal)} carried fwd</p>
                      )}
                    </div>
                    {staffHeld > 0 && (
                      <div>
                        <p className="text-[10px] text-amber-500 uppercase tracking-wider">On Hold</p>
                        <p className="font-mono text-sm font-bold text-amber-400">−{rm(staffHeldAmt)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-teal-500 uppercase tracking-wider">Eligible</p>
                      <p className="font-mono text-sm font-bold text-teal-400">{rm(staffEligible)}</p>
                    </div>
                  </div>
                </div>

                {/* Records table */}
                {open && (
                  <div className="border-t border-[#1E2D4A]/60">
                    <div className="overflow-x-auto">
                      <table className="tbl text-xs w-full">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Patient</th>
                            <th>Treatment / Item</th>
                            <th>Type</th>
                            <th className="text-right">Fee (RM)</th>
                            <th className="text-right">Cost (RM)</th>
                            <th className="text-right">Lab Fee (RM)</th>
                            <th className="text-center">Hold</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recs.map(r => {
                            const tt = ttMap[r.treatmentTypeId];
                            const isHeld = holdEdits[r.id] ?? r.isOnHold ?? false;
                            const labVal = labEdits[r.id] ?? r.labCost ?? 0;
                            const isSaving = saving[r.id];
                            const isLabCase = tt?.isLabCase ?? false;

                            return (
                              <tr key={r.id} className={isHeld ? "opacity-50 bg-amber-500/5" : ""}>
                                <td className="font-mono text-[#7B91BC] whitespace-nowrap">{r.date.slice(5)}</td>
                                <td className="text-[#E8F0FF] max-w-[120px] truncate">{r.patientName}</td>
                                <td className="text-[#E8F0FF] max-w-[180px]">
                                  <span className="truncate block">{tt?.name ?? r.treatmentTypeId}</span>
                                  {r.releaseMonth && r.date < `${month}-01` && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25 mt-0.5 inline-block">
                                      From {r.date.slice(0, 7)}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className={`text-[10px] px-2 py-0.5 rounded border ${CAT_BADGE[r.saleCategory]}`}>
                                    {r.saleCategory.charAt(0).toUpperCase() + r.saleCategory.slice(1)}
                                  </span>
                                </td>
                                <td className="text-right font-mono text-[#E8F0FF] whitespace-nowrap">
                                  {r.fee.toFixed(2)}
                                </td>
                                <td className="text-right font-mono whitespace-nowrap">
                                  {r.saleCategory !== "treatment" ? (
                                    <span className="text-[#7B91BC]">—</span>
                                  ) : tt?.variableMaterialCost ? (
                                    <span className="text-violet-400 text-[10px]">Variable</span>
                                  ) : (tt?.materialCost ?? 0) > 0 ? (
                                    <span className="text-red-400">−{(tt!.materialCost).toFixed(2)}</span>
                                  ) : (
                                    <span className="text-[#7B91BC]">—</span>
                                  )}
                                </td>
                                <td className="text-right">
                                  {isLabCase ? (
                                    <div className="flex items-center justify-end gap-1">
                                      {isSaving && <span className="text-[10px] text-[#7B91BC]">saving…</span>}
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={labVal || ""}
                                        placeholder="0.00"
                                        onChange={e => handleLabChange(r.id, parseFloat(e.target.value) || 0)}
                                        className="w-24 bg-[#1A2744] border border-amber-500/30 rounded px-2 py-1 text-xs font-mono text-amber-300 text-right focus:outline-none focus:border-amber-400 placeholder-[#7B91BC]/40"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[#7B91BC]">—</span>
                                  )}
                                </td>
                                <td className="text-center">
                                  <button
                                    onClick={() => handleHoldToggle(r.id)}
                                    title={isHeld ? "Release — include in commission" : "Put on hold — exclude from commission"}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                                      isHeld
                                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                                        : "bg-transparent text-[#7B91BC] border-[#1E2D4A] hover:text-amber-400 hover:border-amber-500/30"
                                    }`}
                                  >
                                    {isHeld ? <><PauseCircle size={11} /> Held</> : <><PlayCircle size={11} /> Active</>}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[#1E2D4A]">
                            <td colSpan={4} className="text-right text-[#7B91BC] font-semibold py-2 px-3">Subtotal</td>
                            <td className="text-right font-mono font-bold text-[#E8F0FF] py-2 px-3">{staffTotal.toFixed(2)}</td>
                            <td className="text-right font-mono text-amber-300 py-2 px-3">
                              {recs.filter(r => r.saleCategory === "treatment").reduce((s, r) => s + (labEdits[r.id] ?? r.labCost ?? 0), 0) > 0
                                ? recs.filter(r => r.saleCategory === "treatment").reduce((s, r) => s + (labEdits[r.id] ?? r.labCost ?? 0), 0).toFixed(2)
                                : "—"}
                            </td>
                            <td className="text-center py-2 px-3">
                              {staffHeld > 0 && (
                                <span className="text-[10px] text-amber-400">{staffHeld} held</span>
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Staff mobile summary */}
                    <div className="lg:hidden px-5 py-3 border-t border-[#1E2D4A]/40 flex justify-between text-xs">
                      <span className="text-[#7B91BC]">Total: <span className="text-[#E8F0FF] font-mono font-bold">{rm(staffTotal)}</span></span>
                      <span className="text-teal-400 font-mono font-bold">Eligible: {rm(staffEligible)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Proceed banner */}
      {totalRecords > 0 && (
        <div className="fade-up sticky bottom-6 lg:bottom-8">
          <div className="rounded-2xl border border-teal-500/20 bg-[#070D1A]/95 backdrop-blur-sm px-5 py-4 flex items-center justify-between gap-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-teal-400" />
              <div>
                <p className="text-sm font-semibold text-[#E8F0FF]">
                  {totalRecords} records · {heldCount > 0 ? `${heldCount} on hold · ` : ""}Ready for payroll
                </p>
                <p className="text-xs text-[#7B91BC]">Eligible collection: {rm(totalCollection - totalHeldFee)}</p>
              </div>
            </div>
            <button
              className="btn btn-primary whitespace-nowrap"
              onClick={() => router.push(`/payroll?month=${month}`)}
            >
              Proceed to Payroll <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
