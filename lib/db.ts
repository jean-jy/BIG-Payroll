import { supabase } from "./supabase";
import { Branch, Staff, TreatmentType, TreatmentRecord, AttendanceRecord, PayrollAdjustment, DoctorSchedule, ClinicClosure } from "./types";

export type PerformanceAllowanceMap = Record<string, number>;

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function nextMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
    performanceAllowanceCap: r.performance_allowance_cap ?? 0,
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
    performance_allowance_cap: s.performanceAllowanceCap ?? 0,
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
    performanceAllowanceCap: data.performance_allowance_cap ?? 0,
  };
}

// ── Performance Allowances ───────────────────────────────────────────────────
export async function fetchPerformanceAllowances(month: string): Promise<PerformanceAllowanceMap> {
  const { data, error } = await supabase
    .from("performance_allowances")
    .select("staff_id, amount")
    .eq("month", month);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.staff_id, r.amount ?? 0]));
}

export async function upsertPerformanceAllowance(staffId: string, month: string, amount: number) {
  const { error } = await supabase
    .from("performance_allowances")
    .upsert({ staff_id: staffId, month, amount }, { onConflict: "staff_id,month" });
  if (error) throw error;
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
    variableMaterialCost: r.variable_material_cost ?? false,
    isOnHold: r.is_on_hold ?? false,
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
    variable_material_cost: t.variableMaterialCost ?? false,
    is_on_hold: t.isOnHold ?? false,
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
    variableMaterialCost: data.variable_material_cost ?? false,
    isOnHold: data.is_on_hold ?? false,
    saleCategory: data.sale_category,
  };
}

export async function deleteTreatmentType(id: string) {
  const { error } = await supabase.from("treatment_types").delete().eq("id", id);
  if (error) throw error;
}

// ── Treatment Records ────────────────────────────────────────────────────────
function mapRecord(r: Record<string, unknown>): TreatmentRecord {
  return {
    id: r.id as string,
    date: r.date as string,
    patientName: r.patient_name as string,
    staffId: r.staff_id as string,
    branchId: r.branch_id as string,
    treatmentTypeId: r.treatment_type_id as string,
    fee: r.fee as number,
    labCost: r.lab_cost as number | undefined,
    materialCostOverride: r.material_cost_override != null ? r.material_cost_override as number : undefined,
    isOnHold: (r.is_on_hold as boolean) ?? false,
    releaseMonth: r.release_month as string | undefined,
    saleCategory: r.sale_category as TreatmentRecord["saleCategory"],
  };
}

export async function fetchTreatmentRecords(month: string): Promise<TreatmentRecord[]> {
  // Current month's records
  const { data: current, error: e1 } = await supabase
    .from("treatment_records")
    .select("*")
    .gte("date", `${month}-01`)
    .lt("date", nextMonth(month))
    .order("date");
  if (e1) throw e1;

  // Deferred records from previous months queued for this month
  const { data: deferred, error: e2 } = await supabase
    .from("treatment_records")
    .select("*")
    .eq("release_month", month)
    .lt("date", `${month}-01`)
    .order("date");
  if (e2) throw e2;

  return [...current.map(mapRecord), ...deferred.map(mapRecord)];
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

export async function updateMaterialCostOverride(recordId: string, amount: number) {
  const { error } = await supabase
    .from("treatment_records")
    .update({ material_cost_override: amount })
    .eq("id", recordId);
  if (error) throw error;
}

export async function updateLabCost(recordId: string, amount: number) {
  const { error } = await supabase
    .from("treatment_records")
    .update({ lab_cost: amount })
    .eq("id", recordId);
  if (error) throw error;
}

export async function updateRecordOnHold(recordId: string, isOnHold: boolean, currentMonth?: string) {
  const updates: Record<string, unknown> = { is_on_hold: isOnHold };
  if (isOnHold && currentMonth) {
    updates.release_month = nextMonthStr(currentMonth);
  } else if (!isOnHold) {
    updates.release_month = null;
  }
  const { error } = await supabase
    .from("treatment_records")
    .update(updates)
    .eq("id", recordId);
  if (error) throw error;
}

export async function updateSaleCategory(recordId: string, saleCategory: "treatment" | "product" | "medicine") {
  const { error } = await supabase
    .from("treatment_records")
    .update({ sale_category: saleCategory })
    .eq("id", recordId);
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

// ── Import History ───────────────────────────────────────────────────────────
export type ImportHistoryEntry = {
  id: string; branchId: string; branchName: string; month: string;
  importedAt: string; recordCount: number; totalAmount: number; filename: string;
};

export async function fetchImportHistory(): Promise<ImportHistoryEntry[]> {
  const { data, error } = await supabase
    .from("import_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, branchId: r.branch_id, branchName: r.branch_name,
    month: r.month, importedAt: r.imported_at,
    recordCount: r.record_count, totalAmount: r.total_amount, filename: r.filename,
  }));
}

