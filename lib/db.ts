import { supabase } from "./supabase";
import { Branch, Staff, TreatmentType, TreatmentRecord, AttendanceRecord } from "./types";

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1); // m is already 1-indexed; new Date(y, m, 1) gives 1st of next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Branches ────────────────────────────────────────────────────────────────
export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase.from("branches").select("*").order("name");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    location: r.location,
    colorKey: r.color_key,
  }));
}

// ── Staff ────────────────────────────────────────────────────────────────────
export async function fetchStaff(): Promise<Staff[]> {
  const { data, error } = await supabase.from("staff").select("*").order("name");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    branchId: r.branch_id,
    commissionRate: r.commission_rate,
    basicSalary: r.basic_salary,
    dailyRate: r.daily_rate,
    hourlyRate: r.hourly_rate,
    icNumber: r.ic_number,
    bankAccount: r.bank_account,
    epfNumber: r.epf_number,
    socsoNumber: r.socso_number,
    isActive: r.is_active,
    joinDate: r.join_date,
  }));
}

export async function upsertStaff(s: Partial<Staff>): Promise<Staff> {
  const row = {
    ...(s.id ? { id: s.id } : {}),
    name: s.name,
    role: s.role,
    branch_id: s.branchId,
    commission_rate: s.commissionRate ?? null,
    basic_salary: s.basicSalary ?? null,
    daily_rate: s.dailyRate ?? null,
    hourly_rate: s.hourlyRate ?? null,
    ic_number: s.icNumber ?? null,
    bank_account: s.bankAccount ?? null,
    epf_number: s.epfNumber ?? null,
    socso_number: s.socsoNumber ?? null,
    is_active: s.isActive ?? true,
    join_date: s.joinDate ?? null,
  };
  const { data, error } = await supabase
    .from("staff")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id, name: data.name, role: data.role, branchId: data.branch_id,
    commissionRate: data.commission_rate, basicSalary: data.basic_salary,
    dailyRate: data.daily_rate, hourlyRate: data.hourly_rate,
    icNumber: data.ic_number, bankAccount: data.bank_account,
    epfNumber: data.epf_number, socsoNumber: data.socso_number,
    isActive: data.is_active, joinDate: data.join_date,
  };
}

export async function setStaffActive(id: string, isActive: boolean) {
  const { error } = await supabase.from("staff").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

// ── Treatment Types ──────────────────────────────────────────────────────────
export async function fetchTreatmentTypes(): Promise<TreatmentType[]> {
  const { data, error } = await supabase.from("treatment_types").select("*").order("sale_category").order("name");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    defaultFee: r.default_fee,
    materialCost: r.material_cost,
    isLabCase: r.is_lab_case,
    saleCategory: r.sale_category,
  }));
}

export async function upsertTreatmentType(t: Partial<TreatmentType>): Promise<TreatmentType> {
  const row = {
    ...(t.id ? { id: t.id } : {}),
    name: t.name,
    default_fee: t.defaultFee ?? 0,
    material_cost: t.materialCost ?? 0,
    is_lab_case: t.isLabCase ?? false,
    sale_category: t.saleCategory ?? "treatment",
  };
  const { data, error } = await supabase
    .from("treatment_types")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id, name: data.name, defaultFee: data.default_fee,
    materialCost: data.material_cost, isLabCase: data.is_lab_case,
    saleCategory: data.sale_category,
  };
}

export async function deleteTreatmentType(id: string) {
  const { error } = await supabase.from("treatment_types").delete().eq("id", id);
  if (error) throw error;
}

// ── Treatment Records ────────────────────────────────────────────────────────
export async function fetchTreatmentRecords(month: string): Promise<TreatmentRecord[]> {
  const { data, error } = await supabase
    .from("treatment_records")
    .select("*")
    .gte("date", `${month}-01`)
    .lt("date", nextMonth(month))
    .order("date");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    date: r.date,
    patientName: r.patient_name,
    staffId: r.staff_id,
    branchId: r.branch_id,
    treatmentTypeId: r.treatment_type_id,
    fee: r.fee,
    labCost: r.lab_cost,
    saleCategory: r.sale_category,
  }));
}

export async function insertTreatmentRecords(records: Omit<TreatmentRecord, "id">[]) {
  const rows = records.map((r) => ({
    date: r.date,
    patient_name: r.patientName,
    staff_id: r.staffId,
    branch_id: r.branchId,
    treatment_type_id: r.treatmentTypeId,
    fee: r.fee,
    lab_cost: r.labCost ?? null,
    sale_category: r.saleCategory,
  }));
  const { error } = await supabase.from("treatment_records").insert(rows);
  if (error) throw error;
}

export async function deleteTreatmentRecordsByBranchMonth(branchId: string, month: string) {
  const { error } = await supabase
    .from("treatment_records")
    .delete()
    .eq("branch_id", branchId)
    .gte("date", `${month}-01`)
    .lt("date", nextMonth(month));
  if (error) throw error;
}

// ── Attendance Records ───────────────────────────────────────────────────────
export async function fetchAttendanceRecords(month: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .gte("date", `${month}-01`)
    .lt("date", nextMonth(month))
    .order("date");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    date: r.date,
    clockIn: r.clock_in,
    clockOut: r.clock_out,
    otHours: r.ot_hours,
    otOverride: r.ot_override,
    overrideReason: r.override_reason,
  }));
}

export async function upsertAttendance(a: Partial<AttendanceRecord>): Promise<AttendanceRecord> {
  const row = {
    ...(a.id ? { id: a.id } : {}),
    staff_id: a.staffId,
    date: a.date,
    clock_in: a.clockIn,
    clock_out: a.clockOut,
    ot_hours: a.otHours ?? 0,
    ot_override: a.otOverride ?? null,
    override_reason: a.overrideReason ?? null,
  };
  const { data, error } = await supabase
    .from("attendance_records")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id, staffId: data.staff_id, date: data.date,
    clockIn: data.clock_in, clockOut: data.clock_out,
    otHours: data.ot_hours, otOverride: data.ot_override,
    overrideReason: data.override_reason,
  };
}

// ── Payroll Periods ──────────────────────────────────────────────────────────
export async function fetchPayrollStatuses(month: string): Promise<Record<string, "draft" | "finalised">> {
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("staff_id, status")
    .eq("month", month);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.staff_id, r.status]));
}

export async function finalisePayroll(staffId: string, month: string) {
  const { error } = await supabase.from("payroll_periods").upsert(
    { staff_id: staffId, month, status: "finalised", finalised_at: new Date().toISOString() },
    { onConflict: "month,staff_id" }
  );
  if (error) throw error;
}

export async function finaliseAllPayroll(staffIds: string[], month: string) {
  const rows = staffIds.map((id) => ({
    staff_id: id, month, status: "finalised", finalised_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("payroll_periods").upsert(rows, { onConflict: "month,staff_id" });
  if (error) throw error;
}
