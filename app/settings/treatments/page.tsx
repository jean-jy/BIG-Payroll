"use client";
import { useEffect, useState } from "react";
import { TreatmentType } from "@/lib/types";
import { fetchTreatmentTypes, upsertTreatmentType, deleteTreatmentType } from "@/lib/db";
import { rm } from "@/lib/calculations";
import { Plus, Pencil, X, FlaskConical, TestTube } from "lucide-react";
import Loading from "@/components/Loading";

export default function TreatmentsPage() {
  const [types, setTypes]   = useState<TreatmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [modal, setModal]   = useState<{ open: boolean; data: Partial<TreatmentType> }>({ open: false, data: {} });

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

  function openAdd() { setModal({ open: true, data: { isLabCase: false, materialCost: 0, defaultFee: 0, saleCategory: "treatment" } }); }
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
        <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add</button>
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
                <td><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-teal-400" /><span className="text-sm font-medium text-[#E8F0FF]">{t.name}</span></div></td>
                <td className="text-right font-mono text-sm text-[#E8F0FF]">{rm(t.defaultFee)}</td>
                <td className="text-right font-mono text-sm text-red-400">{t.materialCost > 0 ? `−${rm(t.materialCost)}` : <span className="text-[#7B91BC]">—</span>}</td>
                <td className="text-right font-mono text-sm font-bold text-teal-400">{rm(t.defaultFee - t.materialCost)}</td>
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
                  <input className="inp" type="number" placeholder="0.00" value={modal.data.materialCost ?? ""} onChange={(e) => set("materialCost", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {modal.data.saleCategory === "treatment" && (
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-5 rounded-full transition-colors ${modal.data.isLabCase ? "bg-indigo-500" : "bg-[#1E2D4A]"}`} onClick={() => set("isLabCase", !modal.data.isLabCase)}>
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 ml-0.5 transition-transform ${modal.data.isLabCase ? "translate-x-5" : ""}`} />
                </div>
                <div>
                  <p className="text-sm text-[#E8F0FF] font-medium">Lab case</p>
                  <p className="text-xs text-[#7B91BC]">Lab cost entered per patient</p>
                </div>
              </label>
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
