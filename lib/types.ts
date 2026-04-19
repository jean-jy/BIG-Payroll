export type Role =
  | "resident_dentist"
  | "locum_dentist"
  | "fulltime_da"
  | "parttime_da"
  | "supervisor";

export const ROLE_LABELS: Record<Role, string> = {
  resident_dentist: "Resident Dentist",
  locum_dentist: "Locum Dentist",
  fulltime_da: "Full-time DA",
  parttime_da: "Part-time DA",
  supervisor: "Supervisor",
};

export type Branch = {
  id: string;
  name: string;
  location: string;
  colorKey: "a" | "b" | "c";
};

export type Staff = {
  id: string;
  name: string;
  role: Role;
  branchId: string;
  commissionRate?: number;
  basicSalary?: number;
  dailyRate?: number;
  hourlyRate?: number;
  icNumber: string;
  bankAccount: string;
  epfNumber: string;
  socsoNumber: string;
  isActive: boolean;
  joinDate: string;
};

export type SaleCategory = "treatment" | "product" | "medicine";

export type TreatmentType = {
  id: string;
  name: string;
  defaultFee: number;
  materialCost: number;
  isLabCase: boolean;
  saleCategory: SaleCategory;
};

export type TreatmentRecord = {
  id: string;
  date: string;
  patientName: string;
  staffId: string;
  branchId: string;
  treatmentTypeId: string;
  fee: number;
  labCost?: number;
  saleCategory: SaleCategory;
};

export type AttendanceRecord = {
  id: string;
  staffId: string;
  date: string;
  clockIn: string;
  clockOut: string;
  otHours: number;
  otOverride?: number;
  overrideReason?: string;
};

export type PayrollEntry = {
  staffId: string;
  month: string;
  basicOrDailyOrHourly: number;
  totalCommission: number;
  finalPay: number;
  payBasis: "basic" | "commission" | "hourly" | "mixed";
  otHours: number;
  otPay: number;
  earlyLeaveHours: number;
  earlyLeavePenalty: number;
  grossPay: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  totalDeductions: number;
  netPay: number;
  status: "draft" | "finalised";
  commissionBreakdown: CommissionLine[];
};

export type CommissionLine = {
  date: string;
  patientName: string;
  treatmentName: string;
  fee: number;
  materialCost: number;
  labCost: number;
  netBase: number;
  rate: number;
  commission: number;
};

export type ImportRecord = {
  id: string;
  branchId: string;
  month: string;
  importedAt: string;
  recordCount: number;
  totalAmount: number;
  filename: string;
};
