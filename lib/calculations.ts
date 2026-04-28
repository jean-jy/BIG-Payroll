import { Staff, TreatmentRecord, AttendanceRecord, TreatmentType, PayrollEntry, CommissionLine, PayrollAdjustment } from "./types";

const OT_RATE = 12;
const CLINIC_END_HOUR = 19;

// Malaysian statutory rates (2024)
const EPF_EMPLOYEE_RATE = 0.11;
const EPF_EMPLOYER_RATE_LOW = 0.13; // wage <= 5000
const EPF_EMPLOYER_RATE_HIGH = 0.12; // wage > 5000
const SOCSO_EMPLOYEE_RATE = 0.005;
const SOCSO_EMPLOYER_RATE = 0.0175;
const SOCSO_WAGE_CEILING = 5000;
const EIS_RATE = 0.002;
const EIS_WAGE_CEILING = 5000;

export function calcOtHours(clockOut: string): number {
  const [h, m] = clockOut.split(":").map(Number);
  const totalMins = h * 60 + m;
  const endMins = CLINIC_END_HOUR * 60;
  const extraMins = totalMins - endMins;
  if (extraMins < 30) return 0;
  return Math.floor(extraMins / 30) * 0.5;
}

export function calcEarlyLeaveHours(clockOut: string): number {
  const [h, m] = clockOut.split(":").map(Number);
  const totalMins = h * 60 + m;
  const endMins = CLINIC_END_HOUR * 60;
  const earlyMins = endMins - totalMins;
  if (earlyMins < 30) return 0;
  return Math.floor(earlyMins / 30) * 0.5;
}

export function calcCommissionLine(
  record: TreatmentRecord,
  treatmentType: TreatmentType,
  commissionRate: number
): CommissionLine {
  const effectiveCategory = treatmentType.saleCategory || record.saleCategory || "treatment";
  const isMedicine = effectiveCategory === "medicine";
  const isProduct  = effectiveCategory === "product";

  // Medicine: 50% of fee is cost, then doctor's commission % on the net
  // Product: no cost deduction, flat 10%
  // Treatment: fixed/variable material cost + lab cost, then doctor's commission %
  const materialCost = isMedicine ? record.fee * 0.5
    : isProduct ? 0
    : treatmentType.variableMaterialCost ? (record.materialCostOverride ?? 0)
    : treatmentType.materialCost;
  const labCost = record.labCost ?? 0;
  const netBase = Math.max(0, record.fee - materialCost - labCost);
  const rate = isProduct ? 0.1 : commissionRate;

  const commission = netBase * rate;

  return {
    date: record.date,
    patientName: record.patientName,
    treatmentName: treatmentType.name,
    fee: record.fee,
    materialCost,
    labCost,
    netBase,
    rate,
    commission,
    saleCategory: effectiveCategory as any,
  };
}


function calcStatutory(grossPay: number) {
  const epfBase = grossPay;
  const socsoBase = Math.min(grossPay, SOCSO_WAGE_CEILING);
  const eisBase = Math.min(grossPay, EIS_WAGE_CEILING);

  const epfEmployee = epfBase * EPF_EMPLOYEE_RATE;
  const epfEmployer = epfBase * (grossPay <= 5000 ? EPF_EMPLOYER_RATE_LOW : EPF_EMPLOYER_RATE_HIGH);
  const socsoEmployee = socsoBase * SOCSO_EMPLOYEE_RATE;
  const socsoEmployer = socsoBase * SOCSO_EMPLOYER_RATE;
  const eisEmployee = eisBase * EIS_RATE;
  const eisEmployer = eisBase * EIS_RATE;

  return { epfEmployee, epfEmployer, socsoEmployee, socsoEmployer, eisEmployee, eisEmployer };
}

