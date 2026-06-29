import type { ScanType } from "./supabase";

// ── Scan type windows ──────────────────────────────────────────────────────
// before 09:00       → morning_in
// 09:00 – 13:00      → morning_out
// 13:00 – 15:30      → afternoon_in
// after  15:30       → afternoon_out

export function getScanType(): ScanType {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < 9 * 60)          return "morning_in";
  if (mins < 13 * 60)         return "morning_out";
  if (mins < 15 * 60 + 30)   return "afternoon_in";
  return "afternoon_out";
}

// ── Late thresholds (minutes from midnight) ────────────────────────────────
const THRESHOLDS: Record<ScanType, number> = {
  morning_in:    6 * 60 + 15,   // 06:15
  morning_out:   12 * 60 + 15,  // 12:15
  afternoon_in:  14 * 60 + 15,  // 14:15 (2:15pm)
  afternoon_out: 17 * 60 + 15,  // 17:15 (5:15pm)
};

// Logistics department gets until 15:15 (3:15pm) for afternoon_in
const LOGISTICS_AFTERNOON_IN_THRESHOLD = 15 * 60 + 15;

export function isLogistics(department: string): boolean {
  return department.toLowerCase().includes("logistic") ||
         department === "Logistics" ||
         department === "logistics";
}

export function checkLate(
  scanType: ScanType,
  now: Date,
  department: string,
): { late: boolean; lateMinutes: number } {
  const nowMins = now.getHours() * 60 + now.getMinutes();

  let threshold = THRESHOLDS[scanType];
  if (scanType === "afternoon_in" && isLogistics(department)) {
    threshold = LOGISTICS_AFTERNOON_IN_THRESHOLD;
  }

  const lateMinutes = nowMins - threshold;
  if (lateMinutes <= 0) return { late: false, lateMinutes: 0 };
  return { late: true, lateMinutes };
}

// ── Shift report helpers ───────────────────────────────────────────────────
export type ShiftPeriod = "morning" | "afternoon";

export function currentShiftPeriod(): ShiftPeriod | null {
  const mins = new Date().getHours() * 60 + new Date().getMinutes();
  if (mins >= 12 * 60 + 15 && mins < 14 * 60) return "morning";
  if (mins >= 17 * 60 + 15) return "afternoon";
  return null;
}

export const SCAN_TYPE_LABEL_KH: Record<ScanType, string> = {
  morning_in:    "ចូល (ព្រឹក)",
  morning_out:   "ចេញ (ព្រឹក)",
  afternoon_in:  "ចូល (រសៀល)",
  afternoon_out: "ចេញ (រសៀល)",
};

export const SCAN_TYPE_LABEL_EN: Record<ScanType, string> = {
  morning_in:    "Morning In",
  morning_out:   "Morning Out",
  afternoon_in:  "Afternoon In",
  afternoon_out: "Afternoon Out",
};
