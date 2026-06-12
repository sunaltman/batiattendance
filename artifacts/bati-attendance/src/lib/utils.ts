import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getShift(): "morning" | "afternoon" {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : "afternoon";
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function calcTenureYears(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export function calcLeaveEntitlement(startDate: string): number {
  return calcTenureYears(startDate) >= 10 ? 19 : 18;
}

export function calcLeaveUsed(leaveDays: { type: "full" | "half" }[]): number {
  return leaveDays.reduce((acc, l) => acc + (l.type === "full" ? 1 : 0.5), 0);
}

export function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
}

export function formatKhmerDate(date: Date): string {
  const KHMER_MONTHS = [
    "មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា",
    "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ",
  ];
  const KHMER_DAYS = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"];
  return `${KHMER_DAYS[date.getDay()]} ទី${date.getDate()} ${KHMER_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function isShiftClosed(shift: "morning" | "afternoon"): boolean {
  const hour = new Date().getHours();
  const min = new Date().getMinutes();
  const totalMins = hour * 60 + min;
  if (shift === "morning") return totalMins > 11 * 60 + 30;
  return totalMins > 17 * 60;
}

/**
 * Returns the leave year boundaries for an employee based on their work anniversary.
 * Leave year runs from start_date anniversary to the day before next anniversary.
 * E.g. start_date = 2015-03-01 → current leave year = 2025-03-01 to 2026-02-28
 */
export function getLeaveYearBounds(startDate: string): { from: string; to: string } {
  const today = new Date();
  const start = new Date(startDate);
  const month = start.getMonth(); // 0-indexed
  const day = start.getDate();

  // Find the most recent anniversary on or before today
  let fromYear = today.getFullYear();
  let anniversaryThisYear = new Date(fromYear, month, day);
  if (anniversaryThisYear > today) {
    fromYear -= 1;
    anniversaryThisYear = new Date(fromYear, month, day);
  }

  const toDate = new Date(fromYear + 1, month, day - 1);

  return {
    from: anniversaryThisYear.toISOString().split("T")[0],
    to: toDate.toISOString().split("T")[0],
  };
}

/**
 * Sum leave days used in a specific calendar month (YYYY-MM).
 */
export function calcMonthlyLeaveUsed(
  records: { date: string; type: "full" | "half" }[],
  yearMonth: string // "YYYY-MM"
): number {
  return records
    .filter((r) => r.date.startsWith(yearMonth))
    .reduce((s, r) => s + (r.type === "full" ? 1 : 0.5), 0);
}

/** Max leave days allowed per calendar month */
export const MONTHLY_LEAVE_CAP = 1.5;

/** Bonus policy — single source of truth for dashboard + finance */
export const FULL_BONUS = 16;    // 26 effective days
export const PARTIAL_BONUS = 6;  // 1 day short
export const WORK_DAYS = 26;

