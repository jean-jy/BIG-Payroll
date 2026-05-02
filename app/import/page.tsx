"use client";
import { useEffect, useState } from "react";
import { Branch } from "@/lib/types";
import { fetchBranches, insertTreatmentRecords, fetchTreatmentTypes, fetchStaff, deleteTreatmentRecordsByBranchMonth, fetchImportHistory, insertImportHistory, ImportHistoryEntry } from "@/lib/db";
import { Upload, CheckCircle2, FileSpreadsheet, AlertCircle, X, Download, Trash2, ArrowRight } from "lucide-react";
import Loading from "@/components/Loading";
import { MONTHS } from "@/lib/months";

const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };

type PreviewRow = { date: string; staff: string; treatment: string; fee: number; labCost?: number; patient: string; saleCategory?: "treatment" | "product" | "medicine" };
type RawRow = PreviewRow & { skipReason: string | null };


function downloadTemplate() {
  const csv = [
    "Date,Staff,Patient,Item,Category,Fee,LabCost",
    "2026-04-01,Dr. Ahmad bin Ali,Tan Ah Kow,Scaling,treatment,120,0",
    "2026-04-01,Dr. Ahmad bin Ali,Lim Mei Lin,Toothbrush,product,15,0",
    "2026-04-02,Dr. Sarah Lee,Wong Chee Keong,Amoxicillin,medicine,30,0",
    "2026-04-02,Dr. Sarah Lee,Tan Boey,Crown (PFM),treatment,1200,350",
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "payroll_import_standard.csv";
  a.click();
}


function parseDateDMY(raw: string): string {
  // Convert DD/MM/YYYY → YYYY-MM-DD; fall through for YYYY-MM-DD already
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return raw;
}

function detectCategory(type: string, category: string): "treatment" | "product" | "medicine" {
  const cat = category.toLowerCase().trim();
  const typ = type.toLowerCase().trim();
  if (cat === "medicine" || cat === "product" || cat === "treatment") return cat as any;
  if (typ === "medicine" || typ === "product" || typ === "treatment") return typ as any;

  if (cat.includes("medicine") || cat.includes("drug") || cat.includes("pharmacy")) return "medicine";
  if (cat.includes("product") || typ.includes("product") || typ === "p(r)") return "product";
  return "treatment";
}


function parseCSV(text: string): { kept: PreviewRow[]; all: RawRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { kept: [], all: [] };

  // Parse header — handle quoted cells
  const parseRow = (line: string) => {
    const result: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  const rawHeaders = parseRow(lines[0]);
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const col = (keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex((h) => h === k || h.includes(k));
      if (i !== -1) return i;
    }
    return -1;
  };

  const isAllocationReport = headers.some((h) => h.includes("employee allocation") || h.includes("allocation (myr)"));

  const iDate       = col(["date"]);
  const iStaff      = isAllocationReport ? col(["employee allocation"]) : col(["staff", "doctor", "dentist", "employee"]);
  const iPatient    = col(["customer", "patient", "name"]);
  const iItem       = col(["item", "treatment", "service", "procedure"]);
  const iFee        = isAllocationReport ? col(["allocation (myr)"]) : col(["fee", "amount", "price", "total"]);
  const iLabCost    = col(["labcost", "lab_cost", "lab cost"]);
  const iType       = col(["type"]);
  const iCategory   = col(["category"]);
  const iStatus     = col(["status"]);

  const all: RawRow[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseRow(line);
    const get = (i: number) => (i >= 0 ? (cols[i] ?? "").replace(/"/g, "").trim() : "");

    const status = get(iStatus).toLowerCase();
    const rawDate = get(iDate);
    const date = parseDateDMY(rawDate || "");
    const feeRaw = get(iFee).replace(/,/g, "");
    const fee = parseFloat(feeRaw) || 0;
    const saleCategory = detectCategory(get(iType), get(iCategory));
    const labCost = parseFloat(get(iLabCost).replace(/,/g, "")) || 0;

    const base: Omit<RawRow, "skipReason"> = {
      date,
      staff:    get(iStaff),
      patient:  get(iPatient),
      treatment: get(iItem),
      fee,
      labCost,
      saleCategory,
    };

    // Only skip rows explicitly cancelled/voided/refunded — don't require "paid"
    // because many POS systems use "Completed", "Done", "Success", etc.
    const SKIP_STATUSES = ["cancel", "void", "refund", "reject", "failed"];
    let skipReason: string | null = null;
    if (status && SKIP_STATUSES.some((s) => status.includes(s))) skipReason = `Status: ${get(iStatus)}`;
    else if (!rawDate) skipReason = "No date";
    else if (fee < 0) skipReason = "Voided sale (negative amount)";
    else if (fee === 0) skipReason = "Zero amount";

    all.push({ ...base, skipReason });
  }

  // Netting pass: when a (date, staff, patient, treatment) group contains negative rows,
  // cancel matching positive rows starting from the latest in the file. This handles the
  // POS void-then-reenter pattern where the original entry is voided and re-entered with
  // a corrected "Processed By" — the re-entered duplicate (appearing later) should be skipped.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    const key = `${r.date}|${r.staff.toLowerCase()}|${r.patient.toLowerCase()}|${r.treatment.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }
  for (const indices of groups.values()) {
    const negAmount = indices
      .filter(i => all[i].fee < 0)
      .reduce((sum, i) => sum + Math.abs(all[i].fee), 0);
    if (negAmount === 0) continue;
    let remaining = negAmount;
    // Cancel latest positive rows first so earlier (replacement) rows are preserved
    const posIndices = indices
      .filter(i => all[i].fee > 0 && !all[i].skipReason)
      .sort((a, b) => b - a);
    for (const i of posIndices) {
      if (remaining <= 0) break;
      if (all[i].fee <= remaining) {
        remaining -= all[i].fee;
        all[i].skipReason = "Cancelled by void";
      }
    }
  }

  const kept: PreviewRow[] = all
    .filter(r => !r.skipReason)
    .map(({ skipReason: _sr, ...row }) => row);

  return { kept, all };
}


export default function ImportPage() {
  const [branches, setBranches]         = useState<Branch[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [dragging, setDragging]         = useState(false);
  const [step, setStep]                 = useState<"idle" | "preview" | "done">("idle");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [filename, setFilename]         = useState("");
  const [previewRows, setPreviewRows]   = useState<PreviewRow[]>([]);
  const [rawRows, setRawRows]           = useState<RawRow[]>([]);
  const [showRaw, setShowRaw]           = useState(false);
  const [history, setHistory]           = useState<ImportHistoryEntry[]>([]);
  const [month, setMonth]               = useState(MONTHS[0].value);
  const [replaceMode, setReplaceMode]   = useState(true);
  const [clearing, setClearing]         = useState(false);
  const [skippedItems, setSkippedItems] = useState<string[]>([]);
  const monthLabel = MONTHS.find(m => m.value === month)?.label ?? month;

  useEffect(() => {
    fetchImportHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    fetchBranches().then((b) => {
      setBranches(b);
      if (b.length > 0) setSelectedBranch(b[0].id);
    }).finally(() => setLoading(false));
  }, []);

  async function processFile(file: File) {
    setFilename(file.name);
    const text = await file.text();
    const { kept, all } = parseCSV(text);
    setRawRows(all);
    setShowRaw(false);

    // Auto-detect month from the data so the delete targets the right period
    if (kept.length > 0) {
      const detected = kept.map(r => r.date).filter(Boolean).sort()[0]?.substring(0, 7);
      if (detected && MONTHS.some(m => m.value === detected)) setMonth(detected);
    }

    setPreviewRows(kept.length > 0 ? kept : [
      { date: `${month}-13`, staff: "Staff Name", treatment: "Treatment", fee: 0, patient: "Patient" },
    ]);
    setStep("preview");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function confirmImport() {
    const branch = branches.find((b) => b.id === selectedBranch);
    if (!branch) return;
    try {
      setSaving(true);
      setError(null);

      const [tTypes, staffList] = await Promise.all([fetchTreatmentTypes(), fetchStaff()]);

      const skipped: string[] = [];
      const records = previewRows.filter(r => r.fee > 0).flatMap((r) => {
        const csvName = r.staff.toLowerCase().trim();
        const matchedStaff =
          staffList.find(s => s.name.toLowerCase() === csvName) ??
          staffList.find(s => s.name.toLowerCase().includes(csvName)) ??
          staffList.find(s => csvName.includes(s.name.toLowerCase()));
        const itemLower = r.treatment.toLowerCase().trim();
        // Sort longest name first so more specific matches win
        const sorted = [...tTypes].sort((a, b) => b.name.length - a.name.length);
        const matchedType =
          // 1. Exact match
          sorted.find((t) => t.name.toLowerCase() === itemLower) ??
          // 2. CSV item contains the full treatment type name (eg. "IN OFFICE WHITENING..." contains "WHITENING")
          sorted.find((t) => itemLower.includes(t.name.toLowerCase())) ??
          // 3. Treatment type name contains the full CSV item
          sorted.find((t) => t.name.toLowerCase().includes(itemLower));

        if (!matchedType) {
          skipped.push(r.treatment);
          return [];
        }
        if (!matchedStaff) {
          skipped.push(`${r.staff} (staff not found)`);
          return [];
        }
        return [{
          date:            r.date || `${month}-01`,
          patientName:     r.patient || "Unknown",
          staffId:         matchedStaff.id,
          branchId:        selectedBranch,
          treatmentTypeId: matchedType.id,
          fee:             r.fee,
          labCost:         r.labCost,
          saleCategory:    (matchedType.saleCategory ?? r.saleCategory ?? "treatment") as "treatment" | "product" | "medicine",
        }];
      });



      if (records.length === 0) {
        setError("Nothing to import — no rows matched staff and treatment types. Old data was NOT deleted.");
        return;
      }

      // Delete only after we know there's something to insert, so replace never wipes data and leaves nothing.
      if (replaceMode) {
        await deleteTreatmentRecordsByBranchMonth(selectedBranch, month);
      }
      await insertTreatmentRecords(records);

      const entry: ImportHistoryEntry = {
        id:          "imp" + Date.now(),
        branchId:    selectedBranch,
        branchName:  branch.name,
        month:       month,
        importedAt:  new Date().toLocaleString("en-MY"),
        recordCount: records.length,
        totalAmount: previewRows.reduce((s, r) => s + r.fee, 0),
        filename,
      };
      await insertImportHistory(entry);
      setHistory((prev) => [entry, ...prev]);
      setSkippedItems(skipped);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading text="Loading..." />;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Data</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">POS Import</h1>
          <p className="text-[#7B91BC] text-sm mt-1">Upload your POS export (CSV) per branch per month.</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <select className="inp w-auto text-sm" value={month} onChange={(e) => { setMonth(e.target.value); setStep("idle"); }}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn btn-ghost text-sm" onClick={downloadTemplate}><Download size={14} /> Template</button>
          <button
            className="btn btn-ghost text-sm text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
            disabled={clearing}
            onClick={async () => {
              if (!confirm(`Clear ALL records for ${branches.find(b => b.id === selectedBranch)?.name} — ${monthLabel}? This cannot be undone.`)) return;
              setClearing(true);
              try { await deleteTreatmentRecordsByBranchMonth(selectedBranch, month); }
              catch (e: unknown) { setError(e instanceof Error ? e.message : "Clear failed"); }
              finally { setClearing(false); }
            }}
          >
            <Trash2 size={14} /> {clearing ? "Clearing..." : "Clear Data"}
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}</div>}

      {/* Branch selector */}
      <div className="fade-up delay-1 flex gap-3 flex-wrap">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBranch(b.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
              selectedBranch === b.id
                ? "border-teal-500/40 bg-teal-500/10 text-teal-400"
                : "border-[#1E2D4A] bg-[#0D1526] text-[#7B91BC] hover:text-[#E8F0FF]"
            }`}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />
            {b.name}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      {step === "idle" && (
        <div
          className={`fade-up delay-2 rounded-2xl border-2 border-dashed transition-colors p-12 flex flex-col items-center gap-4 cursor-pointer ${
            dragging ? "border-teal-400 bg-teal-500/5" : "border-[#1E2D4A] hover:border-[#2A3D66]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
            <Upload size={28} className="text-teal-400" />
          </div>
          <div className="text-center">
            <p className="text-[#E8F0FF] font-semibold">Drop your POS export here</p>
            <p className="text-[#7B91BC] text-sm mt-1">or click to browse · CSV supported</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A2744] text-[#7B91BC] text-xs">
            <FileSpreadsheet size={12} />
            Branch: <strong className="text-[#E8F0FF]">{branches.find(b => b.id === selectedBranch)?.name}</strong>
            · Period: <strong className="text-[#E8F0FF]">{monthLabel}</strong>
          </div>
          <input id="file-input" type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* Preview */}
      {step === "preview" && (
        <div className="fade-up delay-2 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={16} className="text-teal-400" />
              <div>
                <p className="text-sm font-semibold text-[#E8F0FF]">{filename}</p>
                <p className="text-xs text-[#7B91BC]">{previewRows.length} records detected</p>
              </div>
            </div>
            <button className="text-[#7B91BC] hover:text-[#E8F0FF]" onClick={() => setStep("idle")}>
              <X size={16} />
            </button>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th>Staff</th><th>Patient</th><th>Treatment</th><th>Type</th><th className="text-right">Fee (RM)</th></tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-[#7B91BC]">{r.date}</td>
                    <td className="text-sm text-[#E8F0FF]">{r.staff}</td>
                    <td className="text-xs text-[#7B91BC]">{r.patient}</td>
                    <td className="text-sm text-[#7B91BC]">{r.treatment}</td>
                    <td>
                      {r.saleCategory === "medicine" && <span className="badge" style={{ background: "rgba(16,185,129,0.1)", color: "#34D399", border: "1px solid rgba(16,185,129,0.2)" }}>Medicine</span>}
                      {r.saleCategory === "product"  && <span className="badge" style={{ background: "rgba(251,191,36,0.1)", color: "#FBB724", border: "1px solid rgba(251,191,36,0.2)" }}>Product</span>}
                      {(!r.saleCategory || r.saleCategory === "treatment") && <span className="badge badge-basic">Treatment</span>}
                    </td>
                    <td className="text-right font-mono text-sm text-[#E8F0FF]">{r.fee.toFixed(2)}</td>
                  </tr>
                ))}
                {previewRows.length > 10 && (
                  <tr><td colSpan={5} className="text-center text-xs text-[#7B91BC] py-2">…and {previewRows.length - 10} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Raw data toggle */}
          <div className="border-t border-[#1E2D4A]">
            <button
              className="w-full px-5 py-3 flex items-center justify-between text-xs text-[#7B91BC] hover:text-[#E8F0FF] hover:bg-[#111D36] transition-colors"
              onClick={() => setShowRaw(v => !v)}
            >
              <span className="font-semibold uppercase tracking-widest">
                Raw Data — {rawRows.length} total rows
                {rawRows.filter(r => r.skipReason).length > 0 && (
                  <span className="ml-2 text-red-400">({rawRows.filter(r => r.skipReason).length} skipped)</span>
                )}
              </span>
              <span>{showRaw ? "▲ Hide" : "▼ Show"}</span>
            </button>
            {showRaw && (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="tbl">
                  <thead>
                    <tr><th>Date</th><th>Staff</th><th>Patient</th><th>Treatment</th><th className="text-right">Fee (RM)</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rawRows.map((r, i) => (
                      <tr key={i} className={r.skipReason ? "opacity-40" : ""}>
                        <td className="font-mono text-xs text-[#7B91BC]">{r.date}</td>
                        <td className="text-sm text-[#E8F0FF]">{r.staff}</td>
                        <td className="text-xs text-[#7B91BC]">{r.patient}</td>
                        <td className="text-sm text-[#7B91BC]">{r.treatment}</td>
                        <td className={`text-right font-mono text-sm ${r.fee < 0 ? "text-red-400" : "text-[#E8F0FF]"}`}>{r.fee.toFixed(2)}</td>
                        <td>
                          {r.skipReason
                            ? <span className="badge" style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", border: "1px solid rgba(239,68,68,0.2)" }}>{r.skipReason}</span>
                            : <span className="badge" style={{ background: "rgba(16,185,129,0.1)", color: "#34D399", border: "1px solid rgba(16,185,129,0.2)" }}>Imported</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-[#1E2D4A] space-y-3">
            <div className="flex items-start gap-2 text-xs text-amber-400">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>Lab case costs are not in POS exports. Enter them manually in Payroll Processing.</span>
            </div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                  className="w-4 h-4 rounded accent-red-500"
                />
                <span className="text-xs text-red-400">Replace existing records for this branch &amp; month</span>
              </label>
              <div className="flex gap-3">
                <button className="btn btn-ghost" onClick={() => setStep("idle")}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmImport} disabled={saving}>
                  <CheckCircle2 size={14} /> {saving ? (replaceMode ? "Replacing..." : "Importing...") : (replaceMode ? "Replace & Import" : "Confirm Import")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="fade-up delay-2 space-y-3">
          <div className="flex flex-col items-center gap-4 py-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <CheckCircle2 size={40} className="text-emerald-400" />
            <div className="text-center">
              <p className="text-[#E8F0FF] font-semibold">Import Successful</p>
              <p className="text-[#7B91BC] text-sm mt-1">
                {history[0]?.recordCount ?? 0} records imported for {branches.find(b => b.id === selectedBranch)?.name}
              </p>
              {skippedItems.length > 0 && (
                <p className="text-amber-400 text-xs mt-1">{skippedItems.length} rows skipped — no matching treatment type</p>
              )}
            </div>
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setStep("idle")}>Import Another File</button>
              <a href="/review" className="btn btn-primary"><ArrowRight size={14} /> Review Records</a>
            </div>
          </div>
          {skippedItems.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-amber-400 mb-2">Skipped items (not in Treatments Setup):</p>
              <div className="flex flex-wrap gap-2">
                {[...new Set(skippedItems)].map((item, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">{item}</span>
                ))}
              </div>
              <p className="text-[11px] text-amber-400/70 mt-2">Add these to <a href="/settings/treatments" className="underline">Treatments Setup</a>, then re-import.</p>
            </div>
          )}
        </div>
      )}

      {/* Import history */}
      {history.length > 0 && (
        <div className="fade-up delay-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2D4A]">
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Import History</h2>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Branch</th><th>Filename</th><th>Imported At</th><th className="text-right">Records</th><th className="text-right">Total Amount</th></tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const b = branches.find((br) => br.id === h.branchId);
                return (
                  <tr key={h.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {b && <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />}
                        <span className="text-sm text-[#E8F0FF]">{h.branchName}</span>
                      </div>
                    </td>
                    <td><span className="font-mono text-xs text-[#7B91BC]">{h.filename}</span></td>
                    <td><span className="text-sm text-[#7B91BC]">{h.importedAt}</span></td>
                    <td className="text-right"><span className="font-mono text-sm text-[#E8F0FF]">{h.recordCount}</span></td>
                    <td className="text-right"><span className="font-mono text-sm font-bold text-teal-400">RM {h.totalAmount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
