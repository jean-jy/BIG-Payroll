"use client";
import { useEffect, useState } from "react";
import { Branch } from "@/lib/types";
import { fetchBranches, insertTreatmentRecords, fetchTreatmentTypes, fetchStaff } from "@/lib/db";
import { Upload, CheckCircle2, FileSpreadsheet, AlertCircle, X } from "lucide-react";
import Loading from "@/components/Loading";

const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };

type PreviewRow = { date: string; staff: string; treatment: string; fee: number; patient: string };
type HistoryEntry = { id: string; branchId: string; branchName: string; month: string; importedAt: string; recordCount: number; totalAmount: number; filename: string };

const MONTH = "2026-04";
const MONTH_LABEL = "April 2026";

function parseCSV(text: string): PreviewRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
    const get = (keys: string[]) => {
      for (const k of keys) {
        const i = headers.findIndex((h) => h.includes(k));
        if (i !== -1) return cols[i] ?? "";
      }
      return "";
    };
    return {
      date:      get(["date"]),
      staff:     get(["staff", "doctor", "dentist", "employee"]),
      treatment: get(["treatment", "service", "procedure"]),
      fee:       parseFloat(get(["fee", "amount", "price", "total"])) || 0,
      patient:   get(["patient", "name", "customer"]),
    };
  }).filter((r) => r.date && r.fee > 0);
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
  const [history, setHistory]           = useState<HistoryEntry[]>([]);

  useEffect(() => {
    fetchBranches().then((b) => {
      setBranches(b);
      if (b.length > 0) setSelectedBranch(b[0].id);
    }).finally(() => setLoading(false));
  }, []);

  async function processFile(file: File) {
    setFilename(file.name);
    const text = await file.text();
    const rows = parseCSV(text);
    setPreviewRows(rows.length > 0 ? rows : [
      { date: `${MONTH}-13`, staff: "Staff Name", treatment: "Treatment", fee: 0, patient: "Patient" },
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

      const records = previewRows.map((r) => {
        const matchedStaff = staffList.find((s) =>
          s.name.toLowerCase().includes(r.staff.toLowerCase().split(" ")[0]?.toLowerCase() ?? "")
        );
        const matchedType = tTypes.find((t) =>
          t.name.toLowerCase().includes(r.treatment.toLowerCase().split(" ")[0]?.toLowerCase() ?? "")
        );
        return {
          date:            r.date || `${MONTH}-01`,
          patientName:     r.patient || "Unknown",
          staffId:         matchedStaff?.id ?? staffList[0]?.id ?? "",
          branchId:        selectedBranch,
          treatmentTypeId: matchedType?.id ?? tTypes[0]?.id ?? "",
          fee:             r.fee,
          labCost:         undefined as number | undefined,
          saleCategory:    (matchedType?.saleCategory ?? "treatment") as "treatment" | "product" | "medicine",
        };
      }).filter((r) => r.staffId && r.treatmentTypeId);

      if (records.length > 0) {
        await insertTreatmentRecords(records);
      }

      const entry: HistoryEntry = {
        id:          "imp" + Date.now(),
        branchId:    selectedBranch,
        branchName:  branch.name,
        month:       MONTH,
        importedAt:  new Date().toLocaleString("en-MY"),
        recordCount: records.length,
        totalAmount: previewRows.reduce((s, r) => s + r.fee, 0),
        filename,
      };
      setHistory((prev) => [entry, ...prev]);
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
      <div className="fade-up">
        <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Data</p>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">POS Import</h1>
        <p className="text-[#7B91BC] text-sm mt-1">Upload your POS export (CSV) per branch per month.</p>
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
            · Period: <strong className="text-[#E8F0FF]">{MONTH_LABEL}</strong>
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
                <tr><th>Date</th><th>Staff</th><th>Patient</th><th>Treatment</th><th className="text-right">Fee (RM)</th></tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-[#7B91BC]">{r.date}</td>
                    <td className="text-sm text-[#E8F0FF]">{r.staff}</td>
                    <td className="text-xs text-[#7B91BC]">{r.patient}</td>
                    <td className="text-sm text-[#7B91BC]">{r.treatment}</td>
                    <td className="text-right font-mono text-sm text-[#E8F0FF]">{r.fee.toFixed(2)}</td>
                  </tr>
                ))}
                {previewRows.length > 10 && (
                  <tr><td colSpan={5} className="text-center text-xs text-[#7B91BC] py-2">…and {previewRows.length - 10} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-[#1E2D4A] flex items-center justify-between gap-4">
            <div className="flex items-start gap-2 text-xs text-amber-400">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>Lab case costs are not in POS exports. Enter them manually in Payroll Processing.</span>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setStep("idle")}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmImport} disabled={saving}>
                <CheckCircle2 size={14} /> {saving ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="fade-up delay-2 flex flex-col items-center gap-4 py-10 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle2 size={40} className="text-emerald-400" />
          <div className="text-center">
            <p className="text-[#E8F0FF] font-semibold">Import Successful</p>
            <p className="text-[#7B91BC] text-sm mt-1">
              {history[0]?.recordCount ?? 0} records imported for {branches.find(b => b.id === selectedBranch)?.name}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => setStep("idle")}>Import Another File</button>
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
