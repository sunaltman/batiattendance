import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string;
const supabaseAnonKey = (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Employee = {
  id: string;
  name: string;
  department: string;
  start_date: string;
  is_active: boolean;
};

export type AttendanceLog = {
  id: string;
  employee_id: string;
  date: string;
  shift: "morning" | "afternoon";
  checked_in_at: string;
  checked_out_at: string | null;
  verified: boolean;
};

export type LeaveRecord = {
  id: string;
  employee_id: string;
  date: string;
  type: "full" | "half";
  created_at: string;
};
