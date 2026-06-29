import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_DS_SUPABASE_URL) as string;
const supabaseAnonKey = (import.meta.env.VITE_DS_SUPABASE_ANON_KEY) as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase env vars — check VITE_DS_SUPABASE_URL and VITE_DS_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Location = {
  id: string;
  name: string;
  pin: string;
  telegram_chat_id: string;
};

export type Employee = {
  id: string;
  name: string;
  department: string;
  location_id: string;
  start_date: string;
  is_active: boolean;
};

export type ScanType = "morning_in" | "morning_out" | "afternoon_in" | "afternoon_out";

export type Scan = {
  id: string;
  employee_id: string;
  location_id: string;
  date: string;
  scan_type: ScanType;
  scanned_at: string;
  is_late: boolean;
  late_minutes: number | null;
  late_reason_audio_url: string | null;
  missing_afternoon_in: boolean;
  verified: boolean;
};

// Table names — prefixed with ds_ so Den Samot shares the Bati Supabase project
// without colliding with bati's employees / attendance_logs / etc.
export const DS = {
  LOCATIONS: "ds_locations",
  EMPLOYEES: "ds_employees",
  SCANS:     "ds_scans",
} as const;

export const FACE_BUCKET = "ds-employee-faces";
export const LATE_AUDIO_BUCKET = "ds-late-reasons";

export function faceFilename(employeeId: string): string {
  return encodeURIComponent(employeeId).replace(/%/g, "_") + ".jpg";
}

export function lateAudioPath(employeeId: string, scanId: string): string {
  return `${employeeId}/${scanId}.webm`;
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}
