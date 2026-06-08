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

