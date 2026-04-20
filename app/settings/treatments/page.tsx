"use client";
import { useEffect, useState } from "react";
import { TreatmentType } from "@/lib/types";
import { fetchTreatmentTypes, upsertTreatmentType, deleteTreatmentType } from "@/lib/db";
import { rm } from "@/lib/calculations";
import { Plus, Pencil, X, FlaskConical, TestTube, Upload, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { useRef } from "react";
import Loading from "@/components/Loading";

type CsvRow = { name: string; category: string; defaultFee: number; materialCost: number; variableMaterialCost: boolean; isLabCase: boolean; isOnHold: boolean; error?: string };

function parseTreatmentCsv(text: string): CsvRow[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const [name, category, defaultFee, materialCost, variableMaterialCost, isLabCase, isOnHold] = cols;
    const validCats = ["treatment", "product", "medicine"];
    rows.push({
      name: name ?? "",
      category: validCats.includes(category?.toLowerCase()) ? category.toLowerCase() : "treatment",
      defaultFee: parseFloat(defaultFee) || 0,
      materialCost: parseFloat(materialCost) || 0,
      variableMaterialCost: variableMaterialCost?.toLowerCase() === "yes",
      isLabCase: isLabCase?.toLowerCase() === "yes",
      isOnHold: isOnHold?.toLowerCase() === "yes",
      error: !name?.trim() ? "Missing name" : undefined,
    });
  }
  return rows;
}