export function calcPayroll(
  s: Staff,
  month: string,
  records: TreatmentRecord[],
  attendance: AttendanceRecord[],
  treatmentTypes: TreatmentType[],
  performanceAllowance = 0,
  adjustments: PayrollAdjustment[] = []
): PayrollEntry {
  const ttMap = Object.fromEntries(treatmentTypes.map((t) => [t.id, t]));
  const myRecords = records.filter((r) => r.staffId === s.id && r.date.startsWith(month));
  const myAttendance = attendance.filter((a) => a.staffId === s.id && a.date.startsWith(month));

  // OT & early leave — only for DAs
  const isDA = s.role === "fulltime_da" || s.role === "fulltime_dsa_monthly" || s.role === "parttime_da";
  const hasFixedOt = (s.fixedOtPay ?? 0) > 0;
  const otHours = isDA && !hasFixedOt
    ? myAttendance.reduce((sum, a) => sum + (a.otOverride ?? a.otHours), 0)
    : 0;
  const otPay = hasFixedOt ? (s.fixedOtPay ?? 0) : otHours * OT_RATE;

  // Hourly rate for deduction: PT DA uses hourlyRate; FT DA = (basic / 26 days) / 7.5 hrs
  const daHourlyRate =
    s.role === "parttime_da" ? (s.hourlyRate ?? 0)
    : (s.basicSalary ?? 0) / 26 / 7.5; // fulltime_da & fulltime_dsa_monthly

  const earlyLeaveHours = isDA
    ? myAttendance.reduce((sum, a) => sum + calcEarlyLeaveHours(a.clockOut), 0)
    : 0;
  const earlyLeavePenalty = earlyLeaveHours * daHourlyRate;

  let basicOrDailyOrHourly = 0;
  let totalCommission = 0;
  let finalPay = 0;
  let payBasis: PayrollEntry["payBasis"] = "basic";
  const commissionBreakdown: CommissionLine[] = [];

  const onHoldRecords = myRecords.filter((r) => r.isOnHold || ttMap[r.treatmentTypeId]?.isOnHold);
  const eligibleRecords = myRecords.filter((r) => !r.isOnHold && !ttMap[r.treatmentTypeId]?.isOnHold);

  // Build on-hold breakdown grouped by treatment name
  const onHoldMap: Record<string, number> = {};
  for (const r of onHoldRecords) {
    const name = ttMap[r.treatmentTypeId]?.name ?? "Unknown";
    onHoldMap[name] = (onHoldMap[name] ?? 0) + r.fee;
  }
  const onHoldBreakdown = Object.entries(onHoldMap).map(([treatmentName, totalFee]) => ({ treatmentName, totalFee }));

  if (s.role === "resident_dentist") {
    basicOrDailyOrHourly = s.basicSalary ?? 0;
    const lines = eligibleRecords.map((r) =>
      calcCommissionLine(r, ttMap[r.treatmentTypeId], s.commissionRate ?? 0)
    );
    commissionBreakdown.push(...lines);
    totalCommission = lines.reduce((sum, l) => sum + l.commission, 0);
    if (totalCommission > basicOrDailyOrHourly) {
      finalPay = totalCommission;
      payBasis = "commission";
    } else {
      finalPay = basicOrDailyOrHourly;
      payBasis = "basic";
    }
  } else if (s.role === "locum_dentist") {
    const days = Array.from(new Set(eligibleRecords.map((r) => r.date)));
    const lines = eligibleRecords.map((r) =>
      calcCommissionLine(r, ttMap[r.treatmentTypeId], s.commissionRate ?? 0)
    );
    commissionBreakdown.push(...lines);
    totalCommission = lines.reduce((sum, l) => sum + l.commission, 0);
    basicOrDailyOrHourly = (s.dailyRate ?? 0) * days.length;
    finalPay = Math.max(basicOrDailyOrHourly, totalCommission);
    payBasis = totalCommission > basicOrDailyOrHourly ? "commission" : "basic";
  } else if (s.role === "parttime_da") {
    const totalHours = myAttendance.reduce((sum, a) => {
      const [inH, inM] = a.clockIn.split(":").map(Number);
      const [outH, outM] = a.clockOut.split(":").map(Number);
      return sum + (outH * 60 + outM - (inH * 60 + inM)) / 60;
    }, 0);
    basicOrDailyOrHourly = totalHours * (s.hourlyRate ?? 0);
    finalPay = basicOrDailyOrHourly;
    payBasis = "hourly";
  } else {
    // fulltime_da, supervisor
    basicOrDailyOrHourly = s.basicSalary ?? 0;
    finalPay = basicOrDailyOrHourly;
    payBasis = "basic";
  }

  const adjustmentNet = adjustments.reduce((sum, a) => sum + (a.type === "add" ? a.amount : -a.amount), 0);
  const grossPay = Math.max(0, finalPay + otPay - earlyLeavePenalty + performanceAllowance + adjustmentNet);
  const noStatutory = s.role === "fulltime_dsa_monthly" || s.role === "resident_dentist" || s.role === "locum_dentist";
  const stat = noStatutory
    ? { epfEmployee: 0, epfEmployer: 0, socsoEmployee: 0, socsoEmployer: 0, eisEmployee: 0, eisEmployer: 0 }
    : calcStatutory(grossPay);
  const totalDeductions = stat.epfEmployee + stat.socsoEmployee + stat.eisEmployee;
  const netPay = grossPay - totalDeductions;

  return {
    staffId: s.id,
    month,
    basicOrDailyOrHourly,
    totalCommission,
    finalPay,
    payBasis,
    otHours,
    otPay,
    earlyLeaveHours,
    earlyLeavePenalty,
    performanceAllowance,
    adjustmentNet,
    grossPay,
    ...stat,
    totalDeductions,
    netPay,
    status: "draft",
    commissionBreakdown,
    onHoldBreakdown,
  };
}

export const rm = (n: number) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
