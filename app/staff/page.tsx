"use client";
import { useEffect, useState } from "react";
import { Branch, Staff, Role, ROLE_LABELS } from "@/lib/types";
import { fetchBranches, fetchStaff, upsertStaff, setStaffActive } from "@/lib/db";
import { rm } from "@/lib/calculations";
import { Search, Plus, Pencil, X, UserX, UserCheck, EyeOff, Eye } from "lucide-react";
import Loading from "@/components/Loading";

const BRANCH_DOT: Record<string, string> = { a: "#0D9488", b: "#6366F1", c: "#F43F5E" };
const ROLES: Role[] = ["resident_dentist", "locum_dentist", "fulltime_da", "fulltime_dsa_monthly", "parttime_da", "supervisor"];
const isDentist = (r?: string) => r === "resident_dentist" || r === "locum_dentist";

type ModalStaff = Partial<Staff>;

export default function StaffPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [modal, setModal] = useState<{ open: boolean; data: ModalStaff }>({ open: false, data: {} });
  const [showInactive, setShowInactive] = useState(false);
  const [confirmResign, setConfirmResign] = useState<Staff | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [b, s] = await Promise.all([fetchBranches(), fetchStaff()]);
      setBranches(b); setStaffList(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const filtered = staffList.filter((s) => {
    const q = search.toLowerCase();
    return (
      (showInactive || s.isActive) &&
      (!q || s.name.toLowerCase().includes(q) || s.icNumber?.includes(q)) &&
      (filterBranch === "all" || s.branchId === filterBranch) &&
      (filterRole === "all" || s.role === filterRole)
    );
  });

  function openAdd() {
    setModal({ open: true, data: { isActive: true, role: "resident_dentist", branchId: branches[0]?.id } });
  }
  function openEdit(s: Staff) { setModal({ open: true, data: { ...s } }); }
  function closeModal() { setModal({ open: false, data: {} }); }
  const set = (k: keyof ModalStaff, v: unknown) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }));

  async function handleToggleActive(s: Staff) {
    try {
      await setStaffActive(s.id, !s.isActive);
      setStaffList((prev) => prev.map((x) => x.id === s.id ? { ...x, isActive: !x.isActive } : x));
    } catch { setError("Failed to update staff status"); }
  }

  async function handleResignConfirm() {
    if (!confirmResign) return;
    await handleToggleActive(confirmResign);
    setConfirmResign(null);
  }

  async function saveModal() {
    const d = modal.data;
    if (!d.name?.trim()) return;
    try {
      setSaving(true);
      const saved = await upsertStaff(d);
      setStaffList((prev) =>
        prev.some((x) => x.id === saved.id)
          ? prev.map((x) => x.id === saved.id ? saved : x)
          : [...prev, saved]
      );
      closeModal();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading text="Loading staff..." />;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 lg:pb-8">
      <div className="fade-up flex items-start justify-between gap-4">
        <div>
          <p className="text-[#7B91BC] text-xs font-mono uppercase tracking-widest mb-1">Management</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#E8F0FF]">Staff</h1>
          <p className="text-[#7B91BC] text-sm mt-1">{staffList.filter((s) => s.isActive).length} active · {staffList.length} total</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-ghost text-sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? <EyeOff size={14} /> : <Eye size={14} />}
            {showInactive ? "Hide Resigned" : "Show Resigned"}
          </button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add Staff</button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}</div>}

      <div className="fade-up delay-1 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7B91BC]" />
          <input className="inp pl-9" placeholder="Search name or IC..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="inp w-auto" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
          <option value="all">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="inp w-auto" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="all">All Roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>

      <div className="fade-up delay-2 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Branch</th><th>Pay Structure</th><th>Commission %</th><th>IC Number</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const b = branches.find((b) => b.id === s.branchId);
                let pay = "";
                if (s.role === "resident_dentist") pay = `Basic ${rm(s.basicSalary ?? 0)}/mo`;
                else if (s.role === "locum_dentist") pay = `${rm(s.dailyRate ?? 0)}/day`;
                else if (s.role === "parttime_da") pay = `${rm(s.hourlyRate ?? 0)}/hr`;
                else pay = `Basic ${rm(s.basicSalary ?? 0)}/mo`;
                return (
                  <tr key={s.id} className={!s.isActive ? "opacity-50" : ""}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A2744] flex items-center justify-center text-xs font-bold text-teal-400 flex-shrink-0">
                          {s.name.split(" ").filter(w => !["Dr.", "bin", "binti", "s/o", "d/o"].includes(w))[0]?.[0] ?? "?"}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#E8F0FF]">{s.name}</p>
                          <p className="text-xs text-[#7B91BC]">Joined {s.joinDate}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="text-sm text-[#7B91BC]">{ROLE_LABELS[s.role]}</span></td>
                    <td>
                      {b && <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_DOT[b.colorKey] }} />
                        <span className="text-sm text-[#7B91BC]">{b.name}</span>
                      </div>}
                    </td>
                    <td><span className="font-mono text-xs text-[#E8F0FF]">{pay}</span></td>
                    <td>
                      {isDentist(s.role)
                        ? <span className="font-mono text-sm font-bold text-teal-400">{((s.commissionRate ?? 0) * 100).toFixed(0)}%</span>
                        : <span className="text-[#7B91BC] text-sm">—</span>}
                    </td>
                    <td><span className="font-mono text-xs text-[#7B91BC]">{s.icNumber}</span></td>
                    <td>
                      <span className={`badge ${s.isActive ? "badge-active" : "badge-inactive"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? "bg-teal-400" : "bg-slate-500"}`} />
                        {s.isActive ? "Active" : "Resigned"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button className="btn btn-ghost py-1.5 px-3 text-xs" onClick={() => openEdit(s)}>
                          <Pencil size={12} /> Edit
                        </button>
                        {s.isActive ? (
                          <button
                            className="btn py-1.5 px-3 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-1"
                            onClick={() => setConfirmResign(s)}
                          >
                            <UserX size={12} /> Resign
                          </button>
                        ) : (
                          <button
                            className="btn py-1.5 px-3 text-xs border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 rounded-xl flex items-center gap-1"
                            onClick={() => handleToggleActive(s)}
                          >
                            <UserCheck size={12} /> Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-[#7B91BC]">No staff found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resign Confirmation Dialog */}
      {confirmResign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmResign(null)} />
          <div className="relative bg-[#0D1526] border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <UserX size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-[#E8F0FF]">Mark as Resigned?</h3>
                <p className="text-xs text-[#7B91BC] mt-0.5">{confirmResign.name}</p>
              </div>
            </div>
            <p className="text-sm text-[#7B91BC]">
              This staff member will be marked as <span className="text-red-400 font-semibold">Resigned</span> and excluded from all future payroll calculations.
            </p>
            <div className="flex gap-3 pt-1">
              <button className="btn btn-ghost flex-1" onClick={() => setConfirmResign(null)}>Cancel</button>
              <button
                className="flex-1 py-2 px-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
                onClick={handleResignConfirm}
              >
                Confirm Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-[#0D1526] border border-[#1E2D4A] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2D4A]">
              <h2 className="font-display font-bold text-[#E8F0FF]">{modal.data.id ? "Edit Staff" : "Add Staff"}</h2>
              <button className="text-[#7B91BC] hover:text-[#E8F0FF]" onClick={closeModal}><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Full Name</label>
                <input className="inp" placeholder="e.g. Dr. Ahmad bin Ali" value={modal.data.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Role</label>
                  <select className="inp" value={modal.data.role ?? "resident_dentist"} onChange={(e) => set("role", e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Primary Branch</label>
                  <select className="inp" value={modal.data.branchId ?? branches[0]?.id} onChange={(e) => set("branchId", e.target.value)}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <p className="text-[10px] text-[#7B91BC] mt-1">For payslip header only. Commission counts treatments from all branches.</p>
                </div>
              </div>
              {(modal.data.role === "resident_dentist" || modal.data.role === "fulltime_da" || modal.data.role === "fulltime_dsa_monthly" || modal.data.role === "supervisor") && (
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Monthly Basic Salary (RM)</label>
                  <input className="inp" type="number" placeholder="e.g. 4500" value={modal.data.basicSalary ?? ""} onChange={(e) => set("basicSalary", parseFloat(e.target.value))} />
                </div>
              )}
              {modal.data.role === "locum_dentist" && (
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Daily Rate (RM)</label>
                  <input className="inp" type="number" placeholder="e.g. 350" value={modal.data.dailyRate ?? ""} onChange={(e) => set("dailyRate", parseFloat(e.target.value))} />
                </div>
              )}
              {modal.data.role === "parttime_da" && (
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Hourly Rate (RM)</label>
                  <input className="inp" type="number" placeholder="e.g. 8" value={modal.data.hourlyRate ?? ""} onChange={(e) => set("hourlyRate", parseFloat(e.target.value))} />
                </div>
              )}
              {isDentist(modal.data.role) && (
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Commission Rate</label>
                  <select className="inp" value={modal.data.commissionRate ?? 0.3} onChange={(e) => set("commissionRate", parseFloat(e.target.value))}>
                    {[0.3, 0.35, 0.4, 0.45, 0.5].map((r) => <option key={r} value={r}>{(r * 100).toFixed(0)}%</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">IC Number</label>
                  <input className="inp" placeholder="XXXXXX-XX-XXXX" value={modal.data.icNumber ?? ""} onChange={(e) => set("icNumber", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Bank Account</label>
                  <input className="inp" placeholder="Bank XXXX..." value={modal.data.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">EPF No.</label>
                  <input className="inp" placeholder="600XXXXXXXXX" value={modal.data.epfNumber ?? ""} onChange={(e) => set("epfNumber", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">SOCSO No.</label>
                  <input className="inp" placeholder="B/01/XXXXXXXX" value={modal.data.socsoNumber ?? ""} onChange={(e) => set("socsoNumber", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Join Date</label>
                <input className="inp" type="date" value={modal.data.joinDate ?? ""} onChange={(e) => set("joinDate", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Performance Allowance Cap (RM)</label>
                <input className="inp" type="number" min="0" placeholder="e.g. 300 — leave 0 if not eligible" value={modal.data.performanceAllowanceCap ?? 0} onChange={(e) => set("performanceAllowanceCap", parseFloat(e.target.value) || 0)} />
                <p className="text-[10px] text-[#7B91BC] mt-1">Maximum allowance payable per month. Actual amount is entered in Payroll each month.</p>
              </div>
              {(modal.data.role === "fulltime_da" || modal.data.role === "fulltime_dsa_monthly") && (
                <div>
                  <label className="block text-xs font-semibold text-[#7B91BC] mb-1.5 uppercase tracking-wider">Fixed OT Pay (RM/month)</label>
                  <input className="inp" type="number" min="0" placeholder="e.g. 200 — leave 0 if calculated from attendance" value={modal.data.fixedOtPay ?? 0} onChange={(e) => set("fixedOtPay", parseFloat(e.target.value) || 0)} />
                  <p className="text-[10px] text-[#7B91BC] mt-1">If set, this fixed amount is applied every month instead of calculating OT from clock-out time.</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#1E2D4A] flex justify-end gap-3">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveModal} disabled={saving}>
                {saving ? "Saving..." : modal.data.id ? "Save Changes" : "Add Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