function downloadTemplate() {
  const header = "Name,Category,Default Fee,Material Cost,Variable Material Cost,Lab Case,On Hold";
  const examples = [
    "Scaling,treatment,120,15,no,no,no",
    "Composite Filling,treatment,200,30,no,no,no",
    "Root Canal (Anterior),treatment,600,0,yes,no,no",
    "Crown (PFM),treatment,1200,0,no,yes,no",
    "Angel Aligner,treatment,350,0,no,no,yes",
    "Whitening (Click),treatment,2000,2000,no,no,no",
    "Extraction,treatment,80,5,no,no,no",
    "Retainer,treatment,300,0,no,no,no",
    "Tooth Brush,product,15,0,no,no,no",
    "Antibiotics,medicine,20,0,no,no,no",
  ].join("\n");
  const blob = new Blob([header + "\n" + examples], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "treatments_template.csv"; a.click();
}

export default function TreatmentsPage() {
  const [types, setTypes]   = useState<TreatmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [modal, setModal]   = useState<{ open: boolean; data: Partial<TreatmentType> }>({ open: false, data: {} });
  const [importModal, setImportModal] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setTypes(await fetchTreatmentTypes());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function openAdd() { setModal({ open: true, data: { isLabCase: false, variableMaterialCost: false, materialCost: 0, defaultFee: 0, saleCategory: "treatment" } }); }
  function openEdit(t: TreatmentType) { setModal({ open: true, data: { ...t } }); }
  function closeModal() { setModal({ open: false, data: {} }); }
  const set = (k: keyof TreatmentType, v: unknown) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }));

  async function save() {
    const d = modal.data;
    if (!d.name?.trim()) return;
    try {
      setSaving(true);
      const saved = await upsertTreatmentType(d);
      setTypes((prev) =>
        prev.some((t) => t.id === saved.id)
          ? prev.map((t) => t.id === saved.id ? saved : t)
          : [...prev, saved]
      );
      closeModal();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteTreatmentType(id);
      setTypes((prev) => prev.filter((t) => t.id !== id));
    } catch { setError("Failed to delete — this treatment may be in use."); }
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseTreatmentCsv(e.target?.result as string);
      setCsvRows(rows); setImportDone(false);
    };
    reader.readAsText(file);
  }

  async function handleImportConfirm() {
    const valid = csvRows.filter(r => !r.error && r.name);
    if (!valid.length) return;
    try {
      setImporting(true);
      const saved = await Promise.all(valid.map(r => upsertTreatmentType({
        name: r.name,
        saleCategory: r.category as TreatmentType["saleCategory"],
        defaultFee: r.defaultFee,
        materialCost: r.variableMaterialCost ? 0 : r.materialCost,
        variableMaterialCost: r.variableMaterialCost,
        isLabCase: r.isLabCase,
        isOnHold: r.isOnHold,
      })));
      setTypes(prev => {
        const map = Object.fromEntries(prev.map(t => [t.id, t]));
        for (const t of saved) map[t.id] = t;
        return Object.values(map);
      });
      setImportDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const treatments = types.filter((t) => t.saleCategory === "treatment" && !t.isLabCase);
  const labCases   = types.filter((t) => t.saleCategory === "treatment" && t.isLabCase);
  const products   = types.filter((t) => t.saleCategory === "product");
  const medicines  = types.filter((t) => t.saleCategory === "medicine");

  if (loading) return <Loading text="Loading treatments..." />;

  const TblActions = ({ t }: { t: TreatmentType }) => (
    <div className="flex gap-2">
      <button className="btn btn-ghost py-1 px-2 text-xs" onClick={() => openEdit(t)}><Pencil size={11} /></button>
      <button className="btn btn-danger py-1 px-2 text-xs" onClick={() => remove(t.id)}><X size={11} /></button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Settings</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Treatment & Cost Setup</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-ghost text-sm" onClick={downloadTemplate}><Download size={14} /> Template</button>
          <button className="btn btn-ghost text-sm" onClick={() => { setImportModal(true); setCsvRows([]); setImportDone(false); }}><Upload size={14} /> Import CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add</button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}</div>}

      {/* Legend */}
      <div className="fade-up delay-1 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-teal-500/20 bg-teal-500/5">
          <FlaskConical size={15} className="text-teal-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-teal-300"><strong>Treatments</strong> — dentist&apos;s individual rate (30–50%) on fee minus costs.</p>
        </div>
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <TestTube size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300"><strong>Products</strong> — <strong>10%</strong> commission on selling price.</p>
        </div>
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <TestTube size={15} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-300"><strong>Medicine</strong> — <strong>50%</strong> commission on selling price.</p>
        </div>
      </div>

      {/* Treatments */}
      <div className="fade-up delay-2 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Treatments</h2>
          <span className="badge badge-active">{treatments.length} types</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Name</th><th className="text-right">Default Fee</th><th className="text-right">Material Cost</th><th className="text-right">Commission Base</th><th></th></tr></thead>
          <tbody>
            {treatments.map((t) => (
              <tr key={t.id}>
                <td><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-teal-400" /><span className="text-sm font-medium text-[#E8F0FF]">{t.name}</span>{t.isOnHold && <span className="badge text-[10px]" style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>On Hold</span>}</div></td>
                <td className="text-right font-mono text-sm text-[#E8F0FF]">{rm(t.defaultFee)}</td>
                <td className="text-right font-mono text-sm text-red-400">
                  {t.variableMaterialCost
                    ? <span className="badge" style={{ background: "rgba(139,92,246,0.1)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.2)" }}>Variable</span>
                    : t.materialCost > 0 ? `−${rm(t.materialCost)}` : <span className="text-[#7B91BC]">—</span>}
                </td>
                <td className="text-right font-mono text-sm font-bold text-teal-400">
                  {t.variableMaterialCost ? <span className="text-[#7B91BC] text-xs">entered per case</span> : rm(t.defaultFee - t.materialCost)}
                </td>
                <td><TblActions t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lab cases */}
      <div className="fade-up delay-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Lab Cases</h2>
            <p className="text-xs text-[#7B91BC] mt-0.5">Lab cost entered per patient — deducted before commission</p>
          </div>
          <span className="badge badge-comm">{labCases.length} types</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Name</th><th className="text-right">Default Fee</th><th>Lab Cost</th><th></th></tr></thead>
          <tbody>
            {labCases.map((t) => (
              <tr key={t.id}>
                <td><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-400" /><span className="text-sm font-medium text-[#E8F0FF]">{t.name}</span></div></td>
                <td className="text-right font-mono text-sm text-[#E8F0FF]">{rm(t.defaultFee)}</td>
                <td><span className="badge badge-comm">Entered per patient</span></td>
                <td><TblActions t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Products */}
      <div className="fade-up delay-4 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Products</h2>
            <p className="text-xs text-[#7B91BC] mt-0.5"><span className="text-amber-400 font-semibold">10% commission</span> on selling price</p>
          </div>
          <span className="badge" style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>{products.length} types</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Commission</th><th></th></tr></thead>
          <tbody>
            {products.map((t) => (
              <tr key={t.id}>
                <td><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-sm font-medium text-[#E8F0FF]">{t.name}</span></div></td>
                <td><span className="font-mono text-sm font-bold text-amber-400">10% of selling price</span></td>
                <td><TblActions t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Medicine */}
      <div className="fade-up delay-5 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A] flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-[#7B91BC]">Medicine</h2>
            <p className="text-xs text-[#7B91BC] mt-0.5"><span className="text-rose-400 font-semibold">50% commission</span> on selling price</p>
          </div>
          <span className="badge" style={{ background: "rgba(244,63,94,0.1)", color: "#FB7185", border: "1px solid rgba(244,63,94,0.2)" }}>{medicines.length} types</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Commission</th><th></th></tr></thead>
          <tbody>
            {medicines.map((t) => (
              <tr key={t.id}>
                <td><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-400" /><span className="text-sm font-medium text-[#E8F0FF]">{t.name}</span></div></td>
                <td><span className="font-mono text-sm font-bold text-rose-400">50% of selling price</span></td>
                <td><TblActions t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import Modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setImportModal(false)} />
          <div className="relative bg-[#0D1526] border border-[#1E2D4A] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2D4A]">
              <h2 className="font-display font-bold text-[#E8F0FF]">Bulk Import Treatments</h2>
              <button className="text-[#7B91BC] hover:text-[#E8F0FF]" onClick={() => setImportModal(false)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Upload zone */}
              <div
                className="border-2 border-dashed border-[#1E2D4A] rounded-xl p-6 text-center cursor-pointer hover:border-teal-500/40 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
              >
                <Upload size={24} className="mx-auto text-[#7B91BC] mb-2" />
                <p className="text-sm text-[#E8F0FF] font-medium">Drop CSV here or click to browse</p>
                <p className="text-xs text-[#7B91BC] mt-1">Columns: Name, Category, Default Fee, Material Cost, Variable Material Cost, Lab Case, On Hold</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
              </div>

              {/* Preview table */}
              {csvRows.length > 0 && !importDone && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#E8F0FF]">{csvRows.filter(r => !r.error).length} valid · {csvRows.filter(r => r.error).length} errors</p>
                  </div>
                  <div className="rounded-xl border border-[#1E2D4A] overflow-hidden max-h-64 overflow-y-auto">
                    <table className="tbl text-xs">
                      <thead><tr><th>Name</th><th>Category</th><th className="text-right">Fee</th><th className="text-right">Mat. Cost</th><th>Flags</th><th></th></tr></thead>
                      <tbody>
                        {csvRows.map((row, i) => (
                          <tr key={i} className={row.error ? "bg-red-500/5" : ""}>
                            <td className="font-medium text-[#E8F0FF]">{row.name || <span className="text-red-400">—</span>}</td>
                            <td><span className="capitalize text-[#7B91BC]">{row.category}</span></td>
                            <td className="text-right font-mono">{rm(row.defaultFee)}</td>
                            <td className="text-right font-mono">{row.variableMaterialCost ? <span className="text-violet-400">Variable</span> : rm(row.materialCost)}</td>
                            <td className="space-x-1">
                              {row.isLabCase && <span className="badge text-[10px]" style={{ background: "rgba(99,102,241,0.1)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.2)" }}>Lab</span>}
                              {row.isOnHold && <span className="badge text-[10px]" style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>On Hold</span>}
                            </td>
                            <td>{row.error ? <span className="text-red-400 text-[10px]">{row.error}</span> : <CheckCircle2 size={12} className="text-teal-400" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button className="btn btn-ghost" onClick={() => setCsvRows([])}>Clear</button>
                    <button className="btn btn-primary" onClick={handleImportConfirm} disabled={importing || !csvRows.some(r => !r.error)}>
                      {importing ? "Importing..." : `Import ${csvRows.filter(r => !r.error).length} Treatments`}
                    </button>
                  </div>
                </div>
              )}

              {importDone && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-teal-500/20 bg-teal-500/5">
                  <CheckCircle2 size={16} className="text-teal-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-teal-300">{csvRows.filter(r => !r.error).length} treatments imported successfully.</p>
                    <p className="text-xs text-[#7B91BC] mt-0.5">You can close this window or import another file.</p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="rounded-xl border border-[#1E2D4A] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-[#7B91BC]">Column Guide</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#7B91BC]">
                  <div><span className="text-[#E8F0FF]">Category</span> — treatment / product / medicine</div>
                  <div><span className="text-[#E8F0FF]">Variable Material Cost</span> — yes / no</div>
                  <div><span className="text-[#E8F0FF]">Default Fee</span> — number (e.g. 200)</div>
                  <div><span className="text-[#E8F0FF]">Lab Case</span> — yes / no</div>
                  <div><span className="text-[#E8F0FF]">Material Cost</span> — number, ignored if Variable = yes</div>
                  <div><span className="text-[#E8F0FF]">On Hold</span> — yes / no</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-[#0D1526] border border-[#1E2D4A] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h2 className="font-display font-bold text-[#E8F0FF]">{modal.data.id ? "Edit" : "Add"} Treatment</h2>
            <div>
              <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Name</label>
              <input className="inp" placeholder="e.g. Composite Filling" value={modal.data.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Category</label>
              <select className="inp" value={modal.data.saleCategory ?? "treatment"} onChange={(e) => {
                const cat = e.target.value as TreatmentType["saleCategory"];
                set("saleCategory", cat);
                if (cat !== "treatment") set("isLabCase", false);
              }}>
                <option value="treatment">Treatment (dentist&apos;s rate)</option>
                <option value="product">Product — 10% commission</option>
                <option value="medicine">Medicine — 50% commission</option>
              </select>
            </div>
            {modal.data.saleCategory === "treatment" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Default Fee (RM)</label>
                  <input className="inp" type="number" placeholder="0.00" value={modal.data.defaultFee ?? ""} onChange={(e) => set("defaultFee", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Material Cost (RM)</label>
                  <input className="inp" type="number" placeholder="0.00" disabled={!!modal.data.variableMaterialCost}
                    value={modal.data.variableMaterialCost ? "" : (modal.data.materialCost ?? "")}
                    onChange={(e) => set("materialCost", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {modal.data.saleCategory === "treatment" && (
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full transition-colors ${modal.data.variableMaterialCost ? "bg-violet-500" : "bg-[#1E2D4A]"}`}
                    onClick={() => { set("variableMaterialCost", !modal.data.variableMaterialCost); if (!modal.data.variableMaterialCost) set("materialCost", 0); }}>
                    <div className={`w-4 h-4 rounded-full bg-white mt-0.5 ml-0.5 transition-transform ${modal.data.variableMaterialCost ? "translate-x-5" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm text-[#E8F0FF] font-medium">Variable material cost</p>
                    <p className="text-xs text-[#7B91BC]">Cost differs per case — entered in Payroll each month</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full transition-colors ${modal.data.isLabCase ? "bg-indigo-500" : "bg-[#1E2D4A]"}`} onClick={() => set("isLabCase", !modal.data.isLabCase)}>
                    <div className={`w-4 h-4 rounded-full bg-white mt-0.5 ml-0.5 transition-transform ${modal.data.isLabCase ? "translate-x-5" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm text-[#E8F0FF] font-medium">Lab case</p>
                    <p className="text-xs text-[#7B91BC]">Lab cost entered per patient</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full transition-colors ${modal.data.isOnHold ? "bg-amber-500" : "bg-[#1E2D4A]"}`} onClick={() => set("isOnHold", !modal.data.isOnHold)}>
                    <div className={`w-4 h-4 rounded-full bg-white mt-0.5 ml-0.5 transition-transform ${modal.data.isOnHold ? "translate-x-5" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm text-[#E8F0FF] font-medium">Payment on Hold</p>
                    <p className="text-xs text-[#7B91BC]">Fees excluded from commission until costs are confirmed next month</p>
                  </div>
                </label>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : modal.data.id ? "Save" : "Add"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