export async function insertImportHistory(entry: ImportHistoryEntry): Promise<void> {
  const { error } = await supabase.from("import_history").insert({
    id: entry.id, branch_id: entry.branchId, branch_name: entry.branchName,
    month: entry.month, imported_at: entry.importedAt,
    record_count: entry.recordCount, total_amount: entry.totalAmount, filename: entry.filename,
  });
  if (error) throw error;
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

// ── Payroll Adjustments ──────────────────────────────────────────────────────
export type AdjustmentMap = Record<string, PayrollAdjustment[]>;

export async function fetchPayrollAdjustments(month: string): Promise<AdjustmentMap> {
  const { data, error } = await supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("month", month)
    .order("created_at");
  if (error) throw error;
  const map: AdjustmentMap = {};
  for (const r of data) {
    if (!map[r.staff_id]) map[r.staff_id] = [];
    map[r.staff_id].push({ id: r.id, staffId: r.staff_id, month: r.month, description: r.description, amount: r.amount, type: r.type });
  }
  return map;
}

export async function insertPayrollAdjustment(adj: Omit<PayrollAdjustment, "id">): Promise<PayrollAdjustment> {
  const { data, error } = await supabase
    .from("payroll_adjustments")
    .insert({ staff_id: adj.staffId, month: adj.month, description: adj.description, amount: adj.amount, type: adj.type })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, staffId: data.staff_id, month: data.month, description: data.description, amount: data.amount, type: data.type };
}

export async function updatePayrollAdjustment(id: string, updates: { description: string; amount: number; type: "add" | "deduct" }) {
  const { error } = await supabase
    .from("payroll_adjustments")
    .update({ description: updates.description, amount: updates.amount, type: updates.type })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePayrollAdjustment(id: string) {
  const { error } = await supabase.from("payroll_adjustments").delete().eq("id", id);
  if (error) throw error;
}

// ── Doctor Schedules ─────────────────────────────────────────────────────────
export async function fetchDoctorSchedules(month: string): Promise<DoctorSchedule[]> {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(y, m, 1).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("doctor_schedules")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    date: r.date,
    branchId: r.branch_id,
    startTime: r.start_time ?? undefined,
    endTime: r.end_time ?? undefined,
    notes: r.notes ?? undefined,
    isLeave: r.is_leave,
    leaveType: r.leave_type ?? undefined,
  }));
}

export async function upsertDoctorSchedule(s: Omit<DoctorSchedule, "id"> & { id?: string }): Promise<DoctorSchedule> {
  const row = {
    ...(s.id ? { id: s.id } : {}),
    staff_id: s.staffId,
    date: s.date,
    branch_id: s.branchId,
    start_time: s.startTime ?? null,
    end_time: s.endTime ?? null,
    notes: s.notes ?? null,
    is_leave: s.isLeave,
    leave_type: s.leaveType ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("doctor_schedules")
    .upsert(row, { onConflict: "staff_id,date" })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    staffId: data.staff_id,
    date: data.date,
    branchId: data.branch_id,
    startTime: data.start_time ?? undefined,
    endTime: data.end_time ?? undefined,
    notes: data.notes ?? undefined,
    isLeave: data.is_leave,
    leaveType: data.leave_type ?? undefined,
  };
}

export async function deleteDoctorSchedule(id: string): Promise<void> {
  const { error } = await supabase.from("doctor_schedules").delete().eq("id", id);
  if (error) throw error;
}

// ── Clinic Closures ──────────────────────────────────────────────────────────
export async function fetchClinicClosures(month: string): Promise<ClinicClosure[]> {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(y, m, 1).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("clinic_closures")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date");
  if (error) throw error;
  return data.map((r) => ({ id: r.id, date: r.date, type: r.type, name: r.name }));
}

export async function upsertClinicClosure(c: Omit<ClinicClosure, "id"> & { id?: string }): Promise<ClinicClosure> {
  const row = { ...(c.id ? { id: c.id } : {}), date: c.date, type: c.type, name: c.name };
  const { data, error } = await supabase
    .from("clinic_closures")
    .upsert(row, { onConflict: "date" })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, date: data.date, type: data.type, name: data.name };
}

export async function deleteClinicClosure(id: string): Promise<void> {
  const { error } = await supabase.from("clinic_closures").delete().eq("id", id);
  if (error) throw error;
}
